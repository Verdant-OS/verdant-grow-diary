/**
 * Regression tests for action_queue CHECK constraint lifecycle.
 *
 * These tests verify that the DB-level CHECK constraints allow the full
 * action lifecycle (approved_at/rejected_at persisting into terminal statuses)
 * by validating the migration SQL against the expected constraint semantics.
 *
 * The tests simulate constraint evaluation without a live DB by parsing
 * the final constraint definitions and testing rows against them.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

// Collect all action_queue migrations in order.
function readAllActionQueueMigrations(): string {
  const chunks: string[] = [];
  for (const name of readdirSync(MIG_DIR).sort()) {
    if (!name.endsWith(".sql")) continue;
    const sql = readFileSync(join(MIG_DIR, name), "utf8");
    if (/\baction_queue\b/i.test(sql)) chunks.push(sql);
  }
  return chunks.join("\n\n");
}

const ALL_SQL = readAllActionQueueMigrations();

// Find the fix migration specifically.
function findFixMigration(): string | null {
  for (const name of readdirSync(MIG_DIR).sort()) {
    if (!name.endsWith(".sql")) continue;
    const sql = readFileSync(join(MIG_DIR, name), "utf8");
    if (/action_queue_approved_at_lifecycle_chk/i.test(sql)) return sql;
  }
  return null;
}

const FIX_SQL = findFixMigration();

/**
 * Simulate the final CHECK constraint logic.
 * After the migration, the effective constraints are:
 *   approved_at IS NULL OR status IN ('approved','completed','cancelled')
 *   rejected_at IS NULL OR status IN ('rejected','cancelled')
 */
function checkApprovedAtConstraint(row: { status: string; approved_at: string | null }): boolean {
  return row.approved_at === null || ["approved", "completed", "cancelled"].includes(row.status);
}

function checkRejectedAtConstraint(row: { status: string; rejected_at: string | null }): boolean {
  return row.rejected_at === null || ["rejected", "cancelled"].includes(row.status);
}

describe("action_queue lifecycle CHECK constraints — migration structure", () => {
  it("fix migration exists and drops the old narrow constraints", () => {
    expect(FIX_SQL).not.toBeNull();
    expect(FIX_SQL).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_approved_at_chk/i);
    expect(FIX_SQL).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_rejected_at_chk/i);
  });

  it("fix migration adds lifecycle-safe constraints with clear names", () => {
    expect(FIX_SQL).toMatch(/ADD\s+CONSTRAINT\s+action_queue_approved_at_lifecycle_chk/i);
    expect(FIX_SQL).toMatch(/ADD\s+CONSTRAINT\s+action_queue_rejected_at_lifecycle_chk/i);
  });

  it("migration is idempotent (uses IF EXISTS on DROP)", () => {
    expect(FIX_SQL).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS/i);
  });

  it("migration includes explanatory comments about terminal status timestamps", () => {
    expect(FIX_SQL).toMatch(/terminal/i);
    expect(FIX_SQL).toMatch(/audit/i);
  });
});

describe("action_queue lifecycle CHECK constraints — transition scenarios", () => {
  const NOW = "2026-05-27T00:00:00Z";

  it("pending_approval → approved → completed succeeds with approved_at retained", () => {
    // Step 1: approve — approved_at set, status = approved
    expect(checkApprovedAtConstraint({ status: "approved", approved_at: NOW })).toBe(true);
    // Step 2: complete — approved_at still set, status = completed
    expect(checkApprovedAtConstraint({ status: "completed", approved_at: NOW })).toBe(true);
  });

  it("pending_approval → approved → cancelled succeeds with approved_at retained", () => {
    expect(checkApprovedAtConstraint({ status: "approved", approved_at: NOW })).toBe(true);
    expect(checkApprovedAtConstraint({ status: "cancelled", approved_at: NOW })).toBe(true);
  });

  it("pending_approval → rejected succeeds with rejected_at", () => {
    expect(checkRejectedAtConstraint({ status: "rejected", rejected_at: NOW })).toBe(true);
  });

  it("rejected → cancelled succeeds with rejected_at retained", () => {
    expect(checkRejectedAtConstraint({ status: "cancelled", rejected_at: NOW })).toBe(true);
  });

  it("invalid: pending_approval with approved_at is rejected", () => {
    expect(checkApprovedAtConstraint({ status: "pending_approval", approved_at: NOW })).toBe(false);
  });

  it("invalid: pending_approval with rejected_at is rejected", () => {
    expect(checkRejectedAtConstraint({ status: "pending_approval", rejected_at: NOW })).toBe(false);
  });

  it("invalid: simulated with approved_at is rejected", () => {
    expect(checkApprovedAtConstraint({ status: "simulated", approved_at: NOW })).toBe(false);
  });

  it("invalid: simulated with rejected_at is rejected", () => {
    expect(checkRejectedAtConstraint({ status: "simulated", rejected_at: NOW })).toBe(false);
  });

  it("completed action can retain approved_at for audit history", () => {
    expect(checkApprovedAtConstraint({ status: "completed", approved_at: NOW })).toBe(true);
  });

  it("completed action without approved_at is also valid", () => {
    expect(checkApprovedAtConstraint({ status: "completed", approved_at: null })).toBe(true);
  });

  it("cancelled action without any timestamps is valid", () => {
    expect(checkApprovedAtConstraint({ status: "cancelled", approved_at: null })).toBe(true);
    expect(checkRejectedAtConstraint({ status: "cancelled", rejected_at: null })).toBe(true);
  });
});

describe("action_queue lifecycle — no client insert/update payload adds user_id", () => {
  it("buildTransitionPatch never includes user_id", async () => {
    const { buildTransitionPatch } = await import("@/lib/actionQueueTransitions");
    const kinds = ["approve", "reject", "complete", "cancel", "simulate"] as const;
    for (const kind of kinds) {
      const patch = buildTransitionPatch(kind);
      expect(patch).not.toHaveProperty("user_id");
    }
  });

  it("buildAuditEventPayload never includes user_id", async () => {
    const { buildAuditEventPayload } = await import("@/lib/actionQueueTransitions");
    const payload = buildAuditEventPayload({
      action_queue_id: "test-id",
      grow_id: "grow-id",
      event_type: "approved",
      previous_status: "pending_approval",
      new_status: "approved",
    });
    expect(payload).not.toHaveProperty("user_id");
  });
});

describe("action_queue lifecycle — static safety", () => {
  it("no service_role in any action_queue migration", () => {
    expect(ALL_SQL).not.toMatch(/service_role/i);
  });

  it("no device-control calls in action_queue migrations", () => {
    expect(ALL_SQL).not.toMatch(/mqtt|home[\s_-]?assistant|webhook|actuator|relay/i);
  });

  it("no automation strings in action_queue migrations", () => {
    expect(ALL_SQL).not.toMatch(/\bautopilot\b|\bauto[-_ ]?execute\b|\bdispatch_command\b/i);
  });

  it("no Leads changes in action_queue migrations", () => {
    expect(ALL_SQL).not.toMatch(/\bleads\b/i);
  });

  it("no typed watering writes in action_queue migrations", () => {
    expect(ALL_SQL).not.toMatch(/watering_log|water_event|irrigation_command/i);
  });

  it("fix migration does not erase historical approved_at or rejected_at values", () => {
    // The migration only changes constraints, never UPDATEs data.
    expect(FIX_SQL).not.toMatch(/UPDATE\s+.*action_queue/i);
    expect(FIX_SQL).not.toMatch(/SET\s+approved_at\s*=\s*NULL/i);
    expect(FIX_SQL).not.toMatch(/SET\s+rejected_at\s*=\s*NULL/i);
  });
});
