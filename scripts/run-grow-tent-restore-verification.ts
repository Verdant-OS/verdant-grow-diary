#!/usr/bin/env -S bun run
/**
 * Read-only grow/tent restore verification pack.
 *
 * Runs SELECT-only count + orphan checks against the project Postgres
 * via `psql` and the standard PG* env vars, then prints a JSON-safe
 * verification report. Designed to run BEFORE and AFTER a Supabase
 * backup/PITR restore of the grow/tent data-loss incident so the
 * operator can compare snapshots.
 *
 * NEVER inserts, updates, deletes, upserts, truncates, alters, drops,
 * or fabricates rows. NEVER prints secrets. NEVER uses service-role.
 *
 * Usage:
 *   VERDANT_ENV=production bun run scripts/run-grow-tent-restore-verification.ts
 *
 * Required env (provided in the Lovable sandbox):
 *   PGHOST, PGUSER, PGDATABASE, PGPASSWORD, PGPORT
 *
 * See: docs/grow-tent-restore-verification.md
 *      docs/database-integrity-incident-runbook.md
 */
import { execFileSync } from "node:child_process";
import {
  GROW_ID_REFERENCING_TABLES,
  TENT_ID_REFERENCING_TABLES,
  VERIFICATION_COUNT_TABLES,
  buildCountSql,
  buildOrphanGrowSql,
  buildOrphanTentSql,
  buildVerificationReport,
  type GrowIdReferencingTable,
  type TentIdReferencingTable,
  type VerificationCountTable,
} from "../src/lib/growTentRestoreVerification";

function runPsql(sql: string): string {
  return execFileSync("psql", ["-At", "-F", "\t", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function parseSingleCount(raw: string): number {
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    const n = Number(parts[parts.length - 1]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

const counts: Partial<Record<VerificationCountTable, number>> = {};
const orphanGrow: Partial<Record<GrowIdReferencingTable, number>> = {};
const orphanTent: Partial<Record<TentIdReferencingTable, number>> = {};
const errors: string[] = [];

for (const t of VERIFICATION_COUNT_TABLES) {
  try {
    counts[t] = parseSingleCount(runPsql(buildCountSql(t)));
  } catch (err) {
    errors.push(`count:${t}:${(err as Error).message}`);
  }
}

for (const t of GROW_ID_REFERENCING_TABLES) {
  try {
    orphanGrow[t] = parseSingleCount(runPsql(buildOrphanGrowSql(t)));
  } catch (err) {
    errors.push(`orphan_grow:${t}:${(err as Error).message}`);
  }
}

for (const t of TENT_ID_REFERENCING_TABLES) {
  try {
    orphanTent[t] = parseSingleCount(runPsql(buildOrphanTentSql(t)));
  } catch (err) {
    errors.push(`orphan_tent:${t}:${(err as Error).message}`);
  }
}

const report = buildVerificationReport({
  environment: process.env.VERDANT_ENV ?? "unknown",
  counts,
  orphanGrowReferences: orphanGrow,
  orphanTentReferences: orphanTent,
  errors,
});

// Never print secrets, raw UUIDs, or user_ids — report is counts only.
console.log(JSON.stringify(report, null, 2));
