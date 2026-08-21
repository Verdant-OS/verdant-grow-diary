#!/usr/bin/env node
/**
 * Optional live (protected) companion to the secret-free CTA readiness gate.
 *
 * When SUPABASE_DB_URL is available in a GitHub-hosted protected environment,
 * confirm:
 *   - to_regclass('public.signup_acquisition_attributions') is present
 *   - the three helper functions are present
 *   - the name-bound ledger row for 20260813030000 exists
 *
 * Secret-free PR CI must NOT call this. Missing DB config exits non-zero
 * (fail closed) so a misconfigured protected job never soft-passes.
 *
 * Exit codes mirror money-migration applied guards:
 *   0 OK
 *   1 readiness checks failed
 *   3 no database connection configured
 *   4 psql not invocable
 *   5 query failed
 *   6 target identity rejected
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  FORWARD_REPAIR_LEDGER_NAMES,
  FORWARD_REPAIR_LEDGER_VERSION,
} from "./lib/signupAttributionCtaReadiness.mjs";
import {
  coreTargetEnvironmentForMoney,
  sanitizeMoneyDatabaseUrlForPsql,
} from "./lib/moneyDatabaseTargetIdentity.mjs";
import { buildLibpqConnectionEnvironment } from "./lib/supabaseDatabaseTargetIdentity.mjs";

export const EXIT = Object.freeze({
  OK: 0,
  READINESS_FAILED: 1,
  NO_DB_CONNECTION: 3,
  PSQL_NOT_INVOCABLE: 4,
  QUERY_FAILED: 5,
  TARGET_IDENTITY_REJECTED: 6,
});

const READINESS_SQL = `
set transaction read only;
set local lock_timeout = '8s';
set local statement_timeout = '30s';
select jsonb_build_object(
  'table_present', to_regclass('public.signup_acquisition_attributions') is not null,
  'record_fn_present', to_regprocedure('public.record_signup_acquisition_first_touch(text)') is not null,
  'acquisition_snapshot_present', to_regprocedure('public.signup_acquisition_operator_snapshot()') is not null,
  'signup_to_paid_present', to_regprocedure('public.signup_to_paid_operator_snapshot()') is not null,
  'ledger_present', exists (
    select 1
    from supabase_migrations.schema_migrations sm
    where sm.version = '${FORWARD_REPAIR_LEDGER_VERSION}'
      and sm.name in (${FORWARD_REPAIR_LEDGER_NAMES.map((n) => `'${n}'`).join(", ")})
  )
);
`.trim();

export function runAssertSignupAttributionCtaReadinessApplied({
  env = process.env,
  spawn = spawnSync,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const targetEnv = env.TARGET_ENV ?? "unspecified";
  const dbUrl = env.SUPABASE_DB_URL ?? env.DATABASE_URL ?? "";
  const reportPath = env.REPORT_PATH ?? "";

  let coreTargetEnv;
  try {
    coreTargetEnv = coreTargetEnvironmentForMoney(targetEnv);
  } catch {
    stderr("TARGET_ENV must be exactly sandbox, live, or unspecified.");
    return EXIT.TARGET_IDENTITY_REJECTED;
  }

  if (coreTargetEnv !== null && !dbUrl) {
    stderr("Protected TARGET_ENV requires SUPABASE_DB_URL.");
    return EXIT.TARGET_IDENTITY_REJECTED;
  }

  if (!dbUrl && !env.PGHOST) {
    stderr("No SUPABASE_DB_URL / DATABASE_URL / PGHOST — cannot verify live signup CTA readiness.");
    return EXIT.NO_DB_CONNECTION;
  }

  const psqlEnv = { ...env };
  if (dbUrl) {
    let sanitized;
    try {
      sanitized = sanitizeMoneyDatabaseUrlForPsql(dbUrl, targetEnv);
    } catch (error) {
      const reason =
        error && typeof error === "object" && typeof error.code === "string"
          ? error.code
          : "invalid_target_environment";
      stderr(`Target identity rejected (${reason}).`);
      return EXIT.TARGET_IDENTITY_REJECTED;
    }

    for (const key of Object.keys(psqlEnv)) {
      const normalizedKey = key.toUpperCase();
      if (
        normalizedKey.startsWith("PG") ||
        normalizedKey === "DATABASE_URL" ||
        normalizedKey.startsWith("SUPABASE_")
      ) {
        delete psqlEnv[key];
      }
    }
    Object.assign(psqlEnv, buildLibpqConnectionEnvironment(sanitized));
  }

  const result = spawn("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", READINESS_SQL], {
    env: psqlEnv,
    encoding: "utf8",
  });

  if (result.error && result.error.code === "ENOENT") {
    stderr("psql is not invocable on this runner.");
    return EXIT.PSQL_NOT_INVOCABLE;
  }

  if (result.status !== 0) {
    stderr("Live signup CTA readiness query failed (details redacted).");
    return EXIT.QUERY_FAILED;
  }

  let payload;
  try {
    payload = JSON.parse(String(result.stdout ?? "").trim());
  } catch {
    stderr("Live signup CTA readiness query returned non-JSON.");
    return EXIT.QUERY_FAILED;
  }

  const checks = {
    signup_acquisition_attributions_table: payload.table_present === true,
    record_signup_acquisition_first_touch: payload.record_fn_present === true,
    signup_acquisition_operator_snapshot: payload.acquisition_snapshot_present === true,
    signup_to_paid_operator_snapshot: payload.signup_to_paid_present === true,
    forward_repair_ledger_row: payload.ledger_present === true,
  };
  const failed = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([id]) => id);
  const ready = failed.length === 0;

  const report = [
    `# Signup attribution CTA live readiness (${targetEnv})`,
    "",
    `status: ${ready ? "ready" : "not_ready"}`,
    "",
    ...Object.entries(checks).map(([id, pass]) => `- ${pass ? "PASS" : "FAIL"} ${id}`),
    "",
  ].join("\n");

  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, report, "utf8");
  }

  stdout(report);

  if (!ready) {
    stderr(
      "Live signup CTA readiness FAILED — do not treat marketing attributed signup as enabled.",
    );
    return EXIT.READINESS_FAILED;
  }

  stdout("Live signup CTA readiness PASS.");
  return EXIT.OK;
}

const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirect) {
  process.exitCode = runAssertSignupAttributionCtaReadinessApplied();
}
