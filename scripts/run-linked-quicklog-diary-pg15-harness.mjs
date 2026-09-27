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
  const result = spawnSync("psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
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
  const actual = runSql(sql, connection);
  if (actual !== String(expected)) throw new Error(`${label}:expected_${expected}_got_${actual}`);
}

function expectFailure(label, sql, connection) {
  const result = spawnSync("psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
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
  if (result.error || result.status === 0 || !/row-level security policy/i.test(result.stderr)) {
    throw new Error(`${label}:expected_rls_rejection`);
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
  id uuid PRIMARY KEY, user_id uuid NOT NULL, details jsonb, note text
);
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
  ('${LINKED}', '${OWNER}', '{"linked_grow_event_id":"event-1"}', 'linked'),
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

async function main() {
  const connection = disposableConnection(process.env.LINKED_QUICKLOG_DIARY_PG15_URL ?? "");
  if (!connection) throw new Error("disposable_target_required");
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

  expectCount(
    "linked_update",
    asOwner(
      `WITH changed AS (UPDATE public.diary_entries SET note='changed' WHERE id='${LINKED}' RETURNING id) SELECT count(*) FROM changed;`,
    ),
    0,
    connection,
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
  process.stdout.write("Linked Quick Log diary PG15 fence PASS: 10 assertions\n");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`Linked Quick Log diary PG15 fence BLOCKED/FAIL: ${error.message}\n`);
    process.exitCode = 1;
  });
}
