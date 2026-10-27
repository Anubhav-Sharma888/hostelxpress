-- Durable receipts for late critical observations; never execute expired commands.
begin;
alter table hostelxpress_private.device_events
  add column payload jsonb not null default '{}'::jsonb,
  add column outcome text not null default 'applied'
    check(outcome in ('applied','reconciliation_required')),
  add column reconciliation_reason text;
create index device_events_reconciliation_idx on hostelxpress_private.device_events(received_at)
  where outcome='reconciliation_required';
comment on column hostelxpress_private.device_events.outcome is
  'A stored receipt is durable observation acceptance, not proof of applied business state or physical execution. Late critical observations require operator reconciliation.';
insert into hostelxpress_private.schema_migrations(version) values('0002_device_reconciliation');
commit;
