#!/usr/bin/env -S bun run
/**
 * Causation harness for the 2026-08-15 pgmq / trigger-definer EXECUTE
 * hardening migrations.
 *
 * Proves the three files do what their headers claim, against a disposable
 * local Postgres, by re-opening the PUBLIC EXECUTE hole and re-applying
 * each file in order:
 *
 *   1. 20260815054529 closes PUBLIC+anon on the four pgmq wrappers and
 *      keeps the service role.
 *   2. 20260815054605 does NOT close PUBLIC on the two trigger definers
 *      (recorded no-op — named-role revoke while PUBLIC remains).
 *   3. 20260815054645 closes PUBLIC on those trigger definers and aligns
 *      quicklog_save_manual with quicklog_save_event.
 *
 * Privilege probes use has_function_privilege / aclexplode(grantee=0),
 * never by invoking the RPCs (that would run real queue / trigger logic).
 *
 *   bun run scripts/run-pgmq-email-wrapper-grants-db-security.ts --confirm-local-security-lane
 *
 * Required env: SUPABASE_DB_URL on a loopback host. psql on PATH.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import {
  PGMQ_EMAIL_WRAPPER_FUNCTIONS,
  PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS,
  TRIGGER_DEFINER_FUNCTIONS,
} from "../src/lib/pgmqEmailWrapperGrantRules";

const LOCAL_LANE_FLAG = "--confirm-local-security-lane";

if (!process.argv.includes(LOCAL_LANE_FLAG)) {
  console.log(
    `[pgmq-email-wrapper-grants] SKIP — pass ${LOCAL_LANE_FLAG} to run the disposable local ACL harness.`,
  );
  process.exit(0);
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function dbUrlOrSkip(): string | null {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return null;
  let host: string;
  try {
    host = new URL(dbUrl).hostname;
  } catch {
    return null;
  }
  return isLoopbackHost(host) ? dbUrl : null;
}

const dbUrl = dbUrlOrSkip();
if (!dbUrl) {
  console.error(
    "[pgmq-email-wrapper-grants] local security lane requires loopback SUPABASE_DB_URL",
  );
  process.exit(2);
}

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function safeError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error.message.slice(0, 300);
  if (typeof error === "object") {
    const record = error as { stderr?: unknown; message?: unknown };
    if (typeof record.stderr === "string") return record.stderr.slice(0, 300);
    if (typeof record.message === "string") return record.message.slice(0, 300);
  }
  return String(error).slice(0, 300);
}

function psql(sql: string): { ok: boolean; detail?: string } {
  try {
    execFileSync("psql", [dbUrl!, "-v", "ON_ERROR_STOP=1", "-c", sql], {
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
    });
    return { ok: true };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr;
    return { ok: false, detail: (stderr ?? safeError(error) ?? "psql failed").slice(0, 400) };
  }
}

function psqlFile(file: string): { ok: boolean; detail?: string } {
  try {
    execFileSync("psql", [dbUrl!, "-v", "ON_ERROR_STOP=1", "-f", file], {
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8",
    });
    return { ok: true };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr;
    return { ok: false, detail: (stderr ?? safeError(error) ?? "psql failed").slice(0, 400) };
  }
}

function psqlScalar(sql: string): string | null {
  try {
    return execFileSync("psql", [dbUrl!, "-tAc", sql], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function sqlTextArray(names: readonly string[]): string {
  return names.map((name) => `'${name.replaceAll("'", "''")}'`).join(", ");
}

function roleHasExecute(role: "anon" | "authenticated" | "service_role", names: readonly string[]): boolean | null {
  const out = psqlScalar(
    `SELECT EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN (${sqlTextArray(names)})
         AND has_function_privilege('${role}', p.oid, 'EXECUTE')
     );`,
  );
  if (out === null) return null;
  return out === "t";
}

function publicHasExecute(names: readonly string[]): boolean | null {
  const out = psqlScalar(
    `SELECT EXISTS (
       SELECT 1
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
        WHERE n.nspname = 'public'
          AND p.proname IN (${sqlTextArray(names)})
          AND a.grantee = 0
          AND a.privilege_type = 'EXECUTE'
     );`,
  );
  if (out === null) return null;
  return out === "t";
}

function grantPublicAndAnon(names: readonly string[]): { ok: boolean; detail?: string } {
  return psql(
    `DO $$
     DECLARE fn RECORD;
     BEGIN
       FOR fn IN
         SELECT p.oid::regprocedure AS sig FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN (${sqlTextArray(names)})
       LOOP
         EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', fn.sig);
         EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', fn.sig);
       END LOOP;
     END $$;`,
  );
}

function restoreIntendedGrants(): { ok: boolean; detail?: string } {
  return psql(
    `DO $$
     DECLARE fn RECORD;
     BEGIN
       FOR fn IN
         SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN (
             'enqueue_email', 'read_email_batch', 'delete_email', 'move_to_dlq',
             'grant_staff_role_for_verified_email', 'profiles_block_gamification_updates'
           )
       LOOP
         EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
         EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
       END LOOP;
       FOR fn IN
         SELECT p.oid::regprocedure AS sig FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'quicklog_save_manual'
       LOOP
         EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
         EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
         EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
       END LOOP;
     END $$;`,
  );
}

function functionsPresent(names: readonly string[]): boolean {
  const out = psqlScalar(
    `SELECT COUNT(DISTINCT p.proname)::text
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (${sqlTextArray(names)});`,
  );
  return out === String(names.length);
}

console.log("→ causation: 20260815 pgmq / trigger-definer EXECUTE hardening");

for (const rel of Object.values(PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS)) {
  check(`migration exists: ${rel}`, existsSync(rel));
}

const wrapperNames = [...PGMQ_EMAIL_WRAPPER_FUNCTIONS];
const triggerNames = [...TRIGGER_DEFINER_FUNCTIONS];

check("pgmq wrappers present", functionsPresent(wrapperNames));
check("trigger definers present", functionsPresent(triggerNames));
check("quicklog_save_manual present", functionsPresent(["quicklog_save_manual"]));

const openedWrappers = grantPublicAndAnon(wrapperNames);
check("could re-open PUBLIC+anon on pgmq wrappers", openedWrappers.ok, openedWrappers.detail);
const openedTriggers = grantPublicAndAnon(triggerNames);
check("could re-open PUBLIC+anon on trigger definers", openedTriggers.ok, openedTriggers.detail);
const openedManual = grantPublicAndAnon(["quicklog_save_manual"]);
check("could re-open PUBLIC+anon on quicklog_save_manual", openedManual.ok, openedManual.detail);

try {
  check(
    "negative control: anon EXECUTE visible on wrappers",
    roleHasExecute("anon", wrapperNames) === true,
  );
  check(
    "negative control: PUBLIC EXECUTE visible on wrappers",
    publicHasExecute(wrapperNames) === true,
  );
  check(
    "negative control: PUBLIC EXECUTE visible on trigger definers",
    publicHasExecute(triggerNames) === true,
  );

  const appliedWrappers = psqlFile(PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.wrappers);
  check("20260815054529 re-applies cleanly", appliedWrappers.ok, appliedWrappers.detail);
  check(
    "20260815054529 closes anon EXECUTE on wrappers",
    roleHasExecute("anon", wrapperNames) === false,
  );
  check(
    "20260815054529 revokes PUBLIC on wrappers, not just named roles",
    publicHasExecute(wrapperNames) === false,
  );
  check(
    "20260815054529 keeps service-role EXECUTE on wrappers",
    roleHasExecute("service_role", wrapperNames) === true,
  );
  check(
    "20260815054529 does not close trigger-definer PUBLIC (out of scope)",
    publicHasExecute(triggerNames) === true,
  );

  const appliedNoop = psqlFile(PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.triggerNoop);
  check("20260815054605 re-applies cleanly", appliedNoop.ok, appliedNoop.detail);
  check(
    "20260815054605 is a no-op against PUBLIC: trigger definers still inherit EXECUTE",
    publicHasExecute(triggerNames) === true,
    "named-role revoke closed PUBLIC — this file is supposed to stay the unsuccessful lesson",
  );

  const appliedPublic = psqlFile(PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS.publicRevoke);
  check("20260815054645 re-applies cleanly", appliedPublic.ok, appliedPublic.detail);
  check(
    "20260815054645 closes PUBLIC on trigger definers",
    publicHasExecute(triggerNames) === false,
  );
  check(
    "20260815054645 closes anon EXECUTE on trigger definers",
    roleHasExecute("anon", triggerNames) === false,
  );
  check(
    "20260815054645 keeps service-role EXECUTE on trigger definers",
    roleHasExecute("service_role", triggerNames) === true,
  );
  check(
    "20260815054645 closes anon EXECUTE on quicklog_save_manual",
    roleHasExecute("anon", ["quicklog_save_manual"]) === false,
  );
  check(
    "20260815054645 keeps authenticated EXECUTE on quicklog_save_manual",
    roleHasExecute("authenticated", ["quicklog_save_manual"]) === true,
  );
} finally {
  const restored = restoreIntendedGrants();
  check("restored intended grant posture", restored.ok, restored.detail);
}

console.log(`\n[pgmq-email-wrapper-grants] ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
