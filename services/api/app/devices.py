from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import datetime,timezone
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException,Request
from jsonschema import Draft202012Validator,FormatChecker
from psycopg.types.json import Jsonb

from . import service

SCHEMA=json.loads((Path(__file__).resolve().parents[3]/'contracts/mqtt/wire.schema.json').read_text())
VALIDATOR=Draft202012Validator(SCHEMA,format_checker=FormatChecker())


def parse_message(raw,bot_id,*,check_freshness=True):
    if len(raw)>16384:
        raise HTTPException(413,'Device messages must not exceed 16 KiB')
    try:
        message=json.loads(raw)
        VALIDATOR.validate(message)
    except Exception:
        raise HTTPException(422,'Device message does not match the canonical MQTT v1 schema') from None
    if message['bot_id']!=str(bot_id):
        raise HTTPException(403,'Authenticated bot and payload identity do not match')
    if check_freshness and freshness_reason(message):
        raise HTTPException(409,'Device message is stale or future dated')
    return message


def freshness_reason(message):
    for field in ('sent_at','observed_at'):
        if field in message:
            stamp=datetime.fromisoformat(message[field].replace('Z','+00:00'))
            age=(service.now()-stamp).total_seconds()
            if age>30 or age< -2:
                return 'stale_or_future_device_observation'
    return None


def stored_receipt(conn,bot_id,message,digest,*,reason=None):
    outcome='reconciliation_required' if reason else 'applied'
    conn.execute('INSERT INTO hostelxpress_private.device_events(bot_id,message_id,payload_sha256,event_type,payload,outcome,reconciliation_reason) VALUES(%s,%s,%s,%s,%s,%s,%s)',
                 (bot_id,message['message_id'],digest,message.get('event_type',message['message_type']),Jsonb(message),outcome,reason))
    return {'stored':True,'message_id':message['message_id'],'duplicate':False,'reconciliation_required':bool(reason)}


def verify_http(conn,bot_id,raw,timestamp,signature,path):
    try:
        if timestamp is None or abs(service.now().timestamp()-int(timestamp))>30:
            raise ValueError()
    except (ValueError,TypeError):
        raise HTTPException(401,'Device request timestamp is invalid') from None
    credential=conn.execute('SELECT secret FROM hostelxpress_private.device_credentials WHERE bot_id=%s AND enabled=true',(bot_id,)).fetchone()
    if not credential:
        raise HTTPException(401,'Unknown or revoked device identity')
    expected=hmac.new(bytes(credential['secret']),f'{timestamp}.POST.{path}.'.encode()+raw,hashlib.sha256).hexdigest()
    if signature is None or len(signature)!=64 or not hmac.compare_digest(expected,signature):
        raise HTTPException(401,'Invalid device signature')


def update_sensor(conn,bot_id,compartment,values,*,observed_at=None):
    existing=conn.execute('SELECT * FROM hostelxpress_private.compartment_state WHERE bot_id=%s AND compartment_id=%s',(bot_id,compartment)).fetchone()
    if not existing:
        raise HTTPException(409,'Compartment is not provisioned')
    full_snapshot=all(field in values for field in ('outer_closed','inner_closed','is_empty'))
    snapshot_time=datetime.fromisoformat(observed_at.replace('Z','+00:00')) if full_snapshot and observed_at else existing['observed_at']
    conn.execute('UPDATE hostelxpress_private.compartment_state SET outer_closed=%s,inner_closed=%s,is_empty=%s,observed_at=%s WHERE bot_id=%s AND compartment_id=%s',
                 (values.get('outer_closed',existing['outer_closed']),values.get('inner_closed',existing['inner_closed']),values.get('is_empty',existing['is_empty']),snapshot_time,bot_id,compartment))


def matching_command(conn,bot_id,order_id,compartment,command_id,command=None,*,executed=False):
    if not command_id:
        raise HTTPException(409,'A correlated server command is required')
    row=conn.execute('SELECT * FROM hostelxpress_private.command_outbox WHERE id=%s AND bot_id=%s AND order_id=%s AND compartment=%s AND is_demo=false FOR UPDATE',(command_id,bot_id,order_id,compartment)).fetchone()
    if not row or (command and row['command']!=command) or (executed and row['status']!='executed'):
        raise HTTPException(409,'Command does not match this device, order, compartment, or execution state')
    return row


def ingest(conn,bot_id,raw,*,via_mqtt=False):
    message=parse_message(raw,bot_id,check_freshness=False)
    kind=message['message_type']
    if kind=='command':
        raise HTTPException(403,'Devices cannot publish server commands')
    bot=conn.execute('SELECT * FROM public.bots WHERE id=%s AND is_demo=false FOR UPDATE',(bot_id,)).fetchone()
    if not bot:
        raise HTTPException(404,'Provisioned live bot not found')
    enabled=conn.execute('SELECT enabled FROM hostelxpress_private.device_credentials WHERE bot_id=%s',(bot_id,)).fetchone()
    if not enabled or not enabled['enabled']:
        raise HTTPException(401,'Device identity is revoked')
    digest=hashlib.sha256(raw).hexdigest()
    previous=conn.execute('SELECT payload_sha256,outcome FROM hostelxpress_private.device_events WHERE bot_id=%s AND message_id=%s',(bot_id,message['message_id'])).fetchone()
    if previous:
        if previous['payload_sha256']!=digest:
            raise HTTPException(409,'Device message ID was reused with a different body')
        return {'stored':True,'message_id':message['message_id'],'duplicate':True,'reconciliation_required':previous['outcome']=='reconciliation_required'}
    freshness=freshness_reason(message)
    if freshness:
        if kind in {'event','ack'}:
            if message.get('order_id') and not conn.execute('SELECT 1 FROM public.orders WHERE id=%s AND bot_id=%s AND compartment_id=%s',(message['order_id'],bot_id,message.get('compartment'))).fetchone():
                raise HTTPException(403,'Device observation is not bound to this bot/order/compartment')
            return stored_receipt(conn,bot_id,message,digest,reason=freshness)
        raise HTTPException(409,'Device message is stale or future dated')
    if kind in {'telemetry','state'}:
        device=conn.execute('SELECT * FROM hostelxpress_private.device_state WHERE bot_id=%s FOR UPDATE',(bot_id,)).fetchone()
        boot=UUID(message['boot_id'])
        if boot in device['retired_boots']:
            raise HTTPException(409,'A retired device boot cannot resume')
        if device['boot_id']==boot and message['sequence']<=device['sequence']:
            raise HTTPException(409,'Out-of-order device sequence')
        retired=list(device['retired_boots'])
        if device['boot_id'] and device['boot_id']!=boot:
            retired.append(device['boot_id'])
        clock_health=message.get('clock_synchronized',False) if kind=='telemetry' else (device['clock_synchronized'] if device['boot_id']==boot else False)
        conn.execute('UPDATE hostelxpress_private.device_state SET boot_id=%s,sequence=%s,retired_boots=%s,clock_synchronized=%s,updated_at=now() WHERE bot_id=%s',(boot,message['sequence'],retired,clock_health,bot_id))
    if kind=='telemetry':
        conn.execute('UPDATE public.bots SET current_lat=%s,current_lng=%s,battery_level=%s,last_seen_at=now(),telemetry_observed_at=%s WHERE id=%s',(message['current_lat'],message['current_lng'],message['battery_level'],message['observed_at'],bot_id))
        for compartment in message.get('compartments',[]):
            update_sensor(conn,bot_id,compartment['compartment'],compartment,observed_at=message['observed_at'])
    elif kind=='state':
        if message['status']=='FAULT_MODE':
            conn.execute("UPDATE public.bots SET status='FAULT_MODE',fault_reason='device_reported_fault',last_seen_at=now() WHERE id=%s",(bot_id,))
        elif message['status']=='IDLE_AT_GATE' and bot['status']=='RETURNING':
            occupied=conn.execute('SELECT 1 FROM public.orders WHERE bot_id=%s AND compartment_released_at IS NULL LIMIT 1',(bot_id,)).fetchone()
            if occupied or not service.safe_bot(conn,bot):
                raise HTTPException(409,'Return-to-gate needs safe empty compartments and fresh telemetry')
            conn.execute("UPDATE public.bots SET status='IDLE_AT_GATE',load_started_at=NULL,load_deadline_at=NULL,last_seen_at=now() WHERE id=%s",(bot_id,))
        elif message['status']!=bot['status']:
            raise HTTPException(409,'Telemetry cannot skip server delivery-state transitions')
    elif kind=='availability':
        if not message['online']:
            conn.execute('UPDATE public.bots SET last_seen_at=NULL WHERE id=%s',(bot_id,))
        # Online presence alone never refreshes authoritative safety telemetry.
    elif kind in {'event','ack'}:
        event_type=message.get('event_type')
        if event_type in {'camera_evidence_uploaded','camera_buffer_deleted'}:
            raise HTTPException(501,'Camera storage verification and cleanup authorization are not configured')
        order=None
        if message.get('order_id'):
            order=conn.execute('SELECT * FROM public.orders WHERE id=%s AND bot_id=%s AND compartment_id=%s AND compartment_released_at IS NULL FOR UPDATE',(message['order_id'],bot_id,message.get('compartment'))).fetchone()
            if not order:
                raise HTTPException(403,'Device event is not bound to this order and compartment')
        if kind=='ack':
            if not order or order['status'] in service.TERMINAL:
                raise HTTPException(409,'Command acknowledgement requires a current assigned order')
            command=matching_command(conn,bot_id,order['id'],order['compartment_id'],message['command_id'])
            if message['result']=='executed':
                if bot['status']=='FAULT_MODE':
                    raise HTTPException(409,'Fault state cannot be cleared by an execution acknowledgement')
                if command['status']=='expired' or (command['status']!='executed' and command['expires_at']<service.now()):
                    return stored_receipt(conn,bot_id,message,digest,reason='late_execution_observation_after_command_ttl')
                if command['status'] not in {'pending','published','executed'} or command['attempts']<1:
                    raise HTTPException(409,'Command was not issued to this device')
                conn.execute("UPDATE hostelxpress_private.command_outbox SET status='executed',acknowledged_at=now() WHERE id=%s",(command['id'],))
                if command['command']=='unlock_inner':
                    conn.execute("UPDATE public.bots SET status='UNLOCKED' WHERE id=%s",(bot_id,))
                    update_sensor(conn,bot_id,order['compartment_id'],{'inner_closed':False})
            elif message['result']=='rejected':
                if command['status']!='executed':
                    conn.execute("UPDATE hostelxpress_private.command_outbox SET status='rejected',last_error=%s,acknowledged_at=now() WHERE id=%s",(message.get('reason'),command['id']))
            # accepted is an application receipt, not successful actuation.
        elif event_type in {'forced_lid','collision','stuck'}:
            conn.execute('INSERT INTO hostelxpress_private.incidents(id,bot_id,order_id,reason) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING',(message['incident_id'],bot_id,order['id'] if order else None,event_type))
            conn.execute("UPDATE public.bots SET status='FAULT_MODE',fault_reason=%s,last_seen_at=now() WHERE id=%s",(event_type,bot_id))
            if order and order['status'] not in service.TERMINAL:
                conn.execute("UPDATE public.orders SET status='Failed',failed_at=now(),failure_reason=%s WHERE id=%s",(event_type,order['id']))
                service.event(conn,order['id'],'Failed','Device fault; physical custody retained and 120-second evidence required')
        else:
            if not order or order['status'] in service.TERMINAL:
                raise HTTPException(409,'A current assigned order is required')
            if 'compartment' in message:
                update_sensor(conn,bot_id,message['compartment'],message,observed_at=message['observed_at'])
            if event_type=='outer_lid_opened':
                matching_command(conn,bot_id,order['id'],order['compartment_id'],message.get('command_id'),'unlock_outer',executed=True)
                if order['status']!='Pending' or order['rider_due_at']<=service.now() or bot['status'] not in {'IDLE_AT_GATE','LOADING'}:
                    raise HTTPException(409,'Outer loading is outside the authorized rider window')
                if bot['status']=='IDLE_AT_GATE':
                    conn.execute("UPDATE public.bots SET status='LOADING',load_started_at=now(),load_deadline_at=now()+interval '5 minutes' WHERE id=%s",(bot_id,))
                update_sensor(conn,bot_id,order['compartment_id'],{'outer_closed':False})
            elif event_type=='outer_lid_closed':
                update_sensor(conn,bot_id,order['compartment_id'],{'outer_closed':True})
            elif event_type=='parcel_loaded':
                authorized=conn.execute("SELECT id FROM hostelxpress_private.command_outbox WHERE order_id=%s AND bot_id=%s AND compartment=%s AND command='unlock_outer' AND status='executed' AND is_demo=false",(order['id'],bot_id,order['compartment_id'])).fetchone()
                if not authorized:
                    raise HTTPException(409,'A verified rider OTP outer-lid authorization is required; its provider integration is not configured')
                service.loaded(conn,order,bot)
            elif event_type=='arrived':
                service.arrived(conn,order,bot)
            elif event_type=='inner_lid_opened':
                matching_command(conn,bot_id,order['id'],order['compartment_id'],message.get('command_id'),'unlock_inner',executed=True)
                update_sensor(conn,bot_id,order['compartment_id'],{'inner_closed':False})
            elif event_type=='inner_lid_closed':
                matching_command(conn,bot_id,order['id'],order['compartment_id'],message.get('command_id'),'unlock_inner',executed=True)
                update_sensor(conn,bot_id,order['compartment_id'],{'inner_closed':True})
                service.completed(conn,order,bot)
            else:
                raise HTTPException(422,'Unsupported device event')
    else:
        raise HTTPException(422,'Unsupported device message')
    return stored_receipt(conn,bot_id,message,digest)


def install_routes(app):
    @app.post('/v1/devices/{bot_id}/messages')
    async def messages(bot_id:UUID,request:Request):
        if request.app.state.settings.is_demo:
            raise HTTPException(404,'Real device ingestion is disabled in demo mode')
        raw=await request.body()
        if len(raw)>16384:
            raise HTTPException(413,'Device messages must not exceed 16 KiB')
        def apply():
            with request.app.state.db.connection() as conn:
                try:
                    verify_http(conn,bot_id,raw,request.headers.get('X-Device-Timestamp'),request.headers.get('X-Device-Signature'),request.url.path)
                except HTTPException as exc:
                    if exc.status_code==401:
                        request.app.state.device_throttle.check(request.client.host if request.client else '')
                    raise
                return ingest(conn,bot_id,raw)
        return await asyncio.to_thread(apply)
