#!/usr/bin/env -S bun run
/**
 * audit-csv-source-allow-list — read-only probe of the deployed
 * `validate_sensor_reading` trigger to confirm which `source` and `metric`
 * values the production database actually accepts for CSV-shaped inserts.
 *
 * Safety contract:
 *  - Runs every probe inside `BEGIN; ... ROLLBACK;` so no row is ever
 *    persisted, even on success.
 *  - Skips cleanly (exit 0) when PG* env vars are missing — for CI without
 *    a database connection.
 *  - Never prints secrets, PG passwords, JWTs, or service-role keys.
 *  - Never disables RLS, never grants privileges, never drops triggers.
 *  - Marks every probed payload with `csv_source_allow_list_probe: true`
 *    in `raw_payload` so any accidental commit would be trivially auditable.
 *  - Read-only with respect to durable state. The connecting role is
 *    whatever PG* env exposes; this script intentionally does NOT need
 *    service_role and never sets `role`.
 *
 * Usage:
 *   bun run scripts/audit-csv-source-allow-list.ts
 */
import { execFileSync } from "node:child_process";

const PROBE_SOURCES = [
  "csv", // adapter target — Spider Farmer / Vivosun / new path
  "csv_import_ac_infinity", // legacy AC Infinity writer tag
] as const;

const PROBE_METRICS = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "ppfd",
] as const;

interface ProbeResult {
  source: string;
  metric: string;
  accepted: boolean;
  rejection?: string;
}

function hasPgEnv(): boolean {
  return Boolean(process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE);
}

function runPsql(sql: string): { ok: boolean; stderr: string; stdout: string } {
  try {
    const stdout = execFileSync(
      "psql",
      ["-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { ok: true, stdout, stderr: "" };
  } catch (e) {
    const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
    return {
      ok: false,
      stdout: err.stdout?.toString("utf8") ?? "",
      stderr: err.stderr?.toString("utf8") ?? err.message ?? "",
    };
  }
}

/** Compact a psql error message to a single short line. */
function compactError(raw: string): string {
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("ERROR:")) ?? raw.split("\n")[0] ?? "";
  return line.slice(0, 240);
}

function probe(source: string, metric: string): ProbeResult {
  // Random ids — the BEGIN/ROLLBACK guarantees nothing persists, but the
  // trigger fires before the transaction ends so we still observe the
  // allow-list behavior. Use a clearly-test raw_payload.
  const sql = `
    BEGIN;
    SAVEPOINT probe;
    INSERT INTO public.sensor_readings
      (user_id, tent_id, metric, value, source, quality, captured_at, raw_payload)
    VALUES
      (gen_random_uuid(), gen_random_uuid(),
       '${metric}', 1, '${source}', 'ok', now(),
       jsonb_build_object(
         'csv_source_allow_list_probe', true,
         'source_app', 'probe',
         'cleanup_required', true
       ));
    ROLLBACK;
  `;
  const res = runPsql(sql);
  if (res.ok) {
    return { source, metric, accepted: true };
  }
  const err = compactError(res.stderr);
  return { source, metric, accepted: false, rejection: err };
}

function main(): void {
  if (!hasPgEnv()) {
    console.log("[audit-csv-source-allow-list] PG* env not present — skipping.");
    process.exit(0);
  }

  console.log("[audit-csv-source-allow-list] probing deployed trigger...");
  const results: ProbeResult[] = [];
  for (const source of PROBE_SOURCES) {
    for (const metric of PROBE_METRICS) {
      results.push(probe(source, metric));
    }
  }

  const grouped = new Map<string, ProbeResult[]>();
  for (const r of results) {
    const arr = grouped.get(r.source) ?? [];
    arr.push(r);
    grouped.set(r.source, arr);
  }

  let anyRejection = false;
  for (const [source, rows] of grouped) {
    const accepted = rows.filter((r) => r.accepted).map((r) => r.metric);
    const rejected = rows.filter((r) => !r.accepted);
    console.log(`\nsource = "${source}"`);
    console.log(`  accepted metrics: ${accepted.join(", ") || "(none)"}`);
    if (rejected.length) {
      anyRejection = true;
      for (const r of rejected) {
        console.log(`  rejected ${r.metric}: ${r.rejection ?? "unknown"}`);
      }
    }
  }

  // Verdict (informational; exit code stays 0 — this is an audit, not a gate).
  const csvAllRowsAccepted = (grouped.get("csv") ?? []).every((r) => r.accepted);
  const legacyAcceptedAny = (grouped.get("csv_import_ac_infinity") ?? []).some(
    (r) => r.accepted,
  );
  console.log("\nverdict:");
  console.log(`  csv source → ${csvAllRowsAccepted ? "ACCEPTED" : "REJECTED"}`);
  console.log(
    `  csv_import_ac_infinity → ${legacyAcceptedAny ? "ACCEPTED" : "REJECTED"}`,
  );
  if (!csvAllRowsAccepted) {
    console.log(
      "  ⚠ Registry adapter source not fully accepted by deployed trigger.",
    );
  }
  if (!legacyAcceptedAny) {
    console.log(
      "  ⚠ Legacy AC Infinity writer source is rejected by deployed trigger;",
    );
    console.log(
      "    the in-repo writer cannot persist successfully against production.",
    );
  }
  if (anyRejection) {
    // Non-fatal so the harness can be run informationally in CI.
  }
}

main();
