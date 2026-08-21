/**
 * Static contract tests for
 * 20260819190000_action_queue_guard_decision_fields_forward_repair.sql.
 *
 * This migration exists for one reason: production skipped
 * 20260725093000_restore_action_queue_owner_decisions.sql, so the guard
 * `public.action_queue_guard_decision_fields` is still the 20260721225930
 * revision, and no committed migration has ever revoked service_role EXECUTE
 * on it. 20260819190852_action_queue_transition_forward_repair.sql therefore
 * aborts at `action_queue_transition_forward_repair_guard_drift` before it can
 * close the live UPDATE/DELETE gap on action_queue.
 *
 * The load-bearing property is the embedded function body: it must be
 * BYTE-IDENTICAL to the body committed in 20260725093000, because the consumer
 * migration pins that body by octet_length AND md5. One stray character and the
 * repair still aborts. These tests hash the real bytes rather than pattern-match
 * them, so a well-meaning reformat cannot pass silently.
 *
 * Source-text scanning is the correct tool here: the subject is a .sql artifact
 * that cannot be imported and resolved, and the assertions prove the presence or
 * absence of exact bytes in that file. This is the use AGENTS.md explicitly
 * keeps — not the banned "regex a config file to infer effective settings".
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GUARD_V1 = "supabase/migrations/20260721225930_b34caa3e-17e4-47c1-9847-19d1c184d83c.sql";
const GUARD_V2 = "supabase/migrations/20260725093000_restore_action_queue_owner_decisions.sql";
const REPAIR =
  "supabase/migrations/20260819190000_action_queue_guard_decision_fields_forward_repair.sql";
const CONSUMER = "supabase/migrations/20260819190852_action_queue_transition_forward_repair.sql";

/** Exactly what the consumer migration pins for the repaired guard. */
const EXPECTED_BODY_MD5 = "88e81c4dfbc6d17260def35d1a619ee1";
const EXPECTED_BODY_BYTES = 1101;

/** What production was measured running on 2026-08-20 (the unrepaired guard). */
const LEGACY_BODY_MD5 = "09459a9cc8532aae905639b3055c680f";
const LEGACY_BODY_BYTES = 1028;

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/**
 * Extract `prosrc` exactly as PostgreSQL stores it: every byte between the
 * CREATE statement's opening `AS $$` and its closing `$$;`.
 */
function extractGuardBody(sql: string): string {
  const decl = sql.indexOf("CREATE OR REPLACE FUNCTION public.action_queue_guard_decision_fields");
  expect(decl).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf("AS $$", decl);
  expect(open).toBeGreaterThanOrEqual(0);
  const start = open + "AS $$".length;
  const close = sql.indexOf("\n$$;", start);
  expect(close).toBeGreaterThan(start);
  return sql.slice(start, close + 1);
}

function md5(text: string): string {
  return createHash("md5").update(Buffer.from(text, "utf8")).digest("hex");
}

describe("action_queue guard forward repair (20260819190000)", () => {
  const sql = read(REPAIR);

  it("embeds a guard body byte-identical to the one committed in 20260725093000", () => {
    const mine = extractGuardBody(sql);
    const canonical = extractGuardBody(read(GUARD_V2));
    expect(mine).toBe(canonical);
  });

  it("embeds the exact body length and md5 the transition repair pins", () => {
    const body = extractGuardBody(sql);
    expect(Buffer.byteLength(body, "utf8")).toBe(EXPECTED_BODY_BYTES);
    expect(md5(body)).toBe(EXPECTED_BODY_MD5);
  });

  it("revokes EXECUTE from service_role — the gap no other migration closes", () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.action_queue_guard_decision_fields\(\)\s*\n?\s*FROM service_role;/,
    );
    // Neither migration that creates the guard ever revokes service_role, which
    // is why the Supabase default function grant survives into production.
    for (const rel of [GUARD_V1, GUARD_V2]) {
      expect(read(rel)).not.toMatch(/FROM\s+service_role/);
    }
  });

  it("sets the search_path and trigger columns the transition repair requires", () => {
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(
      /BEFORE UPDATE OF status, approved_at, rejected_at, completed_at\s*\nON public\.action_queue/,
    );
  });

  it("is one transaction with a preflight gate and a postflight assertion", () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
    expect(sql).toMatch(/\$action_queue_guard_forward_repair_preflight\$/);
    expect(sql).toMatch(/\$action_queue_guard_forward_repair_postflight\$/);
    expect(sql).toMatch(/action_queue_guard_forward_repair_state_drift/);
    expect(sql).toMatch(/action_queue_guard_forward_repair_postcondition_failed/);
    expect(sql).toMatch(/pg_advisory_xact_lock\(20260819, 190000\)/);
  });

  it("accepts only the two guard bodies this repository has ever committed", () => {
    // Legacy (production today) and repaired — nothing else may be overwritten.
    expect(sql).toContain(LEGACY_BODY_MD5);
    expect(sql).toContain(String(LEGACY_BODY_BYTES));
    expect(sql).toContain(EXPECTED_BODY_MD5);
    expect(sql).toContain(String(EXPECTED_BODY_BYTES));
    // The legacy body md5 must match what 20260721225930 actually contains, or
    // the accepted-input fence is describing a revision that does not exist.
    const legacy = extractGuardBody(read(GUARD_V1));
    expect(md5(legacy)).toBe(LEGACY_BODY_MD5);
    expect(Buffer.byteLength(legacy, "utf8")).toBe(LEGACY_BODY_BYTES);
  });

  it("refuses to leave anon or authenticated holding EXECUTE", () => {
    expect(sql).toMatch(/FROM anon;/);
    expect(sql).toMatch(/FROM authenticated;/);
    expect(sql).toMatch(/has_function_privilege\('anon', v_guard_oid, 'EXECUTE'\)/);
    expect(sql).toMatch(/has_function_privilege\('authenticated', v_guard_oid, 'EXECUTE'\)/);
    expect(sql).toMatch(/has_function_privilege\('service_role', v_guard_oid, 'EXECUTE'\)/);
  });

  it("introduces no table, policy, column, or device-control surface", () => {
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/ADD COLUMN/i);
    expect(sql).not.toMatch(/GRANT .* ON TABLE/i);
    expect(sql).not.toMatch(/target_device/i);
  });
});

describe("replay ordering — the prerequisite must precede its consumer", () => {
  it("sorts before 20260819190852, which aborts while service_role holds EXECUTE", () => {
    // Measured on PostgreSQL 16: replaying 20260721225930 -> 20260725093000 ->
    // 20260804091142 under Supabase-style default function grants leaves the
    // guard at {postgres, service_role}, and 20260819190852's guard-drift gate
    // aborts on exactly that. Numbered after it, this repair is unreachable on
    // a clean in-order replay — fresh provisioning, CI reset, and disaster
    // recovery would all stop there. Filename order IS the fix.
    const repairVersion = REPAIR.split("/").pop()!.slice(0, 14);
    const consumerVersion = CONSUMER.split("/").pop()!.slice(0, 14);
    expect(repairVersion < consumerVersion).toBe(true);
  });

  it("still sorts after the migration whose guard body it reinstates", () => {
    const repairVersion = REPAIR.split("/").pop()!.slice(0, 14);
    const sourceVersion = GUARD_V2.split("/").pop()!.slice(0, 14);
    expect(sourceVersion < repairVersion).toBe(true);
  });
});

describe("the consumer migration's guard expectations are unchanged", () => {
  const consumer = read(CONSUMER);

  it("still pins the exact body length and md5 this repair produces", () => {
    // If 20260819190852 ever changed these, the repair above would be aiming at
    // the wrong end-state and would hand the operator a still-aborting apply.
    expect(consumer).toContain(EXPECTED_BODY_MD5);
    expect(consumer).toMatch(/\) = 1101/);
    expect(consumer).toMatch(/ARRAY\['search_path=public, pg_temp'\]::text\[\]/);
    expect(consumer).toMatch(
      /ARRAY\['approved_at', 'completed_at', 'rejected_at', 'status'\]::name\[\]/,
    );
    expect(consumer).toMatch(/ARRAY\['postgres\|EXECUTE\|f\|postgres'\]::text\[\]/);
  });
});
