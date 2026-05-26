/**
 * Migration idempotency tests for action_queue lifecycle constraints.
 *
 * Asserts that the migration:
 *   1. Drops the old narrow constraint names.
 *   2. Drops the new lifecycle constraint names before re-adding them (idempotency).
 *   3. The approved_at constraint SQL includes status IN ('approved', 'completed', 'cancelled').
 *   4. The rejected_at constraint SQL includes status IN ('rejected', 'cancelled').
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

/**
 * Find the lifecycle constraint migration (the one that adds
 * action_queue_approved_at_lifecycle_chk).
 */
function findLifecycleMigration(): string {
  const files = readdirSync(MIGRATIONS_DIR).sort();
  for (const name of files) {
    if (!name.endsWith(".sql")) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    if (/action_queue_approved_at_lifecycle_chk/i.test(sql)) return sql;
  }
  throw new Error("Lifecycle constraint migration not found");
}

const MIGRATION_SQL = findLifecycleMigration();

describe("action_queue lifecycle constraint migration — idempotency", () => {
  it("drops the old narrow constraint names (action_queue_approved_at_chk, action_queue_rejected_at_chk)", () => {
    expect(MIGRATION_SQL).toMatch(
      /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_approved_at_chk/i,
    );
    expect(MIGRATION_SQL).toMatch(
      /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_rejected_at_chk/i,
    );
  });

  it("drops the new lifecycle constraint names before re-adding them (idempotency)", () => {
    expect(MIGRATION_SQL).toMatch(
      /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_approved_at_lifecycle_chk/i,
    );
    expect(MIGRATION_SQL).toMatch(
      /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_rejected_at_lifecycle_chk/i,
    );

    // The DROP must appear BEFORE the ADD for each constraint (ordering check).
    const dropApprovedIdx = MIGRATION_SQL.search(
      /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_approved_at_lifecycle_chk/i,
    );
    const addApprovedIdx = MIGRATION_SQL.search(
      /ADD\s+CONSTRAINT\s+action_queue_approved_at_lifecycle_chk/i,
    );
    expect(dropApprovedIdx).toBeLessThan(addApprovedIdx);

    const dropRejectedIdx = MIGRATION_SQL.search(
      /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_rejected_at_lifecycle_chk/i,
    );
    const addRejectedIdx = MIGRATION_SQL.search(
      /ADD\s+CONSTRAINT\s+action_queue_rejected_at_lifecycle_chk/i,
    );
    expect(dropRejectedIdx).toBeLessThan(addRejectedIdx);
  });

  it("approved_at constraint SQL includes status IN ('approved', 'completed', 'cancelled')", () => {
    // Extract the CHECK clause for the approved_at lifecycle constraint.
    const approvedCheck = MIGRATION_SQL.match(
      /action_queue_approved_at_lifecycle_chk\s+CHECK\s*\(([^)]+)\)/i,
    );
    expect(approvedCheck).not.toBeNull();
    const clause = approvedCheck![1];
    expect(clause).toMatch(/status\s+IN\s*\(/i);
    expect(clause).toMatch(/'approved'/i);
    expect(clause).toMatch(/'completed'/i);
    expect(clause).toMatch(/'cancelled'/i);
  });

  it("rejected_at constraint SQL includes status IN ('rejected', 'cancelled')", () => {
    // Extract the CHECK clause for the rejected_at lifecycle constraint.
    const rejectedCheck = MIGRATION_SQL.match(
      /action_queue_rejected_at_lifecycle_chk\s+CHECK\s*\(([^)]+)\)/i,
    );
    expect(rejectedCheck).not.toBeNull();
    const clause = rejectedCheck![1];
    expect(clause).toMatch(/status\s+IN\s*\(/i);
    expect(clause).toMatch(/'rejected'/i);
    expect(clause).toMatch(/'cancelled'/i);
  });
});
