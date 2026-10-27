-- Phase 1 application foundation. Apply once after init.sql, as database owner.
begin;
create table hostelxpress_private.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table public.orders
  add column parcel_label text not null default 'Parcel' check (char_length(btrim(parcel_label)) between 1 and 120),
  add column idempotency_key uuid,
  add column request_fingerprint text,
  add column is_demo boolean not null default false;
create unique index orders_user_idempotency_idx on public.orders(user_id,idempotency_key)
  where idempotency_key is not null;
alter table public.bots add column is_demo boolean not null default false;
alter table public.transactions
  alter column razorpay_qr_id drop not null,
  add column request_id uuid not null default gen_random_uuid() unique,
  add column provider_state text not null default 'ready'
    check (provider_state in ('creating','ready','failed')),
  add column qr_image_url text,
  add column expires_at timestamptz,
  add column is_demo boolean not null default false,
  add constraint transaction_settled_requires_qr check (
    status not in ('Authorized','Captured','Refunded') or razorpay_qr_id is not null
  );
comment on column public.transactions.provider_state is
  'Commit a creating intent before external QR creation. An interrupted ambiguous creation must be reconciled rather than blindly creating another QR.';
create unique index transactions_one_open_intent on public.transactions(order_id)
  where status in ('Pending','Authorized') and provider_state in ('creating','ready');
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  status public.order_status not null,
  at timestamptz not null default now(),
  label text not null check(char_length(label) between 1 and 200)
);
create index order_events_order_at_idx on public.order_events(order_id,at,id);
alter table public.order_events enable row level security;
revoke all on public.order_events from public,anon,authenticated;
grant select on public.order_events to authenticated;
grant select,insert,update,delete on public.order_events to service_role;
create policy order_events_select_own on public.order_events for select to authenticated
using (exists(select 1 from public.orders o where o.id=order_events.order_id and o.user_id=(select auth.uid())));

create table hostelxpress_private.device_credentials (
  bot_id uuid primary key references public.bots(id) on delete restrict,
  secret bytea not null check(octet_length(secret)>=32),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table hostelxpress_private.device_state (
  bot_id uuid primary key references public.bots(id) on delete restrict,
  boot_id uuid,
  sequence bigint not null default -1,
  retired_boots uuid[] not null default array[]::uuid[],
  clock_synchronized boolean not null default false,
  updated_at timestamptz not null default now()
);
create table hostelxpress_private.compartment_state (
  bot_id uuid not null references public.bots(id) on delete restrict,
  compartment_id smallint not null check(compartment_id between 1 and 3),
  outer_closed boolean,
  inner_closed boolean,
  is_empty boolean,
  observed_at timestamptz,
  primary key(bot_id,compartment_id)
);
create table hostelxpress_private.device_events (
  bot_id uuid not null references public.bots(id) on delete restrict,
  message_id uuid not null,
  payload_sha256 text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  primary key(bot_id,message_id)
);
create table hostelxpress_private.incidents (
  id uuid primary key,
  bot_id uuid not null references public.bots(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  reason text not null,
  clip_seconds integer not null default 120 check(clip_seconds=120),
  evidence_status text not null default 'awaiting_evidence',
  created_at timestamptz not null default now()
);
create table hostelxpress_private.webhook_inbox (
  provider text not null default 'razorpay',
  event_id text not null check(char_length(event_id) between 1 and 255),
  payload_sha256 text not null,
  event_type text not null,
  payment_id text,
  outcome text not null,
  received_at timestamptz not null default now(),
  primary key(provider,event_id)
);
create table hostelxpress_private.command_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  bot_id uuid not null references public.bots(id) on delete restrict,
  compartment smallint not null check(compartment between 1 and 3),
  command text not null check(command in ('unlock_inner','unlock_outer')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default(now()+interval '10 seconds'),
  status text not null default 'pending'
    check(status in ('pending','published','executed','rejected','expired')),
  attempts integer not null default 0,
  published_at timestamptz,
  acknowledged_at timestamptz,
  last_error text,
  is_demo boolean not null default false,
  unique(order_id,command),
  check(expires_at>issued_at and expires_at<=issued_at+interval '10 seconds')
);
create index command_outbox_pending_idx on hostelxpress_private.command_outbox(issued_at)
  where status='pending';
revoke all on all tables in schema hostelxpress_private from public,anon,authenticated;
comment on table hostelxpress_private.command_outbox is
  'Transactional payment-to-command handoff. Only non-demo, fresh, interlocked commands can be published. MQTT QoS is not physical execution; acknowledged closure completes delivery.';
insert into hostelxpress_private.schema_migrations(version) values('0001_application_core');
commit;
