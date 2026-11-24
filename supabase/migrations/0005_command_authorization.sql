-- Stop command publishers before applying; restart only with OTP2-aware code.
-- Published/executed receipts are retained for physical reconciliation.
begin;
update hostelxpress_private.command_outbox c
set status='rejected',last_error='pickup_authorization_missing'
where c.command='unlock_inner' and c.status='pending' and c.is_demo=false
  and not exists (
    select 1 from hostelxpress_private.pickup_otp_challenges p
    where p.order_id=c.order_id and p.bot_id=c.bot_id
      and p.compartment=c.compartment and p.consumed_at is not null
      and p.consumed_at<=c.issued_at
  );
comment on table hostelxpress_private.command_outbox is
  'Guarded physical command outbox. Inner unlock requires captured payment and prior bound OTP2 redemption. Outer unlock requires authenticated gate staff loading authorization. MQTT publication is not physical execution.';
insert into hostelxpress_private.schema_migrations(version)
values ('0005_command_authorization') on conflict do nothing;
commit;
