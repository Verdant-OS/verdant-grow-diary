#!/usr/bin/env -S bun run
/**
 * Read-only orphan tent-id reference audit.
 *
 * Runs the pure SQL produced by `buildOrphanTentAuditSql` against the
 * project Postgres (via `psql` + standard PG* env vars) and prints a
 * redacted operator-safe report. Never writes, deletes, or repairs.
 *
 * Usage:
 *   bun run scripts/run-orphan-tent-audit.ts
 *
 * Required env (already provided in the Lovable sandbox):
 *   PGHOST, PGUSER, PGDATABASE, PGPASSWORD, PGPORT
 */
import { execFileSync } from "node:child_process";
import {
  ORPHAN_TENT_TABLES,
  buildOrphanTentAuditSql,
  renderOrphanReport,
  summarizeOrphanRows,
  type OrphanTentRow,
  type OrphanTentTable,
} from "../src/lib/orphanTentReferenceAudit";

function runPsql(sql: string): string {
  return execFileSync("psql", ["-At", "-F", "\t", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function parseRows(table: OrphanTentTable, raw: string): OrphanTentRow[] {
  const out: OrphanTentRow[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [tableName, missing, count] = line.split("\t");
    if (tableName !== table) continue;
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) continue;
    out.push({ table_name: table, missing_tent_id: missing ?? "", orphan_count: n });
  }
  return out;
}

const allRows: OrphanTentRow[] = [];
for (const table of ORPHAN_TENT_TABLES) {
  try {
    const out = runPsql(buildOrphanTentAuditSql(table));
    allRows.push(...parseRows(table, out));
  } catch (err) {
    // Surface the table that failed but keep going so one missing table
    // doesn't hide other orphans. Diagnostic only.
    console.error(`[orphan-audit] ${table} query failed:`, (err as Error).message);
  }
}

const report = renderOrphanReport(summarizeOrphanRows(allRows));
console.log(report);
