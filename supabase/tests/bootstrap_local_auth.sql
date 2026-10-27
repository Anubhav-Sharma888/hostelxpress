-- TEST FIXTURE ONLY: disposable plain PostgreSQL. Never run on Supabase.
-- Creates a minimal auth interface for schema/RLS tests, not an Auth emulator.
-- postgres superuser required; fail rather than modify an existing auth schema.
begin;
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    raise exception 'Refusing test bootstrap: auth schema already exists';
  end if;
  if exists (select 1 from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) then
    raise exception 'Refusing test bootstrap: test role names already exist';
  end if;
end;
$$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable set search_path = '' as $$
  select coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Simulate permissive Supabase defaults so migration revokes are exercised.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
commit;
