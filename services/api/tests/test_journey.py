from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from app import service


def advance(client,headers,order_id,action):
    result=client.post(f'/v1/demo/orders/{order_id}/advance',headers=headers,json={'action':action})
    assert result.status_code==200,result.text
    return result.json()


def test_complete_student_journey(client,booking):
    headers,order=booking()
    order_id=order['id']
    assert order['amount']==1000 and order['currency']=='INR' and order['status']=='Pending'
    assert client.post(f'/v1/orders/{order_id}/payment',headers=headers).status_code==409
    assert advance(client,headers,order_id,'load')['status']=='Loaded'
    assert advance(client,headers,order_id,'dispatch')['status']=='Transit'
    arrived=advance(client,headers,order_id,'arrive')
    assert arrived['status']=='Arrived'
    payment=client.post(f'/v1/orders/{order_id}/payment',headers=headers)
    assert payment.status_code==200,payment.text
    assert payment.json()['qr_payload'].startswith('HOSTELXPRESS_DEMO_NONPAYABLE:')
    assert payment.json()['provider']=='demo' and payment.json()['is_demo'] is True
    assert advance(client,headers,order_id,'pay')['status']=='Paid'
    completed=advance(client,headers,order_id,'close_lid')
    assert completed['status']=='Completed' and completed['bot'] is None
    assert [item['status'] for item in completed['timeline']]==['Pending','Loaded','Transit','Arrived','Paid','Completed']
    assert client.get('/v1/bots/'+order['bot_id'],headers=headers).status_code==404


def test_booking_idempotency_and_payload_binding(client,login):
    headers,_=login()
    key=str(uuid4())
    body={'destination_hostel_block':'A','parcel_label':'Dinner'}
    request_headers={**headers,'Idempotency-Key':key}
    first=client.post('/v1/orders',headers=request_headers,json=body)
    repeat=client.post('/v1/orders',headers=request_headers,json=body)
    assert first.status_code==repeat.status_code==201
    assert first.json()['id']==repeat.json()['id']
    changed=client.post('/v1/orders',headers=request_headers,json={**body,'parcel_label':'Other'})
    assert changed.status_code==409


def test_three_compartments_dispatch_on_third_confirmed_load(client,booking):
    entries=[booking(parcel_label=f'Parcel {i}') for i in range(3)]
    assert {item[1]['compartment_id'] for item in entries}=={1,2,3}
    deadline=None
    for index,(headers,order) in enumerate(entries):
        loaded=advance(client,headers,order['id'],'load')
        if index==0:
            deadline=loaded['bot']['load_deadline_at']
        if index==1:
            assert loaded['bot']['load_deadline_at']==deadline
        if index==2:
            assert loaded['status']=='Transit'
    for headers,order in entries:
        assert client.get('/v1/orders/'+order['id'],headers=headers).json()['status']=='Transit'


def test_rider_timeout_releases_only_safe_unloaded_compartment(client,booking,db):
    headers,order=booking()
    with db.connection() as conn:
        conn.execute("UPDATE public.orders SET created_at=now()-interval '6 minutes',rider_due_at=now()-interval '1 minute' WHERE id=%s",(order['id'],))
    service.tick(db)
    failed=client.get('/v1/orders/'+order['id'],headers=headers).json()
    assert failed['status']=='Failed' and failed['failure_reason']=='rider_no_show'
    assert failed['compartment_released_at'] is not None


def test_no_empty_dispatch(client,db):
    with db.connection() as conn:
        conn.execute("UPDATE public.bots SET status='LOADING',last_seen_at=now(),load_started_at=now()-interval '6 minutes',load_deadline_at=now()-interval '1 minute' WHERE is_demo=true")
    service.tick(db)
    with db.connection() as conn:
        assert conn.execute('SELECT status FROM public.bots WHERE is_demo=true').fetchone()['status']=='IDLE_AT_GATE'
        assert conn.execute("SELECT count(*) AS n FROM public.orders WHERE status='Transit'").fetchone()['n']==0


def test_concurrent_idempotent_booking_has_one_effect(client,login):
    headers,_=login()
    request_headers={**headers,'Idempotency-Key':str(uuid4())}
    def submit(_):
        return client.post('/v1/orders',headers=request_headers,json={'destination_hostel_block':'A','parcel_label':'Dinner'})
    with ThreadPoolExecutor(max_workers=4) as executor:
        results=list(executor.map(submit,range(4)))
    assert {r.status_code for r in results}=={201}
    assert len({r.json()['id'] for r in results})==1


def test_unassigned_pending_order_keeps_and_expires_original_deadline(client,booking,db):
    headers,order=booking()
    with db.connection() as conn:
        conn.execute("UPDATE public.orders SET bot_id=NULL,compartment_id=NULL,created_at=now()-interval '6 minutes',rider_due_at=now()-interval '1 minute' WHERE id=%s",(order['id'],))
    service.tick(db)
    expired=client.get('/v1/orders/'+order['id'],headers=headers).json()
    assert expired['status']=='Failed' and expired['failure_reason']=='rider_no_show'
    assert expired['bot_id'] is None and expired['compartment_released_at'] is None
