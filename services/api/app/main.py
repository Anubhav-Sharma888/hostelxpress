from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from uuid import UUID,uuid4

from fastapi import Depends,FastAPI,Header,HTTPException,Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from jwt import PyJWKClient
from psycopg import Error as DatabaseError
from psycopg.types.json import Jsonb

from . import payments,service,throttle
from .auth import Principal,current_user,demo_token,require_local_demo
from .config import Settings,get_settings
from .db import Database
from .models import Booking,DemoAdvance,DemoLogin,ProfilePatch

log=logging.getLogger('hostelxpress')

# API responses are never cacheable and never embeddable; HTML documentation
# still needs its own scripts, so the strict CSP targets API paths only.
API_HEADERS={'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}


class SecurityHeadersMiddleware:
    def __init__(self,app):
        self.app=app
    async def __call__(self,scope,receive,send):
        if scope['type']!='http':
            await self.app(scope,receive,send)
            return
        path=scope.get('path','')
        async def send_with_headers(message):
            if message['type']=='http.response.start':
                headers=message.setdefault('headers',[])
                headers.extend([(b'x-content-type-options',b'nosniff'),(b'referrer-policy',b'no-referrer')])
                if any(path.startswith(prefix) for prefix in ('/v1/','/auth/','/webhooks/')):
                    headers.extend([(k.encode(),v.encode()) for k,v in API_HEADERS.items()])
            await send(message)
        await self.app(scope,receive,send_with_headers)


def warn_unconfigured(settings:Settings):
    if settings.is_demo:
        return
    missing=[]
    if not (settings.razorpay_key_id and settings.razorpay_key_secret):
        missing.append('RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET: payment creation will be refused')
    if not settings.razorpay_webhook_secret:
        missing.append('RAZORPAY_WEBHOOK_SECRET: provider webhooks will be refused')
    if not settings.mqtt_host:
        missing.append('MQTT_HOST: live device telemetry and command publication stay off')
    if missing:
        for entry in missing:
            log.warning('Integration not configured: %s',entry)
        log.warning('The API fails closed; configure these before enabling live traffic')


def create_app(settings:Settings | None=None) -> FastAPI:
    settings=settings or get_settings()

    @asynccontextmanager
    async def lifespan(app):
        app.state.db=Database(settings.database_url)
        app.state.db.open()
        app.state.settings=settings
        app.state.provider=payments.RazorpayProvider(settings)
        app.state.jwks=PyJWKClient(settings.issuer+'/.well-known/jwks.json',timeout=5) if not settings.is_demo else None
        with app.state.db.connection() as conn:
            migrated=conn.execute("SELECT count(*)=2 AS ready FROM hostelxpress_private.schema_migrations WHERE version IN ('0001_application_core','0002_device_reconciliation')").fetchone()['ready']
            if not migrated:
                raise RuntimeError('Apply all application migrations before starting the API')
            if settings.is_demo:
                service.ensure_demo(conn)
        bridge=None
        if settings.mqtt_host and not settings.is_demo:
            from .mqtt import MQTTBridge
            bridge=MQTTBridge(settings,app.state.db)
            bridge.start()
        app.state.mqtt_bridge=bridge
        app.state.device_throttle=throttle.FailureThrottle(limit=30)
        app.state.webhook_throttle=throttle.FailureThrottle(limit=30)
        warn_unconfigured(settings)
        async def worker():
            while True:
                try:
                    await asyncio.to_thread(service.tick,app.state.db)
                    if bridge:
                        await asyncio.to_thread(bridge.publish_pending)
                except Exception:
                    log.error('Background reconciliation failed; devices remain guarded',exc_info=False)
                await asyncio.sleep(1)
        task=asyncio.create_task(worker()) if settings.worker_enabled else None
        try:
            yield
        finally:
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            if bridge:
                bridge.stop()
            app.state.db.close()

    app=FastAPI(title='Hostelxpress application API',version='1.0.0',lifespan=lifespan)
    app.state.settings=settings
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(TrustedHostMiddleware,allowed_hosts=[h.strip() for h in settings.trusted_hosts.split(',') if h.strip()])
    app.add_middleware(CORSMiddleware,allow_origins=[o.strip() for o in settings.cors_origins.split(',') if o.strip()],
                       allow_credentials=False,allow_methods=['GET','POST','PATCH'],
                       allow_headers=['Authorization','Content-Type','Idempotency-Key'])

    @app.exception_handler(DatabaseError)
    async def database_error(request:Request,exc:DatabaseError):
        log.error('Database operation failed; transaction was rolled back')
        return JSONResponse(status_code=503,content={'detail':'Database operation could not be completed; retry safely'})

    @app.get('/health')
    def health(request:Request):
        with request.app.state.db.connection() as conn:
            conn.execute('SELECT 1')
        return {'status':'ok','mode':'demo' if settings.is_demo else 'production','database':'ready',
                'integrations':{'payments':'demo' if settings.is_demo else ('configured' if settings.razorpay_key_id else 'disabled'),
                                'mqtt':'configured' if settings.mqtt_host and not settings.is_demo else 'disabled'}}

    @app.post('/auth/demo')
    def demo_login(body:DemoLogin,request:Request):
        require_local_demo(request)
        user_id=uuid4()
        with request.app.state.db.connection() as conn:
            conn.execute('INSERT INTO auth.users(id,raw_user_meta_data) VALUES(%s,%s)',(user_id,Jsonb({'name':body.name})))
            conn.execute('UPDATE public.users SET name=%s,hostel_block=%s WHERE id=%s',(body.name,body.hostel_block,user_id))
            user=service.get_profile(conn,user_id)
        return {'access_token':demo_token(settings,user_id),'token_type':'bearer','expires_in':21600,'mode':'demo','user':user}

    @app.get('/v1/me')
    def me(request:Request,user:Principal=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            return service.get_profile(conn,user.id)

    @app.patch('/v1/me')
    def patch_me(body:ProfilePatch,request:Request,user:Principal=Depends(current_user)):
        values=body.model_dump(exclude_unset=True)
        if any(value is None for value in values.values()):
            raise HTTPException(422,'Profile fields cannot be null')
        with request.app.state.db.connection() as conn:
            if values:
                # Column names are hardcoded; user-controlled values are parameters.
                conn.execute('UPDATE public.users SET name=coalesce(%s,name),hostel_block=coalesce(%s,hostel_block) WHERE id=%s',(values.get('name'),values.get('hostel_block'),user.id))
            return service.get_profile(conn,user.id)

    @app.get('/v1/orders')
    def orders(request:Request,user:Principal=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            rows=conn.execute('SELECT * FROM public.orders WHERE user_id=%s ORDER BY created_at DESC,id DESC LIMIT 100',(user.id,)).fetchall()
            return {'items':[service.serialize_order(conn,row) for row in rows]}

    @app.post('/v1/orders',status_code=201)
    def book(body:Booking,request:Request,idempotency_key:UUID=Header(alias='Idempotency-Key'),user:Principal=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            return service.book(conn,user.id,body,idempotency_key,user.is_demo)

    @app.get('/v1/orders/{order_id}')
    def order(order_id:UUID,request:Request,user:Principal=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            return service.own_order(conn,order_id,user.id)

    @app.get('/v1/orders/{order_id}/events')
    def events(order_id:UUID,request:Request,user:Principal=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            return {'items':service.own_order(conn,order_id,user.id)['timeline']}

    @app.get('/v1/bots/{bot_id}')
    def bot(bot_id:UUID,request:Request,user:Principal=Depends(current_user)):
        with request.app.state.db.connection() as conn:
            row=conn.execute("SELECT b.* FROM public.bots b WHERE b.id=%s AND EXISTS(SELECT 1 FROM public.orders o WHERE o.bot_id=b.id AND o.user_id=%s AND o.status NOT IN ('Completed','Failed'))",(bot_id,user.id)).fetchone()
            if not row:
                raise HTTPException(404,'Assigned bot not found')
            return service.bot_summary(row)

    @app.post('/v1/orders/{order_id}/payment')
    def payment(order_id:UUID,request:Request,user:Principal=Depends(current_user)):
        return payments.create_payment(request.app.state.db,request.app.state.provider,order_id,user.id,user.is_demo)

    @app.post('/v1/demo/orders/{order_id}/advance')
    def advance(order_id:UUID,body:DemoAdvance,request:Request,user:Principal=Depends(current_user)):
        require_local_demo(request)
        with request.app.state.db.connection() as conn:
            return service.demo_advance(conn,order_id,user.id,body.action)

    @app.post('/webhooks/razorpay')
    async def webhook(request:Request):
        raw=await request.body()
        if len(raw)>65536:
            raise HTTPException(413,'Webhook payload is too large')
        if settings.is_demo:
            raise HTTPException(404,'Real payment webhooks are disabled in demo mode')
        try:
            payments.verify_signature(raw,request.headers.get('X-Razorpay-Signature'),settings.razorpay_webhook_secret)
        except HTTPException as exc:
            if exc.status_code==401:
                request.app.state.webhook_throttle.check(request.client.host if request.client else '')
            raise
        return await asyncio.to_thread(payments.process_webhook,request.app.state.db,request.app.state.provider,raw,request.headers.get('X-Razorpay-Event-Id'))

    # Device routes and MQTT bridge share the canonical wire contract.
    from .devices import install_routes
    install_routes(app)
    return app


app=create_app()
