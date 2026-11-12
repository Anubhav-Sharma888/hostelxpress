"""After Hours pilot: schedule, merchants, frozen quotes, capacity, merchant view.

The backend owns the schedule (wall-clock times in the configured timezone),
the fees, the capacity count, and every status transition. Client input never
sets a price: totals come from the stored quote, and the quote freezes both the
items and the fee at acceptance time so retries or crossing the schedule
boundary cannot silently change what the student agreed to pay.
"""
from __future__ import annotations

import hmac
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException,Request
from psycopg.types.json import Jsonb
from pydantic import Field

from .models import StrictModel

FEE_BY_KIND={'tuck_shop':'tuck_fee_paise','hot_food':'hot_food_fee_paise'}
ACTIVE=('Placed','Accepted','Ready','Loaded')


class QuoteRequest(StrictModel):
    merchant_id: str
    departure_id: str
    items: list[dict] = Field(min_length=1,max_length=10)


class OrderRequest(StrictModel):
    quote_id: str


def _now_ist():
    return datetime.now(ZoneInfo('Asia/Kolkata'))


def _time_in_window(t: time, start: time, end: time) -> bool:
    if start <= end:
        return start <= t <= end
    return t >= start or t <= end  # window crosses midnight


def schedule_state(conn):
    row=conn.execute('SELECT * FROM public.pilot_schedule WHERE id=true').fetchone()
    if not row:
        raise HTTPException(503,'Pilot schedule is not configured')
    now=_now_ist()
    open_now=_time_in_window(now.time(),row['start_local'],row['end_local'])
    return {'start_local':row['start_local'].isoformat(),'end_local':row['end_local'].isoformat(),
            'timezone':row['timezone_name'],'open':open_now,'now_local':now.time().isoformat(),
            'tuck_fee_paise':row['tuck_fee_paise'],'hot_food_fee_paise':row['hot_food_fee_paise']}


def _merchant_by_token(conn,token: str | None):
    if not token:
        raise HTTPException(401,'Merchant staff token required')
    row=conn.execute('SELECT * FROM public.pilot_merchants WHERE staff_token=%s',(token,)).fetchone()
    if not row:
        raise HTTPException(401,'Unknown merchant staff token')
    return row


def _departure_open(conn,departure_id: str,merchant_id: str):
    row=conn.execute('SELECT * FROM public.pilot_departures WHERE id=%s AND merchant_id=%s',
                     (departure_id,merchant_id)).fetchone()
    if not row:
        raise HTTPException(404,'Departure window not found for this merchant')
    return row


def create_quote(conn,user_id,merchant_id,departure_id,items):
    merchant=conn.execute('SELECT * FROM public.pilot_merchants WHERE id=%s',(merchant_id,)).fetchone()
    if not merchant:
        raise HTTPException(404,'Merchant not found')
    schedule=schedule_state(conn)
    if merchant['kind']=='hot_food' and not schedule['open']:
        raise HTTPException(409,'After-hours hot food is only available during the After Hours window')
    departure=_departure_open(conn,departure_id,merchant_id)
    total=0
    detailed=[]
    for entry in items:
        item_id=str(entry.get('item_id',''))
        quantity=entry.get('quantity')
        if not isinstance(quantity,int) or not 1 <= quantity <= 5:
            raise HTTPException(422,'Item quantity must be between 1 and 5')
        item=conn.execute('SELECT * FROM public.pilot_items WHERE id=%s AND merchant_id=%s AND active=true',
                          (item_id,merchant_id)).fetchone()
        if not item:
            raise HTTPException(404,'Catalogue item not found for this merchant')
        total+=item['price_paise']*quantity
        detailed.append({'item_id':str(item['id']),'name':item['name'],'quantity':quantity,'price_paise':item['price_paise']})
    fee=schedule[{'tuck_shop':'tuck_fee_paise','hot_food':'hot_food_fee_paise'}[merchant['kind']]]
    row=conn.execute('INSERT INTO public.pilot_quotes(user_id,merchant_id,departure_id,items_json,fee_paise,total_paise) '
                     'VALUES(%s,%s,%s,%s,%s,%s) RETURNING id,fee_paise,total_paise,created_at',
                     (user_id,merchant_id,departure_id,Jsonb(detailed),fee,total+fee)).fetchone()
    return {'quote_id':str(row['id']),'merchant_id':merchant_id,'departure_id':departure_id,
            'items':detailed,'fee_paise':row['fee_paise'],'total_paise':row['total_paise'],
            'merchant_name':merchant['name'],'merchant_kind':merchant['kind'],
            'hostel_block':merchant['hostel_block']}


def place_order(conn,user_id,quote_id):
    # Serialize competing placements on the departure row so two students can
    # never both claim the last compartment of a window.
    quote=conn.execute('SELECT * FROM public.pilot_quotes WHERE id=%s FOR UPDATE',(quote_id,)).fetchone()
    if not quote or quote['user_id']!=user_id:
        raise HTTPException(404,'Quote not found for this student')
    if _now_ist().astimezone(timezone.utc) - quote['created_at'] > timedelta(minutes=10):
        raise HTTPException(409,'This quote has expired - request a new one for the current price')
    existing=conn.execute("SELECT id FROM public.pilot_orders WHERE quote_id=%s AND status NOT IN ('Rejected','Cancelled')",(quote_id,)).fetchone()
    if existing:
        raise HTTPException(409,'This quote was already used for an order')
    conn.execute('SELECT id FROM public.pilot_departures WHERE id=%s FOR UPDATE',(quote['departure_id'],))
    reserved=conn.execute("SELECT count(*) AS n FROM public.pilot_orders WHERE departure_id=%s AND status NOT IN ('Rejected','Cancelled')",
                          (quote['departure_id'],)).fetchone()['n']
    capacity=conn.execute('SELECT capacity FROM public.pilot_departures WHERE id=%s',(quote['departure_id'],)).fetchone()['capacity']
    if reserved>=capacity:
        raise HTTPException(409,'That departure is full - the last compartment was just claimed')
    row=conn.execute('INSERT INTO public.pilot_orders(user_id,merchant_id,departure_id,quote_id,hostel_block,items_json,fee_paise,total_paise) '
                     'VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id',
                     (user_id,quote['merchant_id'],quote['departure_id'],quote['id'],first_hostel(conn,quote['departure_id']),
                      Jsonb(quote['items_json']),quote['fee_paise'],quote['total_paise'])).fetchone()
    return {'order_id':str(row['id']),'fee_paise':quote['fee_paise'],'total_paise':quote['total_paise'],'status':'Placed'}


def first_hostel(conn,departure_id):
    row=conn.execute('SELECT hostel_block FROM public.pilot_departures WHERE id=%s',(departure_id,)).fetchone()
    return row['hostel_block']


def serialize_order(row):
    return {'order_id':str(row['id']),'status':row['status'],'payment_status':row['payment_status'],
            'items':row['items_json'],'fee_paise':row['fee_paise'],'total_paise':row['total_paise'],
            'merchant_id':str(row['merchant_id']),'hostel_block':row['hostel_block'],
            'insulated_bay':row['insulated_bay'],'rover_requested_at':row['rover_requested_at']}


def _own_order(conn,order_id,user_id):
    row=conn.execute('SELECT * FROM public.pilot_orders WHERE id=%s AND user_id=%s',(order_id,user_id)).fetchone()
    if not row:
        raise HTTPException(404,'Pilot order not found for this student')
    return row


def _merchant_order(conn,merchant_id,order_id):
    row=conn.execute('SELECT * FROM public.pilot_orders WHERE id=%s AND merchant_id=%s',(order_id,merchant_id)).fetchone()
    if not row:
        raise HTTPException(404,'No such order for this merchant')
    return row


def pay_order(conn,user_id,order_id):
    row=_own_order(conn,order_id,user_id)
    if row['payment_status']=='SimPaid':
        raise HTTPException(409,'This order is already paid')
    conn.execute("UPDATE public.pilot_orders SET payment_status='SimPaid' WHERE id=%s",(row['id'],))
    return serialize_order(conn.execute('SELECT * FROM public.pilot_orders WHERE id=%s',(row['id'],)).fetchone())


def merchant_transition(conn,merchant_id,order_id,action):
    row=_merchant_order(conn,merchant_id,order_id)
    if action=='accept':
        if row['status']!='Placed':
            raise HTTPException(409,'Only a Placed order can be accepted')
        conn.execute("UPDATE public.pilot_orders SET status='Accepted' WHERE id=%s",(row['id'],))
        merchant=conn.execute('SELECT * FROM public.pilot_merchants WHERE id=%s',(merchant_id,)).fetchone()
        if merchant['kind']=='hot_food' and not merchant['insulated_bay']:
            free=not conn.execute("SELECT 1 FROM public.pilot_merchants WHERE kind='hot_food' AND insulated_bay IS NOT NULL AND id<>%s",(merchant_id,)).fetchone()
            if free:
                conn.execute("UPDATE public.pilot_merchants SET insulated_bay='Bay 01' WHERE id=%s",(merchant_id,))
                conn.execute("UPDATE public.pilot_orders SET insulated_bay='Bay 01' WHERE id=%s",(row['id'],))
    elif action=='reject':
        if row['status'] not in ('Placed','Accepted'):
            raise HTTPException(409,'Only a Placed or Accepted order can be rejected')
        conn.execute("UPDATE public.pilot_orders SET status='Rejected' WHERE id=%s",(row['id'],))
    elif action=='ready':
        if row['status']!='Accepted':
            raise HTTPException(409,'Only an Accepted order can be marked Ready')
        conn.execute("UPDATE public.pilot_orders SET status='Ready' WHERE id=%s",(row['id'],))
    elif action=='request_rover':
        if row['status']!='Ready':
            raise HTTPException(409,'Mark the order Ready before requesting a rover')
        if not conn.execute("SELECT 1 FROM public.pilot_orders WHERE id=%s AND payment_status='SimPaid'",(row['id'],)).fetchone():
            raise HTTPException(409,'Rover dispatch requires the simulated payment first')
        conn.execute("UPDATE public.pilot_orders SET rover_requested_at=now() WHERE id=%s",(row['id'],))
    elif action=='confirm_loading':
        if row['status']!='Ready' or not row['rover_requested_at']:
            raise HTTPException(409,'Request the rover before confirming loading')
        conn.execute("UPDATE public.pilot_orders SET status='Loaded' WHERE id=%s",(row['id'],))
    else:
        raise HTTPException(422,'Unknown merchant action')
    return serialize_order(conn.execute('SELECT * FROM public.pilot_orders WHERE id=%s',(row['id'],)).fetchone())


def install_routes(app):
    from fastapi import Depends
    from .auth import current_user

    @app.get('/v1/pilot/schedule')
    def pilot_schedule(request:Request,user=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            return schedule_state(conn)

    @app.get('/v1/pilot/merchants')
    def pilot_merchants(request:Request,user=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            merchants=conn.execute('SELECT * FROM public.pilot_merchants ORDER BY kind,name').fetchall()
            result=[]
            for merchant in merchants:
                departures=conn.execute('SELECT * FROM public.pilot_departures WHERE merchant_id=%s ORDER BY window_start',(merchant['id'],)).fetchall()
                windows=[]
                for departure in departures:
                    reserved=conn.execute("SELECT count(*) AS n FROM public.pilot_orders WHERE departure_id=%s AND status NOT IN ('Rejected','Cancelled')",
                                          (departure['id'],)).fetchone()['n']
                    windows.append({'departure_id':str(departure['id']),'hostel_block':departure['hostel_block'],
                                    'window_start':departure['window_start'].isoformat(),'window_end':departure['window_end'].isoformat(),
                                    'capacity':departure['capacity'],'reserved':reserved,
                                    'remaining':max(departure['capacity']-reserved,0)})
                result.append({'merchant_id':str(merchant['id']),'slug':merchant['slug'],'name':merchant['name'],
                               'kind':merchant['kind'],'hostel_block':merchant['hostel_block'],
                               'insulated_bay':merchant['insulated_bay'],'departures':windows})
            return {'schedule':schedule_state(conn),'merchants':result}

    @app.get('/v1/pilot/merchants/{merchant_id}/items')
    def pilot_items(merchant_id:str,request:Request,user=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            rows=conn.execute('SELECT id,name,price_paise FROM public.pilot_items WHERE merchant_id=%s AND active=true ORDER BY name',
                              (merchant_id,)).fetchall()
            return {'items':[{'item_id':str(r['id']),'name':r['name'],'price_paise':r['price_paise']} for r in rows]}

    @app.post('/v1/pilot/quotes')
    def pilot_quote(body:QuoteRequest,request:Request,user=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            return create_quote(conn,user.id,body.merchant_id,body.departure_id,body.items)

    @app.post('/v1/pilot/orders',status_code=201)
    def pilot_order(body:OrderRequest,request:Request,user=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            return place_order(conn,user.id,body.quote_id)

    @app.get('/v1/pilot/orders')
    def pilot_my_orders(request:Request,user=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            rows=conn.execute('SELECT * FROM public.pilot_orders WHERE user_id=%s ORDER BY created_at DESC LIMIT 50',(user.id,)).fetchall()
            return {'orders':[serialize_order(r) for r in rows]}

    @app.post('/v1/pilot/orders/{order_id}/pay')
    def pilot_pay(order_id:str,request:Request,user=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            return pay_order(conn,user.id,order_id)

    @app.get('/v1/pilot/merchant/orders')
    def merchant_orders(request:Request):
        with request.app.state.db.connection() as conn:
            merchant=_merchant_by_token(conn,request.headers.get('X-Pilot-Token'))
            rows=conn.execute('SELECT * FROM public.pilot_orders WHERE merchant_id=%s ORDER BY created_at DESC LIMIT 100',
                              (merchant['id'],)).fetchall()
            return {'orders':[serialize_order(r) for r in rows]}

    @app.post('/v1/pilot/merchant/orders/{order_id}/{action}')
    def merchant_action(order_id:str,action:str,request:Request):
        with request.app.state.db.connection() as conn:
            merchant=_merchant_by_token(conn,request.headers.get('X-Pilot-Token'))
            return merchant_transition(conn,merchant['id'],order_id,action)
