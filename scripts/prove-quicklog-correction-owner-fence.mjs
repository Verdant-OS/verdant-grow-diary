/**
 * Owner fence and measured-value edges for quicklog_correct_entry.
 * Disposable database only. Does not edit the scorer-locked pg15 harness.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DB = process.env.QUICKLOG_CORRECTION_FENCE_DB ?? "quicklog_correction_fence";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const SETUP = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select '${OWNER}'::uuid
$$;
create table if not exists public.grow_events (
  id uuid primary key,
  user_id uuid not null,
  event_type text,
  source text,
  note text,
  occurred_at timestamptz,
  grow_id uuid,
  tent_id uuid,
  plant_id uuid,
  is_deleted boolean,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.diary_entries (
  id uuid primary key,
  user_id uuid not null,
  note text,
  details jsonb,
  entry_at timestamptz,
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
  temperature_c numeric not null, humidity_pct numeric not null, vpd_kpa numeric not null
);
create or replace function public.quicklog_revision_rebase_captured_at(jsonb, timestamptz, timestamptz)
returns jsonb language sql stable as $$ select $1 $$;
`;

const PROOF = `
insert into public.grow_events(id, user_id, event_type, source, note)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${OWNER}', 'watering', 'manual', 'water');
insert into public.diary_entries(id, user_id, note, details)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '${OWNER}', 'water',
  '{"event_type":"watering","watering":{"volume_ml":500}}'
);
insert into public.watering_events(event_id, user_id, volume_ml)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${OWNER}', 500);

do $proof$
declare
  v_denied jsonb;
  v_volume numeric;
begin
  execute 'create or replace function auth.uid() returns uuid language sql stable as $fn$ select ''${OTHER}''::uuid $fn$';
  v_denied := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":750}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', null, null);
  if coalesce(v_denied ->> 'reason', '') <> 'not_found_or_not_owned' then
    raise exception 'non-owner was not refused: %', v_denied;
  end if;
  select volume_ml into v_volume from public.watering_events
   where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if v_volume <> 500 then
    raise exception 'non-owner changed the volume to %', v_volume;
  end if;

  execute 'create or replace function auth.uid() returns uuid language sql stable as $fn$ select ''${OWNER}''::uuid $fn$';

  insert into public.diary_entries(id, user_id, note, details)
  values (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', '${OWNER}', 'diary only',
    '{"event_type":"watering","quick_log_version":2,"watering":{"volume_ml":320}}'
  );
  v_denied := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":330}'::jsonb,
    null, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', null);
  if coalesce(v_denied ->> 'ok', '') <> 'true' then
    raise exception 'diary-only correction failed: %', v_denied;
  end if;
  if (select (previous_state ->> 'volume_ml')::numeric from public.quicklog_entry_revisions
       where diary_entry_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4') is distinct from 320 then
    raise exception 'diary-only history lost the original volume';
  end if;

  insert into public.grow_events(id, user_id, event_type, source)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '${OWNER}', 'environment', 'manual');
  insert into public.environment_events(event_id, user_id, temperature_c, humidity_pct, vpd_kpa)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '${OWNER}', 24, 55, 1.2);
  v_denied := public.quicklog_correct_entry(
    'wrong_value', '{"sensor_values":{"temperature_c":null}}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', null, null);
  if coalesce(v_denied ->> 'reason', '') <> 'invalid_changes' then
    raise exception 'null sensor was not rejected: %', v_denied;
  end if;

  insert into public.diary_entries(id, user_id, note, details)
  values (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', '${OWNER}', 'nutrient only',
    '{"event_type":"feeding","quick_log_version":2,"nutrients":[{"name":"Grow","amount":2,"unit":"ml"}]}'
  );
  v_denied := public.quicklog_correct_entry(
    'wrong_value', '{"dose_amount":4}'::jsonb,
    null, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', null);
  if coalesce(v_denied ->> 'ok', '') <> 'true' then
    raise exception 'nutrients dose correction failed: %', v_denied;
  end if;
  if (select (details #>> '{nutrients,0,amount}')::numeric from public.diary_entries
       where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5') is distinct from 4 then
    raise exception 'nutrients amount was not updated';
  end if;

  insert into public.diary_entries(id, user_id, note, details)
  values (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6', '${OWNER}', 'flat water',
    '{"event_type":"watering","quick_log_version":2,"watering_amount_ml":410}'
  );
  v_denied := public.quicklog_correct_entry(
    'wrong_value', '{"volume_ml":420}'::jsonb,
    null, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6', null);
  if coalesce(v_denied ->> 'ok', '') <> 'true' then
    raise exception 'flat watering correction failed: %', v_denied;
  end if;
  if (select (details ->> 'watering_amount_ml')::numeric from public.diary_entries
       where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6') is distinct from 420 then
    raise exception 'flat watering amount was not updated';
  end if;
  if (select (previous_state ->> 'volume_ml')::numeric from public.quicklog_entry_revisions
       where diary_entry_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6') is distinct from 410 then
    raise exception 'flat watering history lost the original amount';
  end if;

  insert into public.grow_events(id, user_id, event_type, source)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '${OWNER}', 'environment', 'manual');
  insert into public.environment_events(event_id, user_id, temperature_c, humidity_pct, vpd_kpa)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '${OWNER}', 24, 55, 1.2);
  v_denied := public.quicklog_correct_entry(
    'wrong_value', '{"sensor_values":{"humidity_pct":null}}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', null, null);
  if coalesce(v_denied ->> 'reason', '') <> 'invalid_changes' then
    raise exception 'null humidity was not rejected: %', v_denied;
  end if;
  if (select humidity_pct from public.environment_events
       where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4') is distinct from 55 then
    raise exception 'null humidity changed the stored humidity';
  end if;
end
$proof$;
`;

const DIARY_ONLY = `
insert into public.diary_entries(id, user_id, note, details)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', '${OWNER}', 'diary only',
  '{"event_type":"watering","quick_log_version":2,"watering":{"volume_ml":320}}'
);
select public.quicklog_correct_entry(
  'wrong_value', '{"volume_ml":330}'::jsonb,
  null, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', null) as result;
`;

const FLAT_WATERING = `
insert into public.diary_entries(id, user_id, note, details)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6', '${OWNER}', 'flat water',
  '{"event_type":"watering","quick_log_version":2,"watering_amount_ml":410}'
);
select public.quicklog_correct_entry(
  'wrong_value', '{"volume_ml":420}'::jsonb,
  null, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6', null) as result;
`;

const NUTRIENTS_DOSE = `
insert into public.diary_entries(id, user_id, note, details)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', '${OWNER}', 'nutrient only',
  '{"event_type":"feeding","quick_log_version":2,"nutrients":[{"name":"Grow","amount":2,"unit":"ml"}]}'
);
select public.quicklog_correct_entry(
  'wrong_value', '{"dose_amount":4}'::jsonb,
  null, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', null) as result;
`;

const NULL_HUMIDITY = `
insert into public.grow_events(id, user_id, event_type, source)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '${OWNER}', 'environment', 'manual');
insert into public.environment_events(event_id, user_id, temperature_c, humidity_pct, vpd_kpa)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '${OWNER}', 24, 55, 1.2);
select public.quicklog_correct_entry(
  'wrong_value', '{"sensor_values":{"humidity_pct":null}}'::jsonb,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', null, null) as result;
`;

const BROKEN_OWNERSHIP = `
create or replace function public.quicklog_revision_resolve_root(
  uid uuid, p_grow_event_id uuid, p_diary_entry_id uuid,
  out out_reason text, out out_grow_event_id uuid, out out_diary_entry_id uuid
) returns record language plpgsql as $$
begin
  out_grow_event_id := p_grow_event_id;
  out_diary_entry_id := p_diary_entry_id;
end;
$$;
`;

function extractFunction(sql, startMarker) {
  const start = sql.indexOf(startMarker);
  if (start < 0) throw new Error(`missing ${startMarker}`);
  const dollar = sql.indexOf("\n$$;", start);
  const named = sql.indexOf("\n$function$;", start);
  const cut = [dollar, named].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  if (cut === undefined) throw new Error(`unterminated ${startMarker}`);
  const closer = cut === named ? "\n$function$;" : "\n$$;";
  return sql.slice(start, cut + closer.length);
}

function migrationText(name) {
  return readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
}

function pgArgs() {
  const args = [];
  if (process.env.PGHOST) args.push("-h", process.env.PGHOST);
  if (process.env.PGPORT) args.push("-p", process.env.PGPORT);
  if (process.env.PGUSER) args.push("-U", process.env.PGUSER);
  return args;
}

function psql(db, sql) {
  return spawnSync("psql", [...pgArgs(), "-d", db, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  });
}

function psqlOrThrow(db, sql) {
  const result = psql(db, sql);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql failed");
  }
}

function applyMigration(db, sql) {
  const applied = spawnSync(
    "psql",
    [
      ...pgArgs(),
      "-d",
      db,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "set check_function_bodies = off",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  );
  if (applied.status !== 0) throw new Error(applied.stderr || applied.stdout);
}

function realOwnershipSql() {
  const parseUuid = extractFunction(
    migrationText("20260725024026_quicklog_dual_timestamp_foundation.sql"),
    "CREATE FUNCTION public.quicklog_try_parse_uuid",
  );
  const corrections = migrationText("20260811090000_quicklog_corrections_retractions.sql");
  return [
    parseUuid,
    extractFunction(
      corrections,
      "CREATE OR REPLACE FUNCTION public.quicklog_revision_resolve_root",
    ),
    extractFunction(
      corrections,
      "CREATE OR REPLACE FUNCTION public.quicklog_revision_sibling_env_ids",
    ),
    extractFunction(corrections, "CREATE OR REPLACE FUNCTION public.quicklog_correct_entry"),
  ].join("\n");
}

function main() {
  spawnSync("dropdb", [...pgArgs(), "--if-exists", DB], { encoding: "utf8" });
  const created = spawnSync("createdb", [...pgArgs(), DB], { encoding: "utf8" });
  if (created.status !== 0) throw new Error(created.stderr || "createdb failed");
  psqlOrThrow(DB, SETUP);
  applyMigration(DB, realOwnershipSql());
  for (const [label, sql] of [
    ["diary-only orphan", DIARY_ONLY],
    ["flat watering_amount_ml", FLAT_WATERING],
    ["dose from nutrients only", NUTRIENTS_DOSE],
    ["null humidity", NULL_HUMIDITY],
  ]) {
    const preFix = psql(DB, sql);
    const text = `${preFix.stdout ?? ""}\n${preFix.stderr ?? ""}`;
    const reason = text.match(/"reason": "([^"]+)"/)?.[1] ?? "";
    if (preFix.status !== 0 || reason !== "unsupported_change") {
      throw new Error(
        `${label} did not fail closed on the pre-fix function: status ${preFix.status} ${text}`,
      );
    }
    console.log(`pre-fix ${label}: ${reason}`);
    psqlOrThrow(
      DB,
      "truncate public.grow_events, public.diary_entries, public.watering_events, public.feeding_events, public.environment_events, public.quicklog_entry_revisions",
    );
  }
  psqlOrThrow(
    DB,
    "truncate public.grow_events, public.diary_entries, public.watering_events, public.feeding_events, public.environment_events, public.quicklog_entry_revisions",
  );
  applyMigration(DB, migrationText("20261014210000_quicklog_correction_editable_values.sql"));
  applyMigration(DB, BROKEN_OWNERSHIP);
  const broken = psql(DB, PROOF);
  if (broken.status === 0) {
    throw new Error("broken ownership check unexpectedly refused the non-owner");
  }
  console.log(
    `broken ownership failed: ${(broken.stderr || broken.stdout || "").split("\n").find((line) => line.includes("ERROR")) ?? "non-zero"}`,
  );
  psqlOrThrow(
    DB,
    "truncate public.grow_events, public.diary_entries, public.watering_events, public.feeding_events, public.environment_events, public.quicklog_entry_revisions",
  );
  applyMigration(
    DB,
    extractFunction(
      migrationText("20260811090000_quicklog_corrections_retractions.sql"),
      "CREATE OR REPLACE FUNCTION public.quicklog_revision_resolve_root",
    ),
  );
  psqlOrThrow(DB, PROOF);
  console.log("owner fence: non-owner received not_found_or_not_owned and the volume stayed 500");
  spawnSync("dropdb", [...pgArgs(), "--if-exists", DB], { encoding: "utf8" });
}

main();
