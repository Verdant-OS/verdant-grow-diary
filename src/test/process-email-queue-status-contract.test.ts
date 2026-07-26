import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");
const WORKER_PATH = resolve(ROOT, "supabase/functions/process-email-queue/index.ts");
const STATUS_CONSTRAINT = "email_send_log_status_check";

function latestStatusConstraintMigration(): { name: string; sql: string } {
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"),
    }))
    .filter(({ sql }) => sql.includes(STATUS_CONSTRAINT));

  const latest = migrations.at(-1);
  if (!latest) {
    throw new Error(`No migration defines ${STATUS_CONSTRAINT}`);
  }
  return latest;
}

function workerEmailSendLogStatuses(source: string): string[] {
  const insertBodies = [
    ...source.matchAll(
      /\.from\(\s*["']email_send_log["']\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/g,
    ),
  ].map((match) => match[1]);

  expect(insertBodies.length, "process-email-queue email_send_log inserts").toBeGreaterThan(0);

  return insertBodies.map((body) => {
    const status = body.match(/\bstatus\s*:\s*["']([^"']+)["']/)?.[1];
    if (!status) {
      throw new Error("Every email_send_log insert must use a literal status");
    }
    return status;
  });
}

function constraintStatuses(sql: string): string[] {
  const constraintStart = sql.lastIndexOf(STATUS_CONSTRAINT);
  const constraintSql = sql.slice(constraintStart);
  const inList = constraintSql.match(/CHECK\s*\(\s*status\s+IN\s*\(([\s\S]*?)\)\s*\)/i)?.[1];
  if (!inList) {
    throw new Error(`Could not parse ${STATUS_CONSTRAINT}`);
  }
  return [...inList.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("process-email-queue send-log status contract", () => {
  it("accepts every status the worker writes in the latest published constraint", () => {
    const worker = readFileSync(WORKER_PATH, "utf8");
    const migration = latestStatusConstraintMigration();
    const writtenStatuses = [...new Set(workerEmailSendLogStatuses(worker))].sort();
    const allowedStatuses = new Set(constraintStatuses(migration.sql));
    const rejectedStatuses = writtenStatuses.filter((status) => !allowedStatuses.has(status));

    expect(
      rejectedStatuses,
      `${migration.name} must accept every process-email-queue status: ${writtenStatuses.join(", ")}`,
    ).toEqual([]);
  });

  it("checks rate-limit audit insert failures and logs only safe diagnostics", () => {
    const worker = readFileSync(WORKER_PATH, "utf8");
    const branchStart = worker.indexOf("if (isRateLimited(error))");
    const branchEnd = worker.indexOf("const retryAfterSecs", branchStart);
    const rateLimitAuditBlock = worker.slice(branchStart, branchEnd);

    expect(branchStart).toBeGreaterThanOrEqual(0);
    expect(branchEnd).toBeGreaterThan(branchStart);
    expect(rateLimitAuditBlock).toMatch(
      /const\s*\{\s*error:\s*rateLimitLogError\s*\}\s*=\s*await\s+supabase\s*\.from\(\s*["']email_send_log["']\s*\)\s*\.insert\(/,
    );
    expect(rateLimitAuditBlock).toMatch(
      /if\s*\(rateLimitLogError\)\s*\{\s*console\.error\(\s*["']Failed to record email rate-limit audit["']\s*,\s*\{\s*queue\s*,\s*msg_id:\s*msg\.msg_id\s*,\s*error_code:\s*rateLimitLogError\.code\s*\?\?\s*["']unknown["']\s*,?\s*\}\s*\)\s*\}/,
    );
  });
});
