-- Gate 2 rider OTP, private and disabled until server-side credentials are set.
-- Run AFTER 0003; do not expose this schema via Supabase Data API.
begin;
create table hostelxpress_private.rider_otp_challenges (
  order_id uuid primary key references public.orders(id) on delete restrict,
  bot_id uuid not null references public.bots(id) on delete restrict,
  compartment smallint not null check (compartment between 1 and 3),
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 3),
  consumed_at timestamptz,
  constraint rider_otp_ttl check (expires_at > issued_at and expires_at <= issued_at + interval '5 minutes'),
  constraint rider_otp_consumed_time check (consumed_at is null or
    (consumed_at >= issued_at and consumed_at < expires_at))
);
create index rider_otp_unconsumed_expiry_idx
  on hostelxpress_private.rider_otp_challenges(expires_at) where consumed_at is null;
alter table hostelxpress_private.rider_otp_challenges enable row level security;
revoke all on hostelxpress_private.rider_otp_challenges from public,anon,authenticated;
-- A protected backend may use an explicitly authorized role, never a mobile key.
grant usage on schema hostelxpress_private to service_role;
grant select,insert,update on hostelxpress_private.rider_otp_challenges to service_role;
comment on table hostelxpress_private.rider_otp_challenges is
  'HostelXpress-owned OTP. Never store plaintext, expose to app users, or treat external carrier OTP as verified.';
insert into hostelxpress_private.schema_migrations(version) values ('0004_rider_otp_challenges');
commit;
