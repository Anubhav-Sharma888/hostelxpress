-- Hostelxpress Phase 0: fresh Supabase project, run as postgres/SQL Editor.
-- Deliberately not rerunnable: use versioned migrations after initialization.
-- PostgreSQL 15+; Supabase owns auth.users and the API roles used below.
-- Sources: https://supabase.com/docs/guides/auth/managing-user-data
--          https://supabase.com/docs/guides/database/postgres/row-level-security
--          https://www.postgresql.org/docs/current/indexes-partial.html
begin;

create schema hostelxpress_private;
revoke all on schema hostelxpress_private from public, anon, authenticated;

create type public.bot_status as enum (
  'IDLE_AT_GATE', 'LOADING', 'TRANSIT', 'AT_HOSTEL', 'UNLOCKED',
  'RETURNING', 'FAULT_MODE'
);
create type public.order_status as enum (
  'Pending', 'Loaded', 'Transit', 'Arrived', 'Paid', 'Completed', 'Failed'
);
create type public.transaction_status as enum (
  'Pending', 'Authorized', 'Captured', 'Failed', 'Refunded'
);

create table public.users (
  id uuid primary key references auth.users (id) on delete restrict,
  name text not null default 'Student'
    check (char_length(btrim(name)) between 1 and 120),
  hostel_block text check (
    hostel_block is null or char_length(btrim(hostel_block)) between 1 and 80
  ),
  -- Compatibility with the architecture diagram; credentials belong in Auth.
  auth_token text check (auth_token is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.users.auth_token is
  'Deprecated compatibility field. Must remain NULL. Never persist JWTs or refresh tokens here.';
comment on column public.users.hostel_block is
  'Student profile only; orders carry an immutable delivery destination snapshot. Actual hostel names require campus configuration.';

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  status public.bot_status not null default 'IDLE_AT_GATE',
  current_lat double precision,
  current_lng double precision,
  battery_level numeric(5,2) check (battery_level between 0 and 100),
  last_seen_at timestamptz,
  telemetry_observed_at timestamptz,
  load_started_at timestamptz,
  load_deadline_at timestamptz,
  fault_reason text check (fault_reason is null or char_length(btrim(fault_reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bots_coordinate_pair check (
    (current_lat is null and current_lng is null) or
    (current_lat is not null and current_lng is not null and
      current_lat between -90 and 90 and current_lng between -180 and 180)
  ),
  constraint bots_load_timer check (
    (load_started_at is null and load_deadline_at is null) or
    (load_started_at is not null and load_deadline_at is not null and
      load_deadline_at = load_started_at + interval '5 minutes')
  ),
  constraint bots_loading_requires_timer check (
    status <> 'LOADING' or load_started_at is not null
  ),
  constraint bots_fault_requires_reason check (
    status <> 'FAULT_MODE' or fault_reason is not null
  )
);
comment on column public.bots.load_started_at is
  'Backend starts once at the first verified outer-lid loading attempt that moves the bot into LOADING. Later riders never reset it. Clear both fields after trip/reset.';
comment on column public.bots.load_deadline_at is
  'Separate from each rider deadline. Dispatch at 3 locked loaded compartments or this deadline with at least one secured parcel, subject to interlocks. With no parcels, cancel/release eligible reservations and return to IDLE_AT_GATE; never dispatch empty. Backend worker is a later phase.';
comment on column public.bots.telemetry_observed_at is
  'Device observation time; last_seen_at is server receipt time. Backend rejects stale/out-of-order telemetry.';

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  bot_id uuid references public.bots (id) on delete restrict,
  compartment_id smallint check (compartment_id between 1 and 3),
  status public.order_status not null default 'Pending',
  destination_hostel_block text not null
    check (char_length(btrim(destination_hostel_block)) between 1 and 80),
  amount integer not null default 1000 check (amount = 1000),
  currency text not null default 'INR' check (currency = 'INR'),
  created_at timestamptz not null default now(),
  rider_due_at timestamptz not null default (now() + interval '5 minutes'),
  loaded_at timestamptz,
  arrived_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  compartment_released_at timestamptz,
  failure_reason text check (failure_reason is null or char_length(btrim(failure_reason)) between 1 and 500),
  updated_at timestamptz not null default now(),
  constraint orders_assignment_pair check (
    (bot_id is null and compartment_id is null) or
    (bot_id is not null and compartment_id is not null)
  ),
  constraint orders_delivery_requires_assignment check (
    status in ('Pending', 'Failed') or bot_id is not null
  ),
  constraint orders_rider_deadline check (
    rider_due_at = created_at + interval '5 minutes'
  ),
  constraint orders_compartment_release check (
    compartment_released_at is null or (
      status in ('Completed', 'Failed') and bot_id is not null and
      compartment_released_at >= created_at
    )
  )
);
comment on column public.orders.amount is 'Delivery fee in paise: INR 10 = 1000. Never a floating-point rupee value.';
comment on column public.orders.rider_due_at is
  'Pending rider no-show deadline, five minutes after order creation. Backend cancels still-Pending orders and releases reservations; no automatic SQL scheduler is installed.';
comment on column public.orders.destination_hostel_block is
  'Snapshot at order creation; later user profile edits must not change the delivery destination.';
comment on column public.orders.status is
  'Backend validates transitions and locks affected rows. Paid requires a verified captured payment; Completed additionally requires confirmed lid closure.';
comment on column public.orders.compartment_released_at is
  'Backend sets only after confirming the compartment is empty and secure, or after a no-show before loading. Terminal status alone never releases physical custody. Non-NULL requires a terminal assigned order.';

-- A Failed order may still hold a parcel. Explicit safe release, rather than
-- logical order status, ends reservation/physical custody under concurrency.
create unique index orders_one_reserved_compartment
  on public.orders (bot_id, compartment_id)
  where bot_id is not null and compartment_released_at is null;
create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_bot_idx on public.orders (bot_id);
create index orders_pending_deadline_idx on public.orders (rider_due_at)
  where status = 'Pending';
create index bots_loading_deadline_idx on public.bots (load_deadline_at)
  where status = 'LOADING';

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  -- Dynamic QR payments can have no provider order ID. Never conflate it with order_id.
  razorpay_qr_id text not null unique
    check (char_length(btrim(razorpay_qr_id)) between 1 and 128),
  razorpay_order_id text unique
    check (razorpay_order_id is null or char_length(btrim(razorpay_order_id)) between 1 and 128),
  razorpay_payment_id text unique
    check (razorpay_payment_id is null or char_length(btrim(razorpay_payment_id)) between 1 and 128),
  -- Store the capture event ID only; this is not a full webhook event inbox.
  capture_webhook_event_id text unique
    check (capture_webhook_event_id is null or char_length(btrim(capture_webhook_event_id)) between 1 and 255),
  amount integer not null default 1000 check (amount = 1000),
  currency text not null default 'INR' check (currency = 'INR'),
  status public.transaction_status not null default 'Pending',
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_confirmed_payment check (
    status not in ('Authorized', 'Captured', 'Refunded') or razorpay_payment_id is not null
  ),
  constraint transactions_capture_timestamp check (
    status not in ('Captured', 'Refunded') or captured_at is not null
  )
);
create index transactions_order_idx on public.transactions (order_id);
create unique index transactions_one_settled_payment
  on public.transactions (order_id) where status in ('Captured', 'Refunded');
comment on table public.transactions is
  'One single-use dynamic QR payment attempt. Backend owns QR/payment association verification and state updates. Only verified captured payments can authorize inner-lid commands.';
comment on column public.transactions.razorpay_qr_id is
  'Provider QR identifier mapped by backend to this internal order. Create single_use, fixed_amount UPI QR for 1000 paise. A Razorpay order ID is not guaranteed for QR payments.';
comment on column public.transactions.capture_webhook_event_id is
  'Capture-event deduplication only. A durable webhook inbox and command outbox are later backend migrations; never claim exactly-once MQTT delivery.';

create function hostelxpress_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function hostelxpress_private.touch_updated_at() from public, anon, authenticated;

create trigger users_touch_updated_at before update on public.users
  for each row execute function hostelxpress_private.touch_updated_at();
create trigger bots_touch_updated_at before update on public.bots
  for each row execute function hostelxpress_private.touch_updated_at();
create trigger orders_touch_updated_at before update on public.orders
  for each row execute function hostelxpress_private.touch_updated_at();
create trigger transactions_touch_updated_at before update on public.transactions
  for each row execute function hostelxpress_private.touch_updated_at();

create function hostelxpress_private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Metadata is untrusted display data, never an authorization claim.
  insert into public.users (id, name)
  values (
    new.id,
    coalesce(nullif(pg_catalog.left(pg_catalog.btrim(new.raw_user_meta_data ->> 'name'), 120), ''), 'Student')
  );
  return new;
end;
$$;
revoke all on function hostelxpress_private.handle_new_auth_user() from public, anon, authenticated;
create trigger hostelxpress_auth_user_created after insert on auth.users
  for each row execute function hostelxpress_private.handle_new_auth_user();

-- Existing Supabase users also receive profiles when this fresh app is installed.
insert into public.users (id, name)
select id, coalesce(nullif(left(btrim(raw_user_meta_data ->> 'name'), 120), ''), 'Student')
from auth.users;

alter table public.users enable row level security;
alter table public.bots enable row level security;
alter table public.orders enable row level security;
alter table public.transactions enable row level security;

-- Supabase projects may apply broad default grants: explicitly remove them.
revoke all on table public.users, public.bots, public.orders, public.transactions
  from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select on public.users, public.bots, public.orders, public.transactions to authenticated;
grant update (name, hostel_block) on public.users to authenticated;
grant select, insert, update, delete on public.users, public.bots, public.orders, public.transactions
  to service_role;
revoke all on type public.bot_status, public.order_status, public.transaction_status
  from public, anon;
grant usage on type public.bot_status, public.order_status, public.transaction_status
  to authenticated, service_role;

create policy users_select_own on public.users for select to authenticated
  using (id = (select auth.uid()));
create policy users_update_own on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy orders_select_own on public.orders for select to authenticated
  using (user_id = (select auth.uid()));
create policy bots_select_assigned_active on public.bots for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.bot_id = bots.id and o.user_id = (select auth.uid())
      and o.status not in ('Completed', 'Failed')
  ));
create policy transactions_select_own on public.transactions for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = transactions.order_id and o.user_id = (select auth.uid())
  ));

-- No client INSERT/DELETE policies and no mutation policies for bots/orders/payments.
-- Service role intentionally bypasses RLS; keep its credential on FastAPI only.
commit;
