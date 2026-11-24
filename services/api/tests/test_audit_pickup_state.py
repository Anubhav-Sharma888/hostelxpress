from datetime import timedelta
from uuid import uuid4

import pytest
from app import service,pickup_otp_store
from test_rider_otp_integration import delivery,paid_delivery,OTP_SECRET


def prepare(env):
    paid_delivery(env)
    with env['db'].connection() as conn:
        conn.execute('UPDATE public.bots SET last_seen_at=now(),telemetry_observed_at=now() WHERE id=%s',(env['bot'],))
        code=pickup_otp_store.issue_pickup_code(conn,env['order'],env['user'],OTP_SECRET.encode())['code']
    with env['db'].connection() as conn:
        result=pickup_otp_store.redeem_pickup_code(conn,env['order'],env['bot'],2,code,OTP_SECRET.encode())
        assert result['accepted']
    return result['command_id']


def view(env,order_id=None):
    with env['db'].connection() as conn:
        return service.own_order(conn,order_id or env['order'],env['user'])


def test_other_bay_open_does_not_claim_this_paid_order_is_open(delivery):
    e=delivery; command=prepare(e); second=uuid4()
    with e['db'].connection() as conn:
        conn.execute("INSERT INTO public.orders(id,user_id,bot_id,compartment_id,status,destination_hostel_block,is_demo,arrived_at,paid_at) VALUES(%s,%s,%s,1,'Paid','B',false,now(),now())",(second,e['user'],e['bot']))
        conn.execute("INSERT INTO public.transactions(order_id,status,razorpay_payment_id,razorpay_qr_id,is_demo,captured_at) VALUES(%s,'Captured',%s,%s,false,now())",(second,'pay_fixture_'+str(uuid4()),'qr_fixture_'+str(uuid4())))
        conn.execute("UPDATE public.bots SET status='UNLOCKED' WHERE id=%s",(e['bot'],))
        conn.execute("UPDATE hostelxpress_private.command_outbox SET status='executed',acknowledged_at=now(),attempts=1 WHERE id=%s",(command,))
        conn.execute('UPDATE hostelxpress_private.compartment_state SET inner_closed=false,is_empty=false,observed_at=now() WHERE bot_id=%s AND compartment_id=2',(e['bot'],))
    assert view(e)['pickup_state']=='open'
    assert view(e,second)['pickup_state']=='otp_required'


@pytest.mark.parametrize('status',['pending','published','rejected','expired'])
def test_own_command_state_does_not_imply_actuation(delivery,status):
    e=delivery; command=prepare(e)
    with e['db'].connection() as conn:
        conn.execute('UPDATE hostelxpress_private.command_outbox SET status=%s WHERE id=%s',(status,command))
    expected='unlock_pending' if status in {'pending','published'} else 'reconciliation_required'
    assert view(e)['pickup_state']==expected


@pytest.mark.parametrize('observation',['closed','stale','future','no_ack','wrong_bay'])
def test_executed_command_requires_fresh_correlated_open_observation(delivery,observation):
    e=delivery; command=prepare(e)
    with e['db'].connection() as conn:
        conn.execute("UPDATE hostelxpress_private.command_outbox SET status='executed',acknowledged_at=now(),attempts=1 WHERE id=%s",(command,))
        conn.execute('UPDATE hostelxpress_private.compartment_state SET inner_closed=false,observed_at=now() WHERE bot_id=%s AND compartment_id=2',(e['bot'],))
        if observation=='closed':conn.execute('UPDATE hostelxpress_private.compartment_state SET inner_closed=true WHERE bot_id=%s AND compartment_id=2',(e['bot'],))
        elif observation in {'stale','future'}:
            stamp=service.now()+timedelta(seconds=-30 if observation=='stale' else 30)
            conn.execute('UPDATE hostelxpress_private.compartment_state SET observed_at=%s WHERE bot_id=%s AND compartment_id=2',(stamp,e['bot']))
        elif observation=='no_ack':conn.execute('UPDATE hostelxpress_private.command_outbox SET acknowledged_at=NULL WHERE id=%s',(command,))
        else:conn.execute('UPDATE hostelxpress_private.command_outbox SET compartment=3 WHERE id=%s',(command,))
    assert view(e)['pickup_state']!='open'


def test_ack_does_not_reuse_prior_future_closed_snapshot_as_open_proof(delivery,monkeypatch):
    import json
    from test_rider_otp_integration import signed_request
    e=delivery; command=prepare(e); start=service.now(); boot=str(uuid4())
    def stamp(value):return value.isoformat().replace('+00:00','Z')
    def telemetry(sequence,opened):
        return {'schema_version':1,'message_type':'telemetry','message_id':str(uuid4()),'bot_id':str(e['bot']),
                'sent_at':stamp(start),'observed_at':stamp(start+timedelta(seconds=1.5+sequence*.1)),
                'boot_id':boot,'sequence':sequence,'clock_synchronized':True,'current_lat':None,'current_lng':None,
                'battery_level':90,'compartments':[{'compartment':i,'outer_closed':True,'inner_closed':not (opened and i==2),'is_empty':i!=2} for i in (1,2,3)]}
    path=f"/v1/devices/{e['bot']}/messages"
    r=signed_request(e,path,telemetry(0,False));assert r.status_code==200,r.text
    with e['db'].connection() as conn:
        conn.execute("UPDATE hostelxpress_private.command_outbox SET status='published',attempts=1 WHERE id=%s",(command,))
    ack={'schema_version':1,'message_type':'ack','message_id':str(uuid4()),'bot_id':str(e['bot']),
         'sent_at':stamp(start),'command_id':str(command),'order_id':str(e['order']),'compartment':2,'result':'executed'}
    r=signed_request(e,path,ack);assert r.status_code==200,r.text
    monkeypatch.setattr(service,'now',lambda:start+timedelta(seconds=2))
    assert view(e)['pickup_state']!='open'
    r=signed_request(e,path,telemetry(1,True));assert r.status_code==200,r.text
    assert view(e)['pickup_state']=='open'
    # A new transport receipt for the same execution cannot invalidate newer sensors.
    r=signed_request(e,path,{**ack,'message_id':str(uuid4())});assert r.status_code==200,r.text
    assert view(e)['pickup_state']=='open'


@pytest.mark.parametrize('full',[False,True])
def test_partial_lid_event_cannot_borrow_a_newer_closed_snapshot(delivery,monkeypatch,full):
    from test_rider_otp_integration import signed_request
    e=delivery; command=prepare(e); at=service.now(); path=f"/v1/devices/{e['bot']}/messages"
    with e['db'].connection() as conn:
        conn.execute("UPDATE hostelxpress_private.command_outbox SET status='executed',acknowledged_at=now(),attempts=1 WHERE id=%s",(command,))
        conn.execute('UPDATE hostelxpress_private.compartment_state SET inner_closed=true,observed_at=now() WHERE bot_id=%s AND compartment_id=2',(e['bot'],))
    observed=at+timedelta(seconds=.1) if full else at-timedelta(seconds=20)
    body={'schema_version':1,'message_type':'event','message_id':str(uuid4()),'bot_id':str(e['bot']),
          'sent_at':at.isoformat().replace('+00:00','Z'),'observed_at':observed.isoformat().replace('+00:00','Z'),
          'event_type':'inner_lid_opened','order_id':str(e['order']),'compartment':2,'command_id':str(command)}
    if full:body.update(outer_closed=True,inner_closed=False,is_empty=False)
    monkeypatch.setattr(service,'now',lambda:at+timedelta(seconds=1))
    r=signed_request(e,path,body);assert r.status_code==200,r.text
    assert (view(e)['pickup_state']=='open') is full
