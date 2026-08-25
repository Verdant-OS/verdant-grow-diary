\set ON_ERROR_STOP on
\set VERBOSITY verbose

-- Disposable PostgreSQL 15 catalog fixture for the exact production
-- PREFLIGHT_SQL/buildApplySql path. The Node harness replaces the two explicit
-- function placeholders with definitions extracted from immutable migrations.

\if :{?harness_confirmation}
\else
  \echo 'restored-history ledger PG15 harness confirmation missing'
  \quit 3
\endif

select (
  :'harness_confirmation' =
    'verdant_restored_history_ledger_reconciliation_pg15_disposable_v2'
  and current_database() = 'postgres'
  and current_user = 'postgres'
  and current_setting('server_version_num')::integer >= 150000
  and current_setting('server_version_num')::integer < 160000
  and exists (
    select 1
    from verdant_restored_history_ledger_reconciliation_harness.runtime_sentinel
    where sentinel =
      'verdant_restored_history_ledger_reconciliation_pg15_disposable_v2'
  )
) as harness_target_attested
\gset

\if :harness_target_attested
\else
  \echo 'restored-history ledger PG15 harness target rejected'
  \quit 3
\endif

drop schema if exists supabase_migrations cascade;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema auth authorization postgres;
create schema public authorization postgres;
create schema supabase_migrations authorization postgres;

do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

create table supabase_migrations.schema_migrations (
  version text not null,
  statements text[],
  name text,
  created_by text,
  idempotency_key text,
  rollback text[],
  constraint schema_migrations_pkey primary key (version),
  constraint schema_migrations_idempotency_key_key unique (idempotency_key)
);
alter table supabase_migrations.schema_migrations owner to postgres;
revoke all on table supabase_migrations.schema_migrations from public;

insert into supabase_migrations.schema_migrations(version, name)
values (
  '20260709015800',
  '20260709015758_d49efeac-492c-4f7b-9746-3638f44fa287'
);

create type public.app_role as enum ('grower', 'staff');
create table public.user_roles (
  user_id uuid not null,
  role public.app_role not null,
  primary key (user_id, role)
);
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz
);

create function auth.uid()
returns uuid
language sql
stable
as $uid$
  select null::uuid
$uid$;

create table public.pheno_hunts (
  id uuid primary key,
  notes text,
  setup_completed_at timestamptz,
  constraint pheno_hunts_notes_length check (
    notes is null or (char_length(notes) >= 1 and char_length(notes) <= 4000)
  )
);
comment on column public.pheno_hunts.setup_completed_at is
  'When guided setup was completed. NULL = setup in progress (workspace shows the setup progress card). Legacy hunts backfilled to created_at.';

create function public.grant_staff_role_for_verified_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $legacy_staff$
begin
  return new;
end
$legacy_staff$;
revoke all on function public.grant_staff_role_for_verified_email()
  from public, anon, authenticated, service_role;

-- __EXACT_STAFF_ALLOWLIST_FUNCTION__

alter function public.grant_staff_role_for_verified_allowlist() owner to postgres;
revoke all on function public.grant_staff_role_for_verified_allowlist()
  from public, anon, authenticated;
grant execute on function public.grant_staff_role_for_verified_allowlist()
  to service_role;

create trigger on_auth_user_created_grant_staff
after insert on auth.users
for each row execute function public.grant_staff_role_for_verified_allowlist();

create trigger on_auth_user_confirmed_grant_staff
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.grant_staff_role_for_verified_allowlist();

-- __EXACT_QUICKLOG_SAVE_EVENT_FUNCTION__

alter function public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) owner to postgres;
revoke all on function public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) to authenticated, service_role;
comment on function public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) is 'Authenticated Quick Log event writer. Persists canonical Captured logged_at separately from occurred_at and preserves atomic per-user idempotency.';

-- Application-shaped sentinels. The exact production preflight/apply SQL must
-- leave both tables byte-for-byte unchanged.
create table public.diary_entries (
  id bigint primary key,
  payload text not null
);
create table public.sensor_readings (
  id bigint primary key,
  payload text not null
);
insert into public.diary_entries(id, payload) values
  (1, 'private-grower-diary-sentinel'),
  (2, 'private-plant-timeline-sentinel');
insert into public.sensor_readings(id, payload) values
  (1, 'manual-sensor-sentinel'),
  (2, 'stale-sensor-sentinel');

create or replace function
  verdant_restored_history_ledger_reconciliation_harness.application_digest()
returns text
language sql
stable
set search_path = pg_catalog, pg_temp
as $application_digest$
  select pg_catalog.md5(
    coalesce((
      select pg_catalog.string_agg(d.id::text || ':' || d.payload, '|' order by d.id)
      from public.diary_entries as d
    ), '') || '#' || coalesce((
      select pg_catalog.string_agg(s.id::text || ':' || s.payload, '|' order by s.id)
      from public.sensor_readings as s
    ), '')
  )
$application_digest$;
revoke all on function
  verdant_restored_history_ledger_reconciliation_harness.application_digest()
  from public;

select 'catalog_fixture_ready';
