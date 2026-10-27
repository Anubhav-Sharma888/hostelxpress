from __future__ import annotations

import json
import logging
import ssl
import threading
from datetime import timezone
from uuid import UUID

import paho.mqtt.client as mqtt
from paho.mqtt.packettypes import PacketTypes
from paho.mqtt.properties import Properties
from paho.mqtt.subscribeoptions import SubscribeOptions

from . import devices,service

log=logging.getLogger('hostelxpress.mqtt')
BASE='hostelxpress/v1/bots'
SUFFIX_TYPES={'telemetry':'telemetry','state':'state','events':'event','availability':'availability','acks':'ack'}


class MQTTBridge:
    """Two TLS identities: durable ingest session and nonretained command publisher."""
    def __init__(self,settings,db):
        self.settings,self.db=settings,db
        self.connected=threading.Event()
        self.publisher=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,client_id=settings.mqtt_ingest_client_id+'-commands',protocol=mqtt.MQTTv5)
        self.ingest=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,client_id=settings.mqtt_ingest_client_id,protocol=mqtt.MQTTv5)
        for client,username,password in ((self.publisher,settings.mqtt_username,settings.mqtt_password),
                                         (self.ingest,settings.mqtt_ingest_username,settings.mqtt_ingest_password)):
            client.username_pw_set(username,password)
            client.tls_set(ca_certs=settings.mqtt_ca_file,tls_version=ssl.PROTOCOL_TLS_CLIENT)
            client.tls_insecure_set(False)
            client.max_queued_messages_set(100)
            client.reconnect_delay_set(1,30)
        self.publisher.on_connect=self._publisher_connected
        self.publisher.on_disconnect=lambda *_:self.connected.clear()
        self.ingest.on_connect=self._ingest_connected
        self.ingest.on_message=self._message

    def _publisher_connected(self,client,userdata,flags,reason_code,properties):
        if not reason_code.is_failure:
            self.connected.set()

    def _ingest_connected(self,client,userdata,flags,reason_code,properties):
        if reason_code.is_failure:
            return
        for suffix in SUFFIX_TYPES:
            client.subscribe(f'{BASE}/+/{suffix}',options=SubscribeOptions(qos=1,retainAsPublished=True))

    def _message(self,client,userdata,message):
        parts=message.topic.split('/')
        if len(parts)!=5 or '/'.join(parts[:3])!=BASE or parts[4] not in SUFFIX_TYPES:
            return
        if message.retain and parts[4]!='availability':
            return
        try:
            bot_id=UUID(parts[3])
            body=devices.parse_message(message.payload,bot_id,check_freshness=False)
            if body['message_type']!=SUFFIX_TYPES[parts[4]]:
                return
            with self.db.connection() as conn:
                devices.ingest(conn,bot_id,message.payload,via_mqtt=True)
        except Exception:
            # Do not log payloads, secrets, user IDs, or raw database exceptions.
            log.warning('MQTT message rejected; device must reconcile through signed HTTP')

    def start(self):
        if self.settings.is_demo:
            raise RuntimeError('Live MQTT is disabled in demo mode')
        ingest_properties=Properties(PacketTypes.CONNECT)
        ingest_properties.SessionExpiryInterval=86400
        self.ingest.connect_async(self.settings.mqtt_host,self.settings.mqtt_port,keepalive=15,
                                  clean_start=False,properties=ingest_properties)
        command_properties=Properties(PacketTypes.CONNECT)
        command_properties.SessionExpiryInterval=0
        self.publisher.connect_async(self.settings.mqtt_host,self.settings.mqtt_port,keepalive=15,
                                     clean_start=True,properties=command_properties)
        self.ingest.loop_start()
        self.publisher.loop_start()

    def stop(self):
        for client in (self.ingest,self.publisher):
            client.disconnect()
            client.loop_stop()

    def publish_pending(self):
        if not self.connected.is_set():
            return
        with self.db.connection() as conn:
            candidates=conn.execute("SELECT id,order_id FROM hostelxpress_private.command_outbox WHERE status='pending' AND is_demo=false ORDER BY issued_at LIMIT 20").fetchall()
        for candidate in candidates:
            with self.db.connection() as conn:
                order,bot=service.lock_order(conn,candidate['order_id'])
                command=conn.execute("SELECT * FROM hostelxpress_private.command_outbox WHERE id=%s AND status='pending' FOR UPDATE",(candidate['id'],)).fetchone()
                if not command:
                    continue
                if command['expires_at']<=service.now():
                    conn.execute("UPDATE hostelxpress_private.command_outbox SET status='expired' WHERE id=%s",(command['id'],))
                    continue
                if order['is_demo'] or order['compartment_released_at'] is not None or command['bot_id']!=order['bot_id'] or command['compartment']!=order['compartment_id']:
                    conn.execute("UPDATE hostelxpress_private.command_outbox SET status='rejected',last_error='assignment_changed' WHERE id=%s",(command['id'],))
                    continue
                if command['command']!='unlock_inner' or order['status']!='Paid' or not service.safe_bot(conn,bot):
                    continue
                if not conn.execute("SELECT 1 FROM public.transactions WHERE order_id=%s AND status='Captured' AND amount=1000 AND currency='INR' AND is_demo=false",(order['id'],)).fetchone():
                    continue
                utc=lambda value:value.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
                payload={'schema_version':1,'message_type':'command','message_id':str(command['id']),
                         'bot_id':str(command['bot_id']),'sent_at':utc(command['issued_at']),
                         'issued_at':utc(command['issued_at']),'expires_at':utc(command['expires_at']),
                         'order_id':str(command['order_id']),'command':command['command'],'compartment':command['compartment']}
                properties=Properties(PacketTypes.PUBLISH)
                properties.MessageExpiryInterval=max(1,min(10,int((command['expires_at']-service.now()).total_seconds())))
                properties.ContentType='application/json'
                properties.PayloadFormatIndicator=1
                info=self.publisher.publish(f'{BASE}/{command["bot_id"]}/commands',json.dumps(payload,separators=(',',':')),qos=1,retain=False,properties=properties)
                conn.execute('UPDATE hostelxpress_private.command_outbox SET attempts=attempts+1 WHERE id=%s',(command['id'],))
                try:
                    info.wait_for_publish(timeout=2)
                    if info.rc!=mqtt.MQTT_ERR_SUCCESS or not info.is_published():
                        raise RuntimeError()
                except (RuntimeError,ValueError):
                    conn.execute("UPDATE hostelxpress_private.command_outbox SET last_error='transport_not_confirmed' WHERE id=%s",(command['id'],))
                    continue
                conn.execute("UPDATE hostelxpress_private.command_outbox SET status='published',published_at=now(),last_error=NULL WHERE id=%s",(command['id'],))
