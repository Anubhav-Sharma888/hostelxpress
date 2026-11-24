-- Apply only to the staging project after creating its restricted API login.
-- An administrator separately adds the approved test user's ID to this table.
create table hostelxpress_private.staging_booking_accounts (
  user_id uuid primary key references public.users(id) on delete cascade
);
alter table hostelxpress_private.staging_booking_accounts enable row level security;
revoke all on hostelxpress_private.staging_booking_accounts from public, anon, authenticated;
grant select on hostelxpress_private.staging_booking_accounts to hostelxpress_health;
create policy staging_api_booking_accounts_read on hostelxpress_private.staging_booking_accounts
  for select to hostelxpress_health using (true);

grant insert (user_id, destination_hostel_block, parcel_label, idempotency_key, request_fingerprint, is_demo)
  on public.orders to hostelxpress_health;
create policy staging_api_insert_test_order on public.orders
  for insert to hostelxpress_health
  with check (
    is_demo and status = 'Pending' and bot_id is null and compartment_id is null
    and exists (
      select 1 from hostelxpress_private.staging_booking_accounts a where a.user_id = orders.user_id
    )
  );

grant usage on type public.order_status, public.transaction_status to hostelxpress_health;
grant select (id, order_id, status, at, label), insert (order_id, status, label)
  on public.order_events to hostelxpress_health;
create policy staging_api_read_test_order_events on public.order_events
  for select to hostelxpress_health
  using (exists (
    select 1 from public.orders o where o.id = order_events.order_id and o.is_demo and o.bot_id is null
  ));
create policy staging_api_insert_test_order_event on public.order_events
  for insert to hostelxpress_health
  with check (
    status = 'Pending' and exists (
      select 1 from public.orders o where o.id = order_events.order_id and o.is_demo and o.bot_id is null
    )
  );

grant select (id, order_id, status, created_at) on public.transactions to hostelxpress_health;
create policy staging_api_read_test_order_payment_status on public.transactions
  for select to hostelxpress_health
  using (exists (
    select 1 from public.orders o where o.id = transactions.order_id and o.is_demo and o.bot_id is null
  ));
