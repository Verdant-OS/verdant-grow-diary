#!/usr/bin/env node
/** Prove the pinned delivery catalog against disposable PostgreSQL 15 only. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLedgerInsertSql,
  classifyPreflight,
  parsePreflightStdout,
  PREFLIGHT_SQL,
} from "./apply-linked-quicklog-diary-client-write-fence.mjs";
import { MIGRATION_LEDGER_CREATE_TABLE_SQL } from "./lib/supabaseMigrationLedgerShape.mjs";

const DATABASE = "verdant_linked_diary_delivery";
const SENTINEL = "verdant_linked_diary_delivery_pg15_disposable_v1";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = resolve(
  ROOT,
  "supabase/migrations/20260927094000_linked_quicklog_diary_client_write_fence.sql",
);

export function disposableConnection(value) {
  try {
    const url = new URL(value);
    if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) return null;
    if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(url.hostname)) return null;
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

function runSql(sql, connection, { singleTransaction = false } = {}) {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
  if (singleTransaction) args.push("--single-transaction", "-c", sql);
  const result = spawnSync("psql", args, {
    encoding: "utf8",
    input: singleTransaction ? undefined : sql,
    maxBuffer: 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? "",
      PGHOST: connection.host,
      PGPORT: "5432",
      PGUSER: "postgres",
      PGPASSWORD: connection.password,
      PGDATABASE: DATABASE,
      PGCONNECT_TIMEOUT: "5",
      PGAPPNAME: "verdant-linked-diary-delivery-pg15-harness",
    },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`psql_failed:${result.status ?? "unknown"}`);
  }
  return String(result.stdout ?? "").trim();
}

const BASE = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION BYPASSRLS;
  END IF;
END;
$roles$;
CREATE SCHEMA supabase_migrations AUTHORIZATION postgres;
${MIGRATION_LEDGER_CREATE_TABLE_SQL}
CREATE TABLE public.diary_entries (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, details jsonb, note text, photo_url text
);
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diary_entries TO authenticated;
CREATE POLICY "Users insert own entries" ON public.diary_entries
  FOR INSERT TO authenticated WITH CHECK (user_id IS NOT NULL);
CREATE POLICY "Users update own entries" ON public.diary_entries
  FOR UPDATE TO authenticated USING (user_id IS NOT NULL);
CREATE POLICY "Users delete own entries" ON public.diary_entries
  FOR DELETE TO authenticated USING (user_id IS NOT NULL);
`;

function expectState(connection, expected) {
  const raw = runSql(PREFLIGHT_SQL, connection, { singleTransaction: true });
  const state = parsePreflightStdout(`${raw}\n`);
  const classification = classifyPreflight(state);
  if (classification.status !== expected) {
    throw new Error(
      `expected_${expected}_got_${classification.status}:${classification.reason ?? ""}`,
    );
  }
}

export function runHarness() {
  const connection = disposableConnection(process.env.LINKED_DIARY_DELIVERY_PG15_URL ?? "");
  if (!connection) throw new Error("disposable_target_required");
  if (
    runSql(
      "SELECT sentinel FROM verdant_linked_diary_delivery_harness.runtime_sentinel",
      connection,
    ) !== SENTINEL
  ) {
    throw new Error("disposable_sentinel_required");
  }

  runSql(BASE, connection);
  expectState(connection, "apply");
  runSql(readFileSync(MIGRATION, "utf8"), connection);
  expectState(connection, "schema_live_ledger_absent");
  runSql(buildLedgerInsertSql(), connection);
  expectState(connection, "verify_only");

  runSql(
    `ALTER POLICY "Linked Quick Log diary requires server insert"
      ON public.diary_entries WITH CHECK (false);`,
    connection,
  );
  expectState(connection, "schema_drift");
  console.log("Linked diary delivery PG15 catalog PASS: absent, canonical, ledger and drift.");
}

const isDirect =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirect) {
  try {
    runHarness();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "harness_failed");
    process.exitCode = 1;
  }
}
