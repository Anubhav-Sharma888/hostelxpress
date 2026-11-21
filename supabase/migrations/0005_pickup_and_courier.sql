-- PRIVATE delivery codes. Requires 0001-0004; apply only to an approved
-- non-staging environment. OTP1 is courier display ONLY; OTP2 is student pickup.
begin;
create table hostelxpress_private.pickup_otp_challenges (
  order_id uuid primary key references public.orders(id) on delete restrict,
  bot_id uuid not null references public.bots(id) on delete restrict,
  compartment smallint not null check (compartment between 1 and 3),
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  code_ciphertext bytea,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 3),
  consumed_at timestamptz,
  constraint pickup_otp_ttl check (expires_at > issued_at and expires_at <= issued_at + interval '5 minutes'),
  constraint pickup_otp_consumed check (consumed_at is null or
    (consumed_at >= issued_at and consumed_at < expires_at))
);
create index pickup_otp_expiry_idx on hostelxpress_private.pickup_otp_challenges(expires_at)
 where consumed_at is null;
alter table hostelxpress_private.pickup_otp_challenges enable row level security;
revoke all on hostelxpress_private.pickup_otp_challenges from public,anon,authenticated;
grant usage on schema hostelxpress_private to service_role;
grant select,insert,update on hostelxpress_private.pickup_otp_challenges to service_role;
comment on table hostelxpress_private.pickup_otp_challenges is
 'OTP2: student pickup code. HMAC digest and AES-GCM ciphertext; requires payment capture and signed device redemption.';

create table hostelxpress_private.courier_code_messages (
  order_id uuid primary key references public.orders(id) on delete restrict,
  bot_id uuid not null references public.bots(id) on delete restrict,
  compartment smallint not null check (compartment between 1 and 3),
  code_ciphertext bytea,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  read_at timestamptz,
  constraint courier_code_ttl check (expires_at > created_at and expires_at <= created_at + interval '5 minutes')
);
create index courier_message_expiry_idx on hostelxpress_private.courier_code_messages(expires_at)
 where read_at is null;
alter table hostelxpress_private.courier_code_messages enable row level security;
revoke all on hostelxpress_private.courier_code_messages from public,anon,authenticated;
grant select,insert,update on hostelxpress_private.courier_code_messages to service_role;
comment on table hostelxpress_private.courier_code_messages is
 'OTP1: encrypted courier-platform code shown once to assigned rover; never validates courier OTP or authorizes unlock.';
insert into hostelxpress_private.schema_migrations(version) values ('0005_pickup_and_courier');
commit;
