-- After Hours pilot: merchants, catalogue, departure capacity, frozen quotes,
-- and pilot orders. The schedule is backend-owned and single-row; times are
-- wall-clock times in the configured timezone (Asia/Kolkata), never client data.
create table if not exists public.pilot_schedule (
  id boolean primary key default true,
  start_local time not null,
  end_local time not null,
  timezone_name text not null default 'Asia/Kolkata',
  tuck_fee_paise integer not null default 1000,
  hot_food_fee_paise integer not null default 2000
);
insert into public.pilot_schedule (id, start_local, end_local) values (true, '01:30', '03:30')
  on conflict (id) do nothing;

create table if not exists public.pilot_merchants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  kind text not null check (kind in ('tuck_shop','hot_food')),
  hostel_block text not null,
  insulated_bay text,
  staff_token text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.pilot_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.pilot_merchants(id),
  name text not null,
  price_paise integer not null check (price_paise between 100 and 500000),
  active boolean not null default true
);

create table if not exists public.pilot_departures (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.pilot_merchants(id),
  hostel_block text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  capacity integer not null check (capacity between 1 and 20)
);

create table if not exists public.pilot_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  merchant_id uuid not null references public.pilot_merchants(id),
  departure_id uuid not null references public.pilot_departures(id),
  items_json jsonb not null,
  fee_paise integer not null,
  total_paise integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pilot_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  merchant_id uuid not null references public.pilot_merchants(id),
  departure_id uuid not null references public.pilot_departures(id),
  quote_id uuid not null references public.pilot_quotes(id),
  hostel_block text not null,
  items_json jsonb not null,
  fee_paise integer not null,
  total_paise integer not null,
  status text not null default 'Placed'
    check (status in ('Placed','Accepted','Rejected','Ready','Loaded','Completed','Cancelled')),
  payment_status text not null default 'Unpaid'
    check (payment_status in ('Unpaid','SimPaid')),
  rover_requested_at timestamptz,
  insulated_bay text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pilot_orders_departure_idx on public.pilot_orders (departure_id) where status not in ('Rejected','Cancelled');
create trigger pilot_orders_touch_updated_at before update on public.pilot_orders
  for each row execute function hostelxpress_private.touch_updated_at();
insert into hostelxpress_private.schema_migrations(version) values('0003_after_hours_pilot');
