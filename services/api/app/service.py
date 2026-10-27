from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException
from psycopg.types.json import Jsonb

TERMINAL = {'Completed','Failed'}
DEMO_BOT_ID = UUID('20000000-0000-4000-8000-000000000001')


def now():
    return datetime.now(timezone.utc)


def event(conn, order_id, status, label):
    conn.execute('INSERT INTO public.order_events(order_id,status,label) VALUES(%s,%s,%s)', (order_id,status,label))


def get_profile(conn, user_id):
    profile = conn.execute('SELECT id,name,hostel_block FROM public.users WHERE id=%s',(user_id,)).fetchone()
    if not profile:
        raise HTTPException(404,'Student profile not found; complete Supabase signup first')
    return profile


def bot_summary(row):
    if not row:
        return None
    return {key:row[key] for key in ('id','status','battery_level','current_lat','current_lng','last_seen_at','telemetry_observed_at','load_deadline_at')}


def serialize_order(conn, row):
    item = dict(row)
    bot = None
    if item['bot_id'] and item['status'] not in TERMINAL:
        bot = bot_summary(conn.execute('SELECT * FROM public.bots WHERE id=%s',(item['bot_id'],)).fetchone())
    item['bot'] = bot
    item['timeline'] = conn.execute('SELECT id,status,at,label FROM public.order_events WHERE order_id=%s ORDER BY at,id',(item['id'],)).fetchall()
    payment = conn.execute('SELECT status FROM public.transactions WHERE order_id=%s ORDER BY created_at DESC,id DESC LIMIT 1',(item['id'],)).fetchone()
    item['payment_status'] = payment['status'] if payment else None
    item.pop('request_fingerprint',None)
    item.pop('idempotency_key',None)
    return item


def own_order(conn, order_id, user_id):
    row = conn.execute('SELECT * FROM public.orders WHERE id=%s AND user_id=%s',(order_id,user_id)).fetchone()
    if not row:
        raise HTTPException(404,'Order not found')
    return serialize_order(conn,row)


def lock_order(conn, order_id, user_id=None):
    params = [order_id]
    where = 'id=%s'
    if user_id is not None:
        where += ' AND user_id=%s'
        params.append(user_id)
    preview = conn.execute('SELECT bot_id FROM public.orders WHERE '+where,params).fetchone()
    if not preview:
        raise HTTPException(404,'Order not found')
    bot = conn.execute('SELECT * FROM public.bots WHERE id=%s FOR UPDATE',(preview['bot_id'],)).fetchone() if preview['bot_id'] else None
    order = conn.execute('SELECT * FROM public.orders WHERE '+where+' FOR UPDATE',params).fetchone()
    if not order or order['bot_id'] != preview['bot_id']:
        raise HTTPException(409,'Assignment changed; retry the request')
    return order,bot


def ensure_demo(conn):
    # Demo identity insertion is permitted only with the local test Auth fixture.
    real_auth = conn.execute("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='instance_id') AS real").fetchone()['real']
    if real_auth:
        raise RuntimeError('Demo mode refuses a real Supabase Auth database; use a separate local fixture database')
    conn.execute("INSERT INTO public.bots(id,status,battery_level,current_lat,current_lng,is_demo,last_seen_at) VALUES(%s,'IDLE_AT_GATE',98,12.9716,77.5946,true,now()) ON CONFLICT(id) DO NOTHING",(DEMO_BOT_ID,))
    conn.execute('INSERT INTO hostelxpress_private.device_state(bot_id,clock_synchronized) VALUES(%s,true) ON CONFLICT DO NOTHING',(DEMO_BOT_ID,))
    for compartment in range(1,4):
        conn.execute('INSERT INTO hostelxpress_private.compartment_state(bot_id,compartment_id,outer_closed,inner_closed,is_empty,observed_at) VALUES(%s,%s,true,true,true,now()) ON CONFLICT DO NOTHING',(DEMO_BOT_ID,compartment))


def book(conn, user_id, booking, key, is_demo):
    fingerprint = hashlib.sha256(json.dumps(booking.model_dump(),sort_keys=True,separators=(',',':')).encode()).hexdigest()
    advisory = int.from_bytes(hashlib.sha256((str(user_id)+str(key)).encode()).digest()[:8],'big',signed=True)
    conn.execute('SELECT pg_advisory_xact_lock(%s)',(advisory,))
    existing = conn.execute('SELECT * FROM public.orders WHERE user_id=%s AND idempotency_key=%s',(user_id,key)).fetchone()
    if existing:
        if existing['request_fingerprint'] != fingerprint:
            raise HTTPException(409,'This Idempotency-Key was already used for different booking details')
        return serialize_order(conn,existing)
    get_profile(conn,user_id)
    if is_demo:
        # An explicit local simulator operation produces a synthetic heartbeat.
        conn.execute('UPDATE public.bots SET last_seen_at=now() WHERE is_demo=true')
        conn.execute('UPDATE hostelxpress_private.compartment_state SET observed_at=now() WHERE bot_id IN (SELECT id FROM public.bots WHERE is_demo=true)')
    selected = None
    compartment = None
    for bot in conn.execute("SELECT * FROM public.bots WHERE status IN ('IDLE_AT_GATE','LOADING') AND is_demo=%s ORDER BY id FOR UPDATE SKIP LOCKED",(is_demo,)).fetchall():
        if not safe_bot(conn,bot):
            continue
        occupied = {r['compartment_id'] for r in conn.execute('SELECT compartment_id FROM public.orders WHERE bot_id=%s AND compartment_released_at IS NULL FOR UPDATE',(bot['id'],)).fetchall()}
        for candidate in range(1,4):
            state = conn.execute('SELECT * FROM hostelxpress_private.compartment_state WHERE bot_id=%s AND compartment_id=%s',(bot['id'],candidate)).fetchone()
            if candidate not in occupied and state and state['is_empty'] is True and state['outer_closed'] is True and state['inner_closed'] is True:
                selected,compartment = bot,candidate
                break
        if selected:
            break
    if not selected:
        raise HTTPException(409,'No secure compartment is currently available; try again shortly')
    order = conn.execute('INSERT INTO public.orders(user_id,bot_id,compartment_id,destination_hostel_block,parcel_label,idempotency_key,request_fingerprint,is_demo) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *',
                         (user_id,selected['id'],compartment,booking.destination_hostel_block,booking.parcel_label,key,fingerprint,is_demo)).fetchone()
    event(conn,order['id'],'Pending','Compartment reserved; rider has five minutes to load')
    return serialize_order(conn,order)


def safe_bot(conn, bot, at=None, *, require_all=True):
    at = at or now()
    if not bot or bot['status']=='FAULT_MODE' or not bot['last_seen_at'] or (at-bot['last_seen_at']).total_seconds()>15:
        return False
    device = conn.execute('SELECT * FROM hostelxpress_private.device_state WHERE bot_id=%s',(bot['id'],)).fetchone()
    if not device or not device['clock_synchronized']:
        return False
    states = conn.execute('SELECT * FROM hostelxpress_private.compartment_state WHERE bot_id=%s',(bot['id'],)).fetchall()
    return len(states)==3 and all(s['outer_closed'] is True and s['inner_closed'] is True and s['observed_at'] is not None and (at-s['observed_at']).total_seconds()<=15 for s in states)


def dispatch(conn, bot_id, *, virtual_deadline=False):
    bot = conn.execute('SELECT * FROM public.bots WHERE id=%s FOR UPDATE',(bot_id,)).fetchone()
    if not bot or bot['status'] != 'LOADING':
        return False
    orders = conn.execute('SELECT * FROM public.orders WHERE bot_id=%s AND compartment_released_at IS NULL ORDER BY id FOR UPDATE',(bot_id,)).fetchall()
    loaded = [order for order in orders if order['status']=='Loaded']
    evaluation_time = bot['load_deadline_at'] if virtual_deadline else now()
    due = bool(bot['load_deadline_at'] and evaluation_time >= bot['load_deadline_at'])
    if not (len(loaded)==3 or due):
        return False
    # The demo advances only the batch clock. Physical freshness is checked at real receive time.
    if not safe_bot(conn,bot):
        return False
    for order in orders:
        if order['status'] != 'Pending':
            continue
        state = conn.execute('SELECT * FROM hostelxpress_private.compartment_state WHERE bot_id=%s AND compartment_id=%s',(bot_id,order['compartment_id'])).fetchone()
        if not state or state['is_empty'] is not True:
            return False
        if order['rider_due_at'] <= evaluation_time:
            conn.execute("UPDATE public.orders SET status='Failed',failed_at=now(),failure_reason='rider_no_show',compartment_released_at=now() WHERE id=%s",(order['id'],))
            event(conn,order['id'],'Failed','Rider did not load before the five-minute deadline')
        else:
            # Preserve the rider's original deadline; another bot can reserve later.
            conn.execute('UPDATE public.orders SET bot_id=NULL,compartment_id=NULL WHERE id=%s',(order['id'],))
            event(conn,order['id'],'Pending','Waiting for another bot; original rider deadline retained')
    if not loaded:
        conn.execute("UPDATE public.bots SET status='IDLE_AT_GATE',load_started_at=NULL,load_deadline_at=NULL WHERE id=%s",(bot_id,))
        return False
    for order in loaded:
        conn.execute("UPDATE public.orders SET status='Transit' WHERE id=%s",(order['id'],))
        event(conn,order['id'],'Transit','Dispatch rule met; delivery is in transit')
    conn.execute("UPDATE public.bots SET status='TRANSIT' WHERE id=%s",(bot_id,))
    return True


def loaded(conn, order, bot):
    if order['status'] != 'Pending' or not bot or bot['status'] != 'LOADING' or bot['load_started_at'] is None:
        raise HTTPException(409,'This reservation is not awaiting a rider load')
    if order['rider_due_at'] <= now():
        raise HTTPException(409,'The rider loading deadline has expired')
    state = conn.execute('SELECT * FROM hostelxpress_private.compartment_state WHERE bot_id=%s AND compartment_id=%s',(bot['id'],order['compartment_id'])).fetchone()
    if not state or state['outer_closed'] is not True or state['inner_closed'] is not True or state['is_empty'] is not False:
        raise HTTPException(409,'Loading requires a confirmed parcel and both lids securely closed')
    conn.execute("UPDATE public.orders SET status='Loaded',loaded_at=now() WHERE id=%s",(order['id'],))
    event(conn,order['id'],'Loaded','Rider loaded the parcel and closed the outer lid')
    dispatch(conn,bot['id'])


def arrived(conn, order, bot):
    if order['status'] != 'Transit' or not bot or bot['status'] not in {'TRANSIT','AT_HOSTEL'}:
        raise HTTPException(409,'Only an in-transit assigned delivery can arrive')
    conn.execute("UPDATE public.orders SET status='Arrived',arrived_at=now() WHERE id=%s",(order['id'],))
    conn.execute("UPDATE public.bots SET status='AT_HOSTEL' WHERE id=%s",(bot['id'],))
    event(conn,order['id'],'Arrived','Bot reported arrival; payment is available')


def enqueue_unlock(conn, order, bot, *, is_demo=False):
    if not bot or bot['status'] not in {'AT_HOSTEL','UNLOCKED'} or not safe_bot(conn,bot):
        return False
    state = conn.execute('SELECT * FROM hostelxpress_private.compartment_state WHERE bot_id=%s AND compartment_id=%s',(bot['id'],order['compartment_id'])).fetchone()
    if not state or state['is_empty'] is not False:
        return False
    paid = conn.execute("SELECT id FROM public.transactions WHERE order_id=%s AND status='Captured' AND amount=1000 AND currency='INR' AND is_demo=%s",(order['id'],is_demo)).fetchone()
    if not paid:
        return False
    conn.execute("INSERT INTO hostelxpress_private.command_outbox(order_id,bot_id,compartment,command,is_demo,status) VALUES(%s,%s,%s,'unlock_inner',%s,%s) ON CONFLICT(order_id,command) DO NOTHING",(order['id'],bot['id'],order['compartment_id'],is_demo,'executed' if is_demo else 'pending'))
    if is_demo:
        conn.execute("UPDATE public.bots SET status='UNLOCKED' WHERE id=%s",(bot['id'],))
    return True


def completed(conn, order, bot):
    if order['status'] != 'Paid':
        raise HTTPException(409,'Collection requires verified payment first')
    command = conn.execute("SELECT * FROM hostelxpress_private.command_outbox WHERE order_id=%s AND command='unlock_inner' AND status='executed'",(order['id'],)).fetchone()
    state = conn.execute('SELECT * FROM hostelxpress_private.compartment_state WHERE bot_id=%s AND compartment_id=%s',(bot['id'],order['compartment_id'])).fetchone()
    fresh=bool(state and state['observed_at'] and (now()-state['observed_at']).total_seconds()<=15 and bot['last_seen_at'] and (now()-bot['last_seen_at']).total_seconds()<=15 and bot['status']!='FAULT_MODE')
    if not command or not fresh or state['inner_closed'] is not True or state['outer_closed'] is not True or state['is_empty'] is not True:
        raise HTTPException(409,'Collection needs executed unlock, a fresh empty/closed compartment snapshot, and a healthy device')
    conn.execute("UPDATE public.orders SET status='Completed',completed_at=now(),compartment_released_at=now() WHERE id=%s",(order['id'],))
    event(conn,order['id'],'Completed','Student collected parcel and the inner lid closed')
    remaining = conn.execute('SELECT count(*) AS count FROM public.orders WHERE bot_id=%s AND compartment_released_at IS NULL',(bot['id'],)).fetchone()['count']
    next_state = 'AT_HOSTEL' if remaining else ('IDLE_AT_GATE' if order['is_demo'] else 'RETURNING')
    conn.execute('UPDATE public.bots SET status=%s,load_started_at=NULL,load_deadline_at=NULL WHERE id=%s',(next_state,bot['id']))


def demo_advance(conn, order_id, user_id, action):
    order,bot = lock_order(conn,order_id,user_id)
    if not order['is_demo'] or not bot or not bot['is_demo']:
        raise HTTPException(404,'Demo order not found')
    conn.execute('UPDATE public.bots SET last_seen_at=now() WHERE id=%s',(bot['id'],))
    conn.execute('UPDATE hostelxpress_private.compartment_state SET observed_at=now() WHERE bot_id=%s',(bot['id'],))
    bot = conn.execute('SELECT * FROM public.bots WHERE id=%s',(bot['id'],)).fetchone()
    if action=='load':
        if bot['status']=='IDLE_AT_GATE':
            # One explicit demo operation simulates the authorized first outer-lid attempt.
            conn.execute("UPDATE public.bots SET status='LOADING',load_started_at=now(),load_deadline_at=now()+interval '5 minutes' WHERE id=%s",(bot['id'],))
            bot = conn.execute('SELECT * FROM public.bots WHERE id=%s',(bot['id'],)).fetchone()
        conn.execute('UPDATE hostelxpress_private.compartment_state SET outer_closed=true,inner_closed=true,is_empty=false,observed_at=now() WHERE bot_id=%s AND compartment_id=%s',(bot['id'],order['compartment_id']))
        loaded(conn,order,bot)
    elif action=='dispatch':
        if order['status'] != 'Loaded':
            raise HTTPException(409,'Load the parcel before simulating the five-minute dispatch deadline')
        if not dispatch(conn,bot['id'],virtual_deadline=True):
            raise HTTPException(409,'Dispatch interlocks or loading conditions are not satisfied')
    elif action=='arrive':
        arrived(conn,order,bot)
    elif action=='pay':
        if order['status'] != 'Arrived':
            raise HTTPException(409,'The bot must arrive before demo payment')
        payment = conn.execute("SELECT * FROM public.transactions WHERE order_id=%s AND is_demo=true AND status='Pending' FOR UPDATE",(order_id,)).fetchone()
        if not payment:
            raise HTTPException(409,'Create a demo payment QR first')
        conn.execute("UPDATE public.transactions SET status='Captured',razorpay_payment_id=%s,captured_at=now() WHERE id=%s",('demo_pay_'+str(uuid4()),payment['id']))
        conn.execute("UPDATE public.orders SET status='Paid',paid_at=now() WHERE id=%s",(order_id,))
        event(conn,order_id,'Paid','Demo payment simulated; no money moved')
        if not enqueue_unlock(conn,order,bot,is_demo=True):
            raise HTTPException(409,'Demo unlock interlocks are not satisfied')
    elif action=='close_lid':
        conn.execute('UPDATE hostelxpress_private.compartment_state SET outer_closed=true,inner_closed=true,is_empty=true,observed_at=now() WHERE bot_id=%s AND compartment_id=%s',(bot['id'],order['compartment_id']))
        completed(conn,order,bot)
    return own_order(conn,order_id,user_id)


def tick(db):
    with db.connection() as conn:
        bots = conn.execute("SELECT * FROM public.bots WHERE status IN ('IDLE_AT_GATE','LOADING','AT_HOSTEL','UNLOCKED') ORDER BY id FOR UPDATE SKIP LOCKED").fetchall()
        for bot in bots:
            orders = conn.execute('SELECT * FROM public.orders WHERE bot_id=%s AND compartment_released_at IS NULL ORDER BY id FOR UPDATE',(bot['id'],)).fetchall()
            for order in orders:
                if order['status']=='Pending' and order['rider_due_at'] <= now():
                    state = conn.execute('SELECT * FROM hostelxpress_private.compartment_state WHERE bot_id=%s AND compartment_id=%s',(bot['id'],order['compartment_id'])).fetchone()
                    releasable = bool(state and state['is_empty'] is True and safe_bot(conn,bot))
                    conn.execute("UPDATE public.orders SET status='Failed',failed_at=now(),failure_reason='rider_no_show',compartment_released_at=CASE WHEN %s THEN now() ELSE NULL END WHERE id=%s",(releasable,order['id']))
                    event(conn,order['id'],'Failed','Rider no-show after five minutes')
                if order['status']=='Paid' and not order['is_demo']:
                    enqueue_unlock(conn,order,bot)
            dispatch(conn,bot['id'])
        # A dispatched bot requeues its unloaded reservations while their rider
        # deadline still runs; without re-reservation such an order could never
        # reach a bot again and would fail deterministically at that deadline.
        waiting = conn.execute("SELECT * FROM public.orders WHERE bot_id IS NULL AND status='Pending' AND rider_due_at>now() ORDER BY id FOR UPDATE SKIP LOCKED").fetchall()
        for order in waiting:
            for bot in conn.execute("SELECT * FROM public.bots WHERE status IN ('IDLE_AT_GATE','LOADING') AND is_demo=%s ORDER BY id FOR UPDATE SKIP LOCKED",(order['is_demo'],)).fetchall():
                if not safe_bot(conn,bot):
                    continue
                occupied = {r['compartment_id'] for r in conn.execute('SELECT compartment_id FROM public.orders WHERE bot_id=%s AND compartment_released_at IS NULL',(bot['id'],)).fetchall()}
                for candidate in range(1,4):
                    if candidate in occupied:
                        continue
                    state = conn.execute('SELECT * FROM hostelxpress_private.compartment_state WHERE bot_id=%s AND compartment_id=%s',(bot['id'],candidate)).fetchone()
                    if state and state['is_empty'] is True and state['outer_closed'] is True and state['inner_closed'] is True:
                        conn.execute('UPDATE public.orders SET bot_id=%s,compartment_id=%s WHERE id=%s',(bot['id'],candidate,order['id']))
                        event(conn,order['id'],'Pending','Re-reserved on an available bot; original rider deadline kept')
                        break
                else:
                    continue
                break
        queued=conn.execute("SELECT * FROM public.orders WHERE bot_id IS NULL AND status='Pending' AND rider_due_at<=now() ORDER BY id FOR UPDATE SKIP LOCKED").fetchall()
        for order in queued:
            conn.execute("UPDATE public.orders SET status='Failed',failed_at=now(),failure_reason='rider_no_show' WHERE id=%s",(order['id'],))
            event(conn,order['id'],'Failed','Rider deadline expired while waiting for another bot')
        conn.execute("UPDATE hostelxpress_private.command_outbox SET status='expired',last_error='command_ttl_expired' WHERE status IN ('pending','published') AND expires_at<now()")
