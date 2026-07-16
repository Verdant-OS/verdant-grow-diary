/**
 * Static safety scan — has_pheno_tracker_entitlement anti-oracle guard.
 *
 * Ensures the latest migration for `public.has_pheno_tracker_entitlement(uuid)`:
 *   1. Rejects cross-user probing from `authenticated` callers (returns false
 *      when _user_id <> auth.uid()).
 *   2. Still allows `service_role` to evaluate any user (needed by RLS internals
 *      and admin/migration paths).
 *   3. Still REVOKEs execute from anon and PUBLIC, GRANTs to authenticated +
 *      service_role.
 *   4. Does not leak provider/customer/subscription IDs (RETURNS boolean only).
 *
 * Grep-only — no DB roundtrip, no service_role in tests.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function latestMigrationBodyMentioning(fn: string): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  // Select the newest migration that DEFINES the function, not merely one that
  // mentions its name in a comment/string. A later, unrelated migration (e.g.
  // ai_credit_spend_union_hardening) references has_pheno_tracker_entitlement
  // in a comment and would otherwise be picked, hiding the real guarded body.
  const defines = new RegExp(`FUNCTION\\s+public\\.${fn}\\b`, "i");
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const body = readFileSync(join(MIGRATIONS_DIR, files[i]), "utf8");
    if (defines.test(body)) return body;
  }
  throw new Error(`No migration defines FUNCTION public.${fn}`);
}

/**
 * Extract the SQL bounded by the `CREATE OR REPLACE FUNCTION public.<fn>`
 * statement (including its trailing GRANT/REVOKE re-assertions) up to the
 * next `CREATE OR REPLACE FUNCTION` or end-of-file. This lets the ID-leakage
 * check ignore unrelated statements in the same migration (e.g. a one-time
 * backfill INSERT that legitimately references provider_customer_id).
 */
function extractFunctionAndGrantsBlock(sql: string, fn: string): string {
  const defRe = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fn}\\b`, "i");
  const startMatch = defRe.exec(sql);
  if (!startMatch) throw new Error(`No CREATE OR REPLACE FUNCTION for ${fn}`);
  const startIdx = startMatch.index;
  const nextDefRe = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.[a-z_]+/gi;
  nextDefRe.lastIndex = startIdx + startMatch[0].length;
  const nextMatch = nextDefRe.exec(sql);
  const endIdx = nextMatch ? nextMatch.index : sql.length;
  return sql.slice(startIdx, endIdx);
}

describe("has_pheno_tracker_entitlement anti-oracle guard", () => {
  const fullSql = latestMigrationBodyMentioning("has_pheno_tracker_entitlement");
  const sql = extractFunctionAndGrantsBlock(fullSql, "has_pheno_tracker_entitlement");

  it("enforces auth.uid() = _user_id for non-service_role callers", () => {
    expect(sql).toMatch(/current_setting\(\s*'role'\s*,\s*true\s*\)/);
    expect(sql).toMatch(/service_role/);
    expect(sql).toMatch(/_user_id\s*<>\s*v_uid/);
    expect(sql).toMatch(/RETURN\s+false\s*;/i);
  });

  it("keeps signature/return type boolean (no ID leakage)", () => {
    expect(sql).toMatch(
      /FUNCTION\s+public\.has_pheno_tracker_entitlement\(\s*_user_id\s+uuid\s*\)\s*\n?\s*RETURNS\s+boolean/i,
    );
    // No provider identifiers surfaced in the function body.
    expect(sql).not.toMatch(/provider_customer_id/);
    expect(sql).not.toMatch(/provider_subscription_id/);
    expect(sql).not.toMatch(/paddle_customer_id/);
    expect(sql).not.toMatch(/paddle_subscription_id/);
  });

  it("revokes anon/PUBLIC and grants only authenticated + service_role", () => {
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.has_pheno_tracker_entitlement\(uuid\)\s+FROM\s+PUBLIC/i,
    );
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.has_pheno_tracker_entitlement\(uuid\)\s+FROM\s+anon/i,
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.has_pheno_tracker_entitlement\(uuid\)\s+TO\s+authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.has_pheno_tracker_entitlement\(uuid\)\s+TO\s+service_role/i,
    );
  });

  it("remains SECURITY DEFINER + STABLE with pinned search_path", () => {
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(/STABLE/i);
    expect(sql).toMatch(/SET\s+search_path\s+TO\s+'public',\s*'pg_temp'/i);
  });
});
