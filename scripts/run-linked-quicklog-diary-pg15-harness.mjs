#!/usr/bin/env node
/** Execute the linked-companion client fence against a disposable PG15 DB only. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DATABASE = "verdant_linked_quicklog_diary";
const SENTINEL = "verdant_linked_quicklog_diary_pg15_disposable_v1";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = resolve(
  ROOT,
  "supabase/migrations/20260927094000_linked_quicklog_diary_client_write_fence.sql",
);
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const LINKED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEGACY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORDINARY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NULL_DETAILS = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OWNER_GROW = "44444444-4444-4444-8444-444444444444";
const OWNER_TENT = "55555555-5555-4555-8555-555555555555";
const OWNER_PLANT = "66666666-6666-4666-8666-666666666666";
const PHOTO_KEY = "linked-diary-canonical-photo-0001";
const PHOTO_PATH = "owner/plant/QA-é-01.jpg";

function canonicalManualDefinitions() {
  const foundation = "20260725024026_quicklog_dual_timestamp_foundation.sql";
  const repair = "20260818010000_quicklog_manual_delegate_forward_repair.sql";
  const definitions = [
    [foundation, "CREATE FUNCTION public.quicklog_try_parse_logged_at(p_value text)\n"],
    [foundation, "CREATE FUNCTION public.quicklog_try_parse_uuid(p_value text)\n"],
    [repair, 'CREATE OR REPLACE FUNCTION public."quicklog_save_manual_pre_logged_at"(\n'],
    [foundation, "CREATE FUNCTION public.quicklog_save_manual(\n"],
  ].map(([file, prefix]) => {
    // Normalize only the in-memory checkout representation; never rewrite migration bytes.
    const source = readFileSync(resolve(ROOT, "supabase/migrations", file), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    const start = source.indexOf(prefix);
    const end = source.indexOf("\n$function$;", start);
    if (start < 0 || end < start || source.indexOf(prefix, start + prefix.length) >= 0) {
      throw new Error("canonical_manual_definition_missing_or_ambiguous");
    }
    return source.slice(start, end + "\n$function$;".length);
  });
  return definitions.join("\n");
}

export function disposableConnection(value) {
  try {
    const url = new URL(value);
    if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) return null;
    if (!new Set(["127.0.0.1", "localhost", "::1", "[::1"]).has(url.hostname)) return null;
    if (
      url.username !== "postgres" ||
      url.port !== "5432" ||
      url.pathname !== `/${DATABASE}` ||
      !url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    const password = decodeURIComponent(url.password);
    if (!password || /[\u0000\r\n]/.test(password)) return null;
    return { host: url.hostname.replace(/^\[(.*)\]$/, "$1"), password };
  } catch {
    return null;
  }
}

function runSql(sql, connection) {
  const result = connection.spawnImpl("psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
    encoding: "utf8",
    input: sql,
    maxBuffer: 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? "",
      PGHOST: connection.host,
      PGPORT: "5432",
      PGUSER: "postgres",
      PGPASSWORD: connection.password,
      PGDATABASE: DATABASE,
      PGCONNECT_TIMEOUT: "5",
      PGAPPNAME: "verdant-linked-quicklog-diary-pg15-harness",
    },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`psql_failed:${result.status ?? "unknown"}`);
  }
  return String(result.stdout ?? "").trim();
}

function expectCount(label, sql, expected, connection) {
  const actual = runSql(`-- ${label}\n${sql}`, connection);
  if (actual !== String(expected)) throw new Error(`${label}:expected_${expected}_got_${actual}`);
}

function expectFailure(label, sql, connection, pattern = /row-level security policy/i) {
  const result = connection.spawnImpl("psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
    encoding: "utf8",
    input: `-- ${label}\n${sql}`,
    maxBuffer: 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? "",
      PGHOST: connection.host,
      PGPORT: "5432",
      PGUSER: "postgres",
      PGPASSWORD: connection.password,
      PGDATABASE: DATABASE,
      PGCONNECT_TIMEOUT: "5",
      PGAPPNAME: "verdant-linked-quicklog-diary-pg15-harness",
    },
  });
  if (result.error || result.status === 0 || !pattern.test(result.stderr)) {
    throw new Error(`${label}:expected_database_rejection`);
  }
}

const SCAFFOLD = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END;
$roles$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.diary_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  details jsonb, note text, photo_url text, grow_id uuid, tent_id uuid, plant_id uuid,
  entry_at timestamptz NOT NULL DEFAULT now(), logged_at timestamptz, stage text
);
CREATE TABLE public.grows (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.tents (id uuid PRIMARY KEY, user_id uuid NOT NULL, grow_id uuid);
CREATE TABLE public.plants (id uuid PRIMARY KEY, user_id uuid NOT NULL, grow_id uuid, tent_id uuid);
CREATE TABLE public.grow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  grow_id uuid, tent_id uuid, plant_id uuid, event_type text, source text,
  occurred_at timestamptz, note text, logged_at timestamptz
);
CREATE TABLE public.watering_events (event_id uuid PRIMARY KEY, user_id uuid, volume_ml numeric);
CREATE TABLE public.environment_events (
  event_id uuid PRIMARY KEY, user_id uuid, temperature_c numeric, humidity_pct numeric, vpd_kpa numeric
);
CREATE TABLE public.quicklog_idempotency (
  user_id uuid NOT NULL, idempotency_key text NOT NULL, grow_event_id uuid NOT NULL,
  PRIMARY KEY (user_id, idempotency_key)
);
CREATE TABLE public.quicklog_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid, idempotency_key text, grow_event_id uuid, status text, reason text
);
GRANT SELECT ON public.grow_events, public.quicklog_idempotency TO authenticated;
INSERT INTO public.grows VALUES ('${OWNER_GROW}', '${OWNER}');
INSERT INTO public.tents VALUES ('${OWNER_TENT}', '${OWNER}', '${OWNER_GROW}');
INSERT INTO public.plants VALUES ('${OWNER_PLANT}', '${OWNER}', '${OWNER_GROW}', '${OWNER_TENT}');
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diary_entries TO authenticated;
CREATE POLICY "Users view own entries" ON public.diary_entries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own entries" ON public.diary_entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own entries" ON public.diary_entries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own entries" ON public.diary_entries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE FUNCTION public.harness_revise_linked(p_id uuid) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE n integer;
BEGIN
  UPDATE public.diary_entries SET note = 'revised' WHERE id = p_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION public.harness_revise_linked(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.harness_revise_linked(uuid) TO authenticated;
INSERT INTO public.diary_entries (id, user_id, details, note) VALUES
  ('${LINKED}', '${OWNER}', '{"linked_grow_event_id":"event-1","photo_url":"owner/photo.jpg"}', 'linked'),
  ('${LEGACY}', '${OWNER}', '{"grow_event_id":"event-2"}', 'legacy'),
  ('${ORDINARY}', '${OWNER}', '{}', 'ordinary'),
  ('${NULL_DETAILS}', '${OWNER}', NULL, 'null details');
`;

function asOwner(statement) {
  return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${OWNER}';\n${statement}\nCOMMIT;`;
}

function asOther(statement) {
  return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${OTHER}';\n${statement}\nCOMMIT;`;
}

export async function runLinkedDiaryHarness({
  databaseUrl = process.env.LINKED_QUICKLOG_DIARY_PG15_URL ?? "",
  spawnImpl = spawnSync,
} = {}) {
  const target = disposableConnection(databaseUrl);
  if (!target) throw new Error("disposable_target_required");
  const connection = { ...target, spawnImpl };
  if (
    runSql(
      "SELECT sentinel FROM verdant_linked_quicklog_diary_harness.runtime_sentinel",
      connection,
    ) !== SENTINEL
  ) {
    throw new Error("disposable_sentinel_required");
  }

  runSql(SCAFFOLD, connection);
  runSql(readFileSync(MIGRATION, "utf8"), connection);
  runSql(canonicalManualDefinitions(), connection);
  runSql(
    `REVOKE ALL ON FUNCTION public.quicklog_save_manual(text,uuid,text,numeric,text,numeric,numeric,numeric,timestamptz,jsonb,text,text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.quicklog_save_manual_pre_logged_at(text,uuid,text,numeric,text,numeric,numeric,numeric,timestamptz,jsonb,text,text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(text,uuid,text,numeric,text,numeric,numeric,numeric,timestamptz,jsonb,text,text) TO authenticated;`,
    connection,
  );

  expectFailure(
    "linked_update",
    asOwner(`UPDATE public.diary_entries SET note='changed' WHERE id='${LINKED}';`),
    connection,
    /linked_quicklog_diary_requires_revision/i,
  );
  expectFailure(
    "linked_wrong_photo",
    asOwner(`UPDATE public.diary_entries SET photo_url='owner/other.jpg' WHERE id='${LINKED}';`),
    connection,
    /linked_quicklog_diary_requires_revision/i,
  );
  expectFailure(
    "linked_photo_plus_note",
    asOwner(
      `UPDATE public.diary_entries SET photo_url='owner/photo.jpg', note='changed' WHERE id='${LINKED}';`,
    ),
    connection,
    /linked_quicklog_diary_requires_revision/i,
  );
  expectCount(
    "linked_photo_normalization",
    asOwner(
      `WITH changed AS (UPDATE public.diary_entries SET photo_url='owner/photo.jpg' WHERE id='${LINKED}' RETURNING id) SELECT count(*) FROM changed;`,
    ),
    1,
    connection,
  );
  expectFailure(
    "linked_photo_replacement",
    asOwner(`UPDATE public.diary_entries SET photo_url='owner/photo.jpg' WHERE id='${LINKED}';`),
    connection,
    /linked_quicklog_diary_requires_revision/i,
  );
  expectCount(
    "linked_delete",
    asOwner(
      `WITH deleted AS (DELETE FROM public.diary_entries WHERE id='${LINKED}' RETURNING id) SELECT count(*) FROM deleted;`,
    ),
    0,
    connection,
  );
  expectCount(
    "legacy_delete",
    asOwner(
      `WITH deleted AS (DELETE FROM public.diary_entries WHERE id='${LEGACY}' RETURNING id) SELECT count(*) FROM deleted;`,
    ),
    0,
    connection,
  );
  expectCount(
    "ordinary_update",
    asOwner(
      `WITH changed AS (UPDATE public.diary_entries SET note='edited' WHERE id='${ORDINARY}' RETURNING id) SELECT count(*) FROM changed;`,
    ),
    1,
    connection,
  );
  expectCount(
    "null_details_update",
    asOwner(
      `WITH changed AS (UPDATE public.diary_entries SET note='edited' WHERE id='${NULL_DETAILS}' RETURNING id) SELECT count(*) FROM changed;`,
    ),
    1,
    connection,
  );
  expectCount(
    "null_details_delete",
    asOwner(
      `WITH deleted AS (DELETE FROM public.diary_entries WHERE id='${NULL_DETAILS}' RETURNING id) SELECT count(*) FROM deleted;`,
    ),
    1,
    connection,
  );
  expectCount(
    "other_owner",
    asOther(
      `WITH changed AS (UPDATE public.diary_entries SET note='foreign' WHERE id='${ORDINARY}' RETURNING id) SELECT count(*) FROM changed;`,
    ),
    0,
    connection,
  );
  expectFailure(
    "client_insert_link",
    asOwner(
      `INSERT INTO public.diary_entries (id,user_id,details,note) VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${OWNER}','{"linked_grow_event_id":"event-3"}','forged');`,
    ),
    connection,
  );
  expectFailure(
    "client_add_link",
    asOwner(
      `UPDATE public.diary_entries SET details='{"grow_event_id":"event-3"}' WHERE id='${ORDINARY}';`,
    ),
    connection,
    /linked_quicklog_diary_requires_revision/i,
  );
  expectFailure(
    "client_remove_link",
    asOwner(`UPDATE public.diary_entries SET details='{}' WHERE id='${LINKED}';`),
    connection,
    /linked_quicklog_diary_requires_revision/i,
  );
  expectCount(
    "server_revision_still_writes",
    asOwner(`SELECT public.harness_revise_linked('${LINKED}');`),
    1,
    connection,
  );
  expectCount(
    "persisted_integrity",
    `SELECT count(*) FROM public.diary_entries WHERE id IN ('${LINKED}','${LEGACY}') AND details ?| ARRAY['linked_grow_event_id','grow_event_id'];`,
    2,
    connection,
  );
  // Use the repository's real wrapper and repaired delegate, not the stand-in
  // revision function above, to prove the photo reaches the linked companion.
  const saved = JSON.parse(
    runSql(
      `-- canonical_manual_photo_save\n${asOwner(`SELECT public.quicklog_save_manual(
    'plant', '${OWNER_PLANT}'::uuid, 'note', NULL, 'canonical photo note',
    NULL, NULL, NULL, '2026-01-01T10:00:00Z'::timestamptz,
    '{"logged_at":"2026-01-01T09:59:00Z","photo_url":"${PHOTO_PATH}"}'::jsonb,
    '${PHOTO_KEY}', 'veg'
  );`)}`,
      connection,
    ),
  );
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    saved?.ok !== true ||
    saved.reused !== false ||
    !uuid.test(String(saved.grow_event_id ?? "")) ||
    !uuid.test(String(saved.diary_entry_id ?? ""))
  ) {
    throw new Error("canonical_manual_photo_save:unexpected_receipt");
  }
  const persistedPhoto = `SELECT count(*) FROM public.diary_entries de
    JOIN public.quicklog_idempotency qi ON qi.grow_event_id::text=de.details->>'linked_grow_event_id'
    JOIN public.grow_events ge ON ge.id=qi.grow_event_id
    WHERE qi.user_id='${OWNER}' AND qi.idempotency_key='${PHOTO_KEY}'
      AND ge.id='${saved.grow_event_id}' AND de.id='${saved.diary_entry_id}'
      AND de.user_id='${OWNER}' AND de.grow_id='${OWNER_GROW}'
      AND de.tent_id='${OWNER_TENT}' AND de.plant_id='${OWNER_PLANT}'
      AND ge.user_id=de.user_id AND ge.grow_id=de.grow_id
      AND ge.tent_id=de.tent_id AND ge.plant_id=de.plant_id
      AND de.note='canonical photo note' AND ge.note=de.note
      AND convert_to(de.details->>'photo_url', 'UTF8')=convert_to('${PHOTO_PATH}', 'UTF8')`;
  expectCount(
    "canonical_photo_details_readback",
    asOwner(`${persistedPhoto} AND de.photo_url IS NULL;`),
    1,
    connection,
  );
  expectCount(
    "canonical_photo_column_readback",
    asOwner(`UPDATE public.diary_entries SET photo_url='${PHOTO_PATH}'
    WHERE user_id='${OWNER}' AND details->>'linked_grow_event_id'=(SELECT grow_event_id::text FROM public.quicklog_idempotency WHERE user_id='${OWNER}' AND idempotency_key='${PHOTO_KEY}');
    ${persistedPhoto} AND convert_to(de.photo_url, 'UTF8')=convert_to('${PHOTO_PATH}', 'UTF8');`),
    1,
    connection,
  );
  expectFailure(
    "canonical_photo_replacement",
    asOwner(`UPDATE public.diary_entries SET photo_url='owner/other.jpg'
    WHERE user_id='${OWNER}' AND details->>'linked_grow_event_id'=(SELECT grow_event_id::text FROM public.quicklog_idempotency WHERE user_id='${OWNER}' AND idempotency_key='${PHOTO_KEY}');`),
    connection,
    /linked_quicklog_diary_requires_revision/i,
  );
  process.stdout.write(
    "Linked Quick Log diary PG15 fence PASS: 20 assertions (including canonical manual photo readback)\n",
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runLinkedDiaryHarness().catch((error) => {
    process.stderr.write(`Linked Quick Log diary PG15 fence BLOCKED/FAIL: ${error.message}\n`);
    process.exitCode = 1;
  });
}
