/**
 * Measured-value proof for quicklog_correct_entry.
 * Moved out of the scorer-locked PG15 harness. Disposable database only.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { EDITABLE_VALUES_CORRECT_ENTRY_FINGERPRINT } from "./assert-required-core-migrations-applied.mjs";

const DB = process.env.QUICKLOG_CORRECTION_MEASURED_DB ?? "quicklog_correction_measured";
const OWNER = "11111111-1111-4111-8111-111111111111";

const SETUP = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select '${OWNER}'::uuid
$$;
create table if not exists public.grows (id uuid primary key, user_id uuid not null);
create table if not exists public.tents (id uuid primary key, user_id uuid not null, grow_id uuid);
create table if not exists public.plants (
  id uuid primary key, user_id uuid not null, grow_id uuid, tent_id uuid
);
create table if not exists public.grow_events (
  id uuid primary key,
  user_id uuid not null,
  event_type text,
  source text,
  note text,
  occurred_at timestamptz not null default now(),
  grow_id uuid,
  tent_id uuid,
  plant_id uuid,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.diary_entries (
  id uuid primary key,
  user_id uuid not null,
  note text,
  details jsonb,
  entry_at timestamptz not null default now(),
  grow_id uuid,
  tent_id uuid,
  plant_id uuid,
  retracted_at timestamptz
);
create table if not exists public.quicklog_entry_revisions (
  id uuid primary key default gen_random_uuid(),
  grow_event_id uuid,
  diary_entry_id uuid,
  root_id uuid not null,
  user_id uuid not null,
  actor_id uuid not null,
  revision_no integer not null,
  kind text not null,
  reason_code text not null,
  reason_note text,
  previous_state jsonb not null default '{}'::jsonb,
  new_state jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.watering_events (
  event_id uuid primary key, user_id uuid not null, volume_ml numeric
);
create table if not exists public.feeding_events (
  event_id uuid primary key, user_id uuid not null, volume_ml numeric, products jsonb
);
create table if not exists public.environment_events (
  event_id uuid primary key, user_id uuid not null,
  temperature_c numeric, humidity_pct numeric, vpd_kpa numeric
);
create or replace function public.quicklog_try_parse_uuid(raw text) returns uuid
language plpgsql immutable as $$
begin
  return raw::uuid;
exception when others then
  return null;
end $$;
create or replace function public.quicklog_revision_sibling_env_ids(
  uid uuid, p_parent public.grow_events
) returns uuid[] language sql stable as $$
  select coalesce(array_agg(e.id), '{}'::uuid[])
    from public.grow_events e
   where e.user_id = uid
     and e.id <> p_parent.id
     and e.event_type = 'environment'
     and e.source = 'manual'
     and e.created_at = p_parent.created_at
$$;
create or replace function public.quicklog_revision_rebase_captured_at(jsonb, timestamptz, timestamptz)
returns jsonb language sql stable as $$ select $1 $$;
create or replace function public.quicklog_revision_resolve_root(
  uid uuid, p_grow_event_id uuid, p_diary_entry_id uuid,
  out out_reason text, out out_grow_event_id uuid, out out_diary_entry_id uuid
) returns record language plpgsql as $$
begin
  if p_grow_event_id is not null and exists (
    select 1 from public.grow_events e
     where e.id = p_grow_event_id and e.user_id = uid and e.source = 'manual'
  ) then
    out_grow_event_id := p_grow_event_id;
    return;
  end if;
  if p_diary_entry_id is not null and exists (
    select 1 from public.diary_entries d
     where d.id = p_diary_entry_id and d.user_id = uid
  ) then
    out_diary_entry_id := p_diary_entry_id;
    return;
  end if;
  out_reason := 'not_found_or_not_owned';
end;
$$;
`;

const MEASURED_CORRECTION_PROOF_SQL = `
begin;
create or replace function auth.uid() returns uuid language sql stable as $$
  select '${OWNER}'::uuid
$$;
insert into auth.users(id) values ('${OWNER}') on conflict do nothing;
insert into public.grow_events(id, user_id, event_type, source, note)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${OWNER}', 'watering', 'manual', 'water'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '${OWNER}', 'feeding', 'manual', 'feed'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '${OWNER}', 'environment', 'manual', 'sensor');
insert into public.diary_entries(id, user_id, note, details)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '${OWNER}', 'water',
    '{"event_type":"watering","linked_grow_event_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","watering":{"volume_ml":500}}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '${OWNER}', 'feed',
    '{"event_type":"feeding","linked_grow_event_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","watering_amount_ml":200,"feeding":{"volume_ml":200,"products":[{"name":"Grow","amount":2,"unit":"ml"}]}}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '${OWNER}', 'sensor',
    '{"event_type":"environment","linked_grow_event_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3","sensor_snapshot":{"metrics":{"temperature_c":24,"humidity_pct":55,"vpd_kpa":1.2}}}');
insert into public.watering_events(event_id, user_id, volume_ml)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${OWNER}', 500);
insert into public.feeding_events(event_id, user_id, volume_ml, products)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '${OWNER}', 200, '[{"name":"Grow","amount":2,"unit":"ml"}]');
insert into public.environment_events(event_id, user_id, temperature_c, humidity_pct, vpd_kpa)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '${OWNER}', 24, 55, 1.2);

do $proof$
declare
  v_water jsonb;
  v_feed jsonb;
  v_sensor jsonb;
  v_prev jsonb;
  v_feed_details jsonb;
begin
  v_water := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":750}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null);
  if coalesce(v_water ->> 'ok', '') <> 'true' then
    raise exception 'watering correction failed: %', v_water;
  end if;
  if (select volume_ml from public.watering_events where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') is distinct from 750 then
    raise exception 'watering volume was not updated';
  end if;
  select previous_state into v_prev from public.quicklog_entry_revisions
   where grow_event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if (v_prev ->> 'volume_ml')::numeric is distinct from 500 then
    raise exception 'watering history lost the original volume: %', v_prev;
  end if;

  v_feed := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":300,"dose_amount":4}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', null, null);
  if coalesce(v_feed ->> 'ok', '') <> 'true' then
    raise exception 'feeding correction failed: %', v_feed;
  end if;
  select details into v_feed_details from public.diary_entries where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  if (v_feed_details #>> '{feeding,volume_ml}')::numeric is distinct from 300 then
    raise exception 'feeding volume missing from feeding details: %', v_feed_details;
  end if;
  if (v_feed_details ->> 'watering_amount_ml')::numeric is distinct from 300 then
    raise exception 'feeding flat watering_amount_ml alias stayed stale: %', v_feed_details;
  end if;
  if v_feed_details #> '{watering,volume_ml}' is not null then
    raise exception 'feeding volume wrote watering details: %', v_feed_details;
  end if;
  if (v_feed_details #>> '{feeding,products,0,amount}')::numeric is distinct from 4 then
    raise exception 'feeding dose was not updated: %', v_feed_details;
  end if;
  select previous_state into v_prev from public.quicklog_entry_revisions
   where grow_event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  if (v_prev ->> 'volume_ml')::numeric is distinct from 200 or (v_prev ->> 'dose_amount')::numeric is distinct from 2 then
    raise exception 'feeding history lost the original values: %', v_prev;
  end if;

  insert into public.grow_events(id, user_id, event_type, source, note)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '${OWNER}', 'feeding', 'manual', 'flat feed');
  insert into public.diary_entries(id, user_id, note, details)
  values (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', '${OWNER}', 'flat feed',
    '{"event_type":"feeding","linked_grow_event_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4","watering_amount_ml":180}'
  );
  insert into public.feeding_events(event_id, user_id, volume_ml, products)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '${OWNER}', null, '[{"name":"Grow","amount":1,"unit":"ml"}]');
  v_feed := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":250}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', null, null);
  if coalesce(v_feed ->> 'ok', '') <> 'true' then
    raise exception 'flat feeding volume correction failed: %', v_feed;
  end if;
  select previous_state into v_prev from public.quicklog_entry_revisions
   where grow_event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
  if (v_prev ->> 'volume_ml')::numeric is distinct from 180 then
    raise exception 'feeding audit fallback ignored the flat volume alias: %', v_prev;
  end if;

  v_sensor := public.quicklog_correct_entry(
    'wrong_value', '{"sensor_values":{"temperature_c":26,"humidity_pct":60,"vpd_kpa":1.4}}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', null, null);
  if coalesce(v_sensor ->> 'ok', '') <> 'true' then
    raise exception 'sensor correction failed: %', v_sensor;
  end if;
  if (select temperature_c from public.environment_events where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3') is distinct from 26 then
    raise exception 'sensor temperature was not updated';
  end if;
  select previous_state into v_prev from public.quicklog_entry_revisions
   where grow_event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  if (v_prev #>> '{environment_events,0,temperature_c}')::numeric is distinct from 24 then
    raise exception 'sensor history lost the original temperature: %', v_prev;
  end if;
end
$proof$;
rollback;
`;

const OBSERVATION_COMPANION_SQL = `
begin;
insert into public.grow_events(id, user_id, event_type, source, note, created_at)
values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '${OWNER}', 'observation', 'manual', 'fast check', '2026-07-25 13:03:28+00'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '${OWNER}', 'environment', 'manual', null, '2026-07-25 13:03:28+00');
insert into public.diary_entries(id, user_id, note, details)
values (
  'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '${OWNER}', 'Network-inspection retest',
  '{"event_type":"observation","source":"manual","feeding":null,"watering":null,"photo_url":null,"quick_log_version":2,"linked_grow_event_id":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1","manual_sensor_snapshot":{"source":"manual","temp_f":75.2,"humidity_percent":55}}'
);
insert into public.environment_events(event_id, user_id, temperature_c, humidity_pct, vpd_kpa)
values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '${OWNER}', 24, 55, 1.1);
do $obs$
declare
  v_result jsonb;
  v_prev jsonb;
begin
  v_result := public.quicklog_correct_entry(
    'wrong_value', '{"sensor_values":{"temperature_c":26}}'::jsonb,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', null, null);
  if coalesce(v_result ->> 'ok', '') <> 'true' then
    raise exception 'observation companion correction failed: %', v_result;
  end if;
  if (select temperature_c from public.environment_events
       where event_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2') is distinct from 26 then
    raise exception 'observation companion temperature was not updated';
  end if;
  select previous_state into v_prev from public.quicklog_entry_revisions
   where grow_event_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  if (v_prev #>> '{environment_events,0,temperature_c}')::numeric is distinct from 24 then
    raise exception 'observation companion history lost the original temperature: %', v_prev;
  end if;
  if (select (details #>> '{manual_sensor_snapshot,temp_f}')::numeric
        from public.diary_entries
       where id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1') is distinct from 78.8 then
    raise exception 'manual sensor snapshot mirror kept the old Fahrenheit temperature';
  end if;
end
$obs$;
rollback;
`;

const VOLUME_CAP_SQL = `
begin;
insert into public.grow_events(id, user_id, event_type, source, note)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '${OWNER}', 'watering', 'manual', 'water cap'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '${OWNER}', 'feeding', 'manual', 'feed cap');
insert into public.diary_entries(id, user_id, note, details)
values
  ('ffffffff-ffff-4fff-8fff-fffffffffff1', '${OWNER}', 'water cap',
    '{"event_type":"watering","linked_grow_event_id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1","watering":{"volume_ml":500}}'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff2', '${OWNER}', 'feed cap',
    '{"event_type":"feeding","linked_grow_event_id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2","feeding":{"volume_ml":200,"products":[{"name":"Grow","amount":2,"unit":"ml"}]}}');
insert into public.watering_events(event_id, user_id, volume_ml)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '${OWNER}', 500);
insert into public.feeding_events(event_id, user_id, volume_ml, products)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '${OWNER}', 200, '[{"name":"Grow","amount":2,"unit":"ml"}]');
do $cap$
declare
  v_result jsonb;
begin
  v_result := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":50001}'::jsonb,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', null, null);
  if coalesce(v_result ->> 'ok', '') <> 'false' or v_result ->> 'reason' <> 'invalid_changes' then
    raise exception 'watering correction above 50000 ml was not rejected: %', v_result;
  end if;
  if (select volume_ml from public.watering_events
       where event_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1') is distinct from 500 then
    raise exception 'rejected watering correction changed the volume';
  end if;
  if exists (select 1 from public.quicklog_entry_revisions
              where grow_event_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1') then
    raise exception 'rejected watering correction appended a revision';
  end if;
  v_result := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":50000}'::jsonb,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', null, null);
  if coalesce(v_result ->> 'ok', '') <> 'true' then
    raise exception 'watering correction at 50000 ml failed: %', v_result;
  end if;
  if (select volume_ml from public.watering_events
       where event_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1') is distinct from 50000 then
    raise exception 'watering volume was not updated to 50000 ml';
  end if;
  v_result := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":1000000}'::jsonb,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', null, null);
  if coalesce(v_result ->> 'ok', '') <> 'true' then
    raise exception 'feeding correction at 1000000 ml failed: %', v_result;
  end if;
  if (select volume_ml from public.feeding_events
       where event_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2') is distinct from 1000000 then
    raise exception 'feeding volume was not updated to 1000000 ml';
  end if;
end
$cap$;
rollback;
`;

const ENVIRONMENT_CHECK_SQL = `
begin;
insert into public.grow_events(id, user_id, event_type, source, note)
values ('99999999-9999-4999-8999-999999999991', '${OWNER}', 'environment_check', 'manual', 'env check');
insert into public.diary_entries(id, user_id, note, details)
values (
  '88888888-8888-4888-8888-888888888881', '${OWNER}', 'env check',
  '{"event_type":"environment_check","linked_grow_event_id":"99999999-9999-4999-8999-999999999991","environment_check":{"temperature_c":24,"humidity_pct":55}}'
);
do $envcheck$
declare
  v_result jsonb;
begin
  v_result := public.quicklog_correct_entry(
    'wrong_value', '{"sensor_values":{"temperature_c":26}}'::jsonb,
    '99999999-9999-4999-8999-999999999991', null, null);
  if coalesce(v_result ->> 'ok', '') <> 'false' or v_result ->> 'reason' <> 'unsupported_change' then
    raise exception 'Environment Check sensor correction was not rejected: %', v_result;
  end if;
  if exists (select 1 from public.quicklog_entry_revisions
              where grow_event_id = '99999999-9999-4999-8999-999999999991') then
    raise exception 'rejected Environment Check sensor correction appended a revision';
  end if;
  if (select details from public.diary_entries
       where id = '88888888-8888-4888-8888-888888888881')
     is distinct from '{"event_type":"environment_check","linked_grow_event_id":"99999999-9999-4999-8999-999999999991","environment_check":{"temperature_c":24,"humidity_pct":55}}'::jsonb then
    raise exception 'rejected Environment Check sensor correction changed the diary row';
  end if;
end
$envcheck$;
rollback;
`;

// A watering Quick Log saved with temperature/RH/VPD writes a watering root
// plus a manual environment sibling. One correction updates both; without an
// owned environment sibling, sensor values on a watering root stay rejected.
const WATERING_SENSOR_SQL = `
begin;
insert into public.grow_events(id, user_id, event_type, source, note, created_at)
values
  ('12121212-1212-4121-8121-121212121211', '${OWNER}', 'watering', 'manual', 'water + readings', '2026-07-26 09:00:00+00'),
  ('12121212-1212-4121-8121-121212121212', '${OWNER}', 'environment', 'manual', null, '2026-07-26 09:00:00+00'),
  ('12121212-1212-4121-8121-121212121213', '${OWNER}', 'watering', 'manual', 'water only', '2026-07-26 10:00:00+00');
insert into public.diary_entries(id, user_id, note, details)
values
  ('34343434-3434-4343-8343-343434343431', '${OWNER}', 'water + readings',
    '{"event_type":"watering","linked_grow_event_id":"12121212-1212-4121-8121-121212121211","watering":{"volume_ml":500}}'),
  ('34343434-3434-4343-8343-343434343433', '${OWNER}', 'water only',
    '{"event_type":"watering","linked_grow_event_id":"12121212-1212-4121-8121-121212121213","watering":{"volume_ml":400}}');
insert into public.watering_events(event_id, user_id, volume_ml)
values
  ('12121212-1212-4121-8121-121212121211', '${OWNER}', 500),
  ('12121212-1212-4121-8121-121212121213', '${OWNER}', 400);
insert into public.environment_events(event_id, user_id, temperature_c, humidity_pct, vpd_kpa)
values ('12121212-1212-4121-8121-121212121212', '${OWNER}', 24, 55, 1.1);
do $watersensor$
declare
  v_result jsonb;
  v_prev jsonb;
  v_new jsonb;
begin
  v_result := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":750,"sensor_values":{"temperature_c":26,"humidity_pct":60}}'::jsonb,
    '12121212-1212-4121-8121-121212121211', null, null);
  if coalesce(v_result ->> 'ok', '') <> 'true' then
    raise exception 'combined watering + sensor correction failed: %', v_result;
  end if;
  if (select volume_ml from public.watering_events
       where event_id = '12121212-1212-4121-8121-121212121211') is distinct from 750 then
    raise exception 'combined correction did not update the watering volume';
  end if;
  if (select temperature_c from public.environment_events
       where event_id = '12121212-1212-4121-8121-121212121212') is distinct from 26
     or (select humidity_pct from public.environment_events
       where event_id = '12121212-1212-4121-8121-121212121212') is distinct from 60 then
    raise exception 'combined correction did not update the environment sibling';
  end if;
  if (select count(*) from public.quicklog_entry_revisions
       where grow_event_id = '12121212-1212-4121-8121-121212121211') <> 1 then
    raise exception 'combined correction did not append exactly one revision';
  end if;
  select previous_state, new_state into v_prev, v_new from public.quicklog_entry_revisions
   where grow_event_id = '12121212-1212-4121-8121-121212121211';
  if (v_prev ->> 'volume_ml')::numeric is distinct from 500
     or (v_prev #>> '{environment_events,0,temperature_c}')::numeric is distinct from 24
     or (v_prev #>> '{environment_events,0,humidity_pct}')::numeric is distinct from 55 then
    raise exception 'combined correction history lost an original value: %', v_prev;
  end if;
  if (v_new ->> 'volume_ml')::numeric is distinct from 750
     or (v_new #>> '{sensor_values,temperature_c}')::numeric is distinct from 26
     or (v_new #>> '{sensor_values,humidity_pct}')::numeric is distinct from 60 then
    raise exception 'combined correction history lost a new value: %', v_new;
  end if;

  v_result := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":600,"sensor_values":{"temperature_c":26}}'::jsonb,
    '12121212-1212-4121-8121-121212121213', null, null);
  if coalesce(v_result ->> 'ok', '') <> 'false' or v_result ->> 'reason' <> 'unsupported_change' then
    raise exception 'watering sensor correction without an owned environment sibling was not rejected: %', v_result;
  end if;
  if (select volume_ml from public.watering_events
       where event_id = '12121212-1212-4121-8121-121212121213') is distinct from 400 then
    raise exception 'rejected watering sensor correction changed the volume';
  end if;
  if exists (select 1 from public.quicklog_entry_revisions
              where grow_event_id = '12121212-1212-4121-8121-121212121213') then
    raise exception 'rejected watering sensor correction appended a revision';
  end if;
end
$watersensor$;
rollback;
`;

function pgArgs() {
  const args = [];
  if (process.env.PGHOST) args.push("-h", process.env.PGHOST);
  if (process.env.PGPORT) args.push("-p", process.env.PGPORT);
  if (process.env.PGUSER) args.push("-U", process.env.PGUSER);
  return args;
}

function psql(db, sql) {
  const result = spawnSync(
    "psql",
    [...pgArgs(), "-d", db, "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      encoding: "utf8",
      maxBuffer: 8_000_000,
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql failed");
  }
  return (result.stdout ?? "").trim();
}

function main() {
  spawnSync("dropdb", [...pgArgs(), "--if-exists", DB], { encoding: "utf8" });
  const created = spawnSync("createdb", [...pgArgs(), DB], { encoding: "utf8" });
  if (created.status !== 0) throw new Error(created.stderr || "createdb failed");
  psql(DB, SETUP);
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261014210000_quicklog_correction_editable_values.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const applied = spawnSync(
    "psql",
    [
      ...pgArgs(),
      "-d",
      DB,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "set check_function_bodies = off",
      "-c",
      migration,
    ],
    { encoding: "utf8", maxBuffer: 8_000_000 },
  );
  if (applied.status !== 0) throw new Error(applied.stderr || applied.stdout);
  const pin = EDITABLE_VALUES_CORRECT_ENTRY_FINGERPRINT;
  const row = psql(
    DB,
    `select md5(pg_get_functiondef(p.oid))||'|'||octet_length(pg_get_functiondef(p.oid))||'|'||md5(p.prosrc)||'|'||octet_length(p.prosrc)
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where p.oid = to_regprocedure('public.quicklog_correct_entry(text,jsonb,uuid,uuid,text)');`,
  );
  const expected = `${pin.md5}|${pin.bytes}|${pin.prosrcMd5}|${pin.prosrcBytes}`;
  if (row !== expected) throw new Error(`editable_values_fingerprint:mismatch ${row}`);
  psql(DB, MEASURED_CORRECTION_PROOF_SQL);
  psql(DB, OBSERVATION_COMPANION_SQL);
  psql(DB, VOLUME_CAP_SQL);
  psql(DB, ENVIRONMENT_CHECK_SQL);
  psql(DB, WATERING_SENSOR_SQL);
  console.log(
    "measured correction proof: watering, feeding, sensor, observation companion, watering with readings, volume caps, and Environment Check rejection passed",
  );
  spawnSync("dropdb", [...pgArgs(), "--if-exists", DB], { encoding: "utf8" });
}

main();
