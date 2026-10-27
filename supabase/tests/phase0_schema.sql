-- Run ONLY against a disposable/local Supabase database initialized by init.sql.
-- psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f supabase/tests/phase0_schema.sql
-- Plain SQL assertions, no pgTAP dependency. All test data is rolled back.
begin;

insert into auth.users (id, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', '{"name":"Alice"}'),
  ('10000000-0000-4000-8000-000000000002', '{"name":"Bob"}');
insert into public.bots (id) values
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');
insert into public.orders (id, user_id, bot_id, compartment_id, destination_hostel_block) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', 1, 'Hostel A'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000002', 1, 'Hostel B');
-- QR transactions intentionally have no Razorpay order ID.
insert into public.transactions (id, order_id, razorpay_qr_id) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'qr_phase0_alice'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'qr_phase0_bob');

do $$
begin
  if (select count(*) from public.users where id in (
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'
  )) <> 2 then raise exception 'Auth profile trigger failed'; end if;
  if exists (select 1 from pg_class where oid in (
    'public.users'::regclass, 'public.bots'::regclass,
    'public.orders'::regclass, 'public.transactions'::regclass
  ) and not relrowsecurity) then raise exception 'RLS missing'; end if;
  if exists (select 1 from public.orders where rider_due_at <> created_at + interval '5 minutes')
    then raise exception 'Rider deadline default incorrect'; end if;

  begin
    update public.users set auth_token = 'must-never-store' where id = '10000000-0000-4000-8000-000000000001';
    raise exception 'Token storage unexpectedly succeeded';
  exception when check_violation then null; end;
  begin
    insert into public.orders (user_id, bot_id, compartment_id, destination_hostel_block)
    values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 1, 'Hostel B');
    raise exception 'Duplicate compartment unexpectedly succeeded';
  exception when unique_violation then null; end;
  begin
    insert into public.orders (user_id, compartment_id, destination_hostel_block)
    values ('10000000-0000-4000-8000-000000000001', 4, 'Hostel A');
    raise exception 'Compartment 4 unexpectedly accepted';
  exception when check_violation then null; end;
  begin
    insert into public.orders (user_id, destination_hostel_block)
    values ('10000000-0000-4000-8000-000000000099', 'Hostel A');
    raise exception 'Missing user foreign key unexpectedly accepted';
  exception when foreign_key_violation then null; end;
  begin
    update public.orders set rider_due_at = created_at + interval '4 minutes'
    where id = '30000000-0000-4000-8000-000000000001';
    raise exception 'Incorrect rider deadline unexpectedly accepted';
  exception when check_violation then null; end;
  begin
    update public.orders set compartment_released_at = now()
    where id = '30000000-0000-4000-8000-000000000001';
    raise exception 'Active reservation released unexpectedly';
  exception when check_violation then null; end;
  begin
    update public.bots set current_lat = 91, current_lng = 77
    where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'Invalid GPS unexpectedly accepted';
  exception when check_violation then null; end;
  begin
    update public.bots set battery_level = -1
    where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'Invalid battery unexpectedly accepted';
  exception when check_violation then null; end;
  begin
    update public.bots set status = 'LOADING'
    where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'Loading without timer unexpectedly accepted';
  exception when check_violation then null; end;
  begin
    update public.bots set load_started_at = now(), load_deadline_at = now() + interval '4 minutes'
    where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'Incorrect loading deadline unexpectedly accepted';
  exception when check_violation then null; end;
  update public.bots set status = 'LOADING', load_started_at = now(),
    load_deadline_at = now() + interval '5 minutes'
    where id = '20000000-0000-4000-8000-000000000001';
  begin
    update public.transactions set amount = 10
    where id = '40000000-0000-4000-8000-000000000001';
    raise exception 'Fee in rupees unexpectedly accepted';
  exception when check_violation then null; end;
  begin
    update public.transactions set status = 'Captured'
    where id = '40000000-0000-4000-8000-000000000001';
    raise exception 'Capture without payment ID unexpectedly accepted';
  exception when check_violation then null; end;

  update public.transactions
    set status = 'Captured', razorpay_payment_id = 'pay_phase0_alice',
        capture_webhook_event_id = 'evt_phase0_alice', captured_at = now()
    where id = '40000000-0000-4000-8000-000000000001';
  begin
    update public.transactions set razorpay_payment_id = 'pay_phase0_alice'
    where id = '40000000-0000-4000-8000-000000000002';
    raise exception 'Duplicate provider payment ID unexpectedly accepted';
  exception when unique_violation then null; end;
  begin
    update public.transactions set capture_webhook_event_id = 'evt_phase0_alice'
    where id = '40000000-0000-4000-8000-000000000002';
    raise exception 'Duplicate capture event unexpectedly accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.transactions (
      order_id, razorpay_qr_id, razorpay_payment_id, status, captured_at
    ) values (
      '30000000-0000-4000-8000-000000000001', 'qr_phase0_duplicate_capture',
      'pay_phase0_duplicate_capture', 'Captured', now()
    );
    raise exception 'Two captured payments for one order unexpectedly accepted';
  exception when unique_violation then null; end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare changed integer; relation_name text; operation text;
begin
  foreach relation_name in array array['bots', 'orders', 'transactions'] loop
    foreach operation in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(current_user, 'public.' || relation_name, operation)
        then raise exception 'Authenticated has % on %', operation, relation_name; end if;
    end loop;
  end loop;
  if (select count(*) from public.users) <> 1 then raise exception 'Profile RLS failed'; end if;
  if (select count(*) from public.orders) <> 1 then raise exception 'Order RLS failed'; end if;
  if (select count(*) from public.bots) <> 1 then raise exception 'Assigned bot RLS failed'; end if;
  if (select count(*) from public.transactions) <> 1 then raise exception 'Transaction RLS failed'; end if;
  update public.users set name = 'Alice Updated', hostel_block = 'Hostel C'
    where id = '10000000-0000-4000-8000-000000000001';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Own profile update failed'; end if;
  if (select destination_hostel_block from public.orders) <> 'Hostel A'
    then raise exception 'Profile edit changed destination snapshot'; end if;
  update public.users set name = 'Stolen' where id = '10000000-0000-4000-8000-000000000002';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Cross-user profile update succeeded'; end if;

  begin
    update public.users set auth_token = null;
    raise exception 'Sensitive column update unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.users (id, name) values ('10000000-0000-4000-8000-000000000003', 'Forged');
    raise exception 'Client profile insert unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.users;
    raise exception 'Client profile deletion unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.orders set status = 'Paid';
    raise exception 'Client paid mutation unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.orders (user_id, destination_hostel_block)
    values ('10000000-0000-4000-8000-000000000001', 'Hostel A');
    raise exception 'Client order insert unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.orders;
    raise exception 'Client order deletion unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.bots set status = 'UNLOCKED';
    raise exception 'Client bot mutation unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.transactions set status = 'Captured';
    raise exception 'Client payment mutation unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  if (select id from public.users) <> '10000000-0000-4000-8000-000000000002'::uuid
    then raise exception 'Bob sees wrong profile'; end if;
  if exists (select 1 from public.orders where user_id <> '10000000-0000-4000-8000-000000000002')
    then raise exception 'Bob sees another user order'; end if;
  if exists (select 1 from public.bots where id <> '20000000-0000-4000-8000-000000000002')
    then raise exception 'Bob sees unrelated bot'; end if;
end;
$$;

reset role;
savepoint failed_reservation;
update public.orders set status = 'Failed'
  where id = '30000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    insert into public.orders (user_id, bot_id, compartment_id, destination_hostel_block)
    values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 1, 'Hostel B');
    raise exception 'Failed but occupied compartment unexpectedly reallocated';
  exception when unique_violation then null; end;
end;
$$;
rollback to savepoint failed_reservation;
release savepoint failed_reservation;
update public.orders set status = 'Completed'
  where id = '30000000-0000-4000-8000-000000000001';
do $$
begin
  begin
    insert into public.orders (user_id, bot_id, compartment_id, destination_hostel_block)
    values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 1, 'Hostel B');
    raise exception 'Completed but unreleased compartment unexpectedly reallocated';
  exception when unique_violation then null; end;
end;
$$;
-- Only an explicit backend-confirmed safe release permits another reservation.
update public.orders set compartment_released_at = now()
  where id = '30000000-0000-4000-8000-000000000001';
insert into public.orders (user_id, bot_id, compartment_id, destination_hostel_block)
values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 1, 'Hostel B');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.bots) <> 0 then raise exception 'Completed order still exposes live bot'; end if;
  if (select count(*) from public.orders) <> 1 then raise exception 'Completed order history missing'; end if;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare relation_name text; operation text;
begin
  foreach relation_name in array array['users', 'bots', 'orders', 'transactions'] loop
    foreach operation in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(current_user, 'public.' || relation_name, operation)
        then raise exception 'Anon has % on %', operation, relation_name; end if;
    end loop;
    begin
      execute format('select count(*) from public.%I', relation_name);
      raise exception 'Anon can read %', relation_name;
    exception when insufficient_privilege then null; end;
  end loop;
end;
$$;
reset role;

set local role service_role;
do $$
declare changed integer;
begin
  if not (select rolbypassrls from pg_roles where rolname = current_user)
    then raise exception 'Service role must bypass RLS'; end if;
  if (select count(*) from public.users) < 2
    then raise exception 'Service role cannot read all profiles'; end if;
  update public.bots set battery_level = 80
    where id = '20000000-0000-4000-8000-000000000001';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Service role bot update failed'; end if;
end;
$$;
reset role;

select 'Phase 0 schema/RLS assertions passed; test changes rolled back.' as result;
rollback;
