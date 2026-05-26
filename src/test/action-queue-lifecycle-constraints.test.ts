/**
 * Action Queue lifecycle CHECK constraint migration — idempotency + correctness.
 *
 * Verifies the migration that broadens the narrow approved_at/rejected_at
 * constraints into lifecycle-aware ones:
 *  1. Drops the old narrow constraint names.
 *  2. Drops the new lifecycle constraint names before re-adding (idempotent).
 *  3. The approved_at constraint allows status IN ('approved','completed','cancelled').
 *  4. The rejected_at constraint allows status IN ('rejected','cancelled').
 *
 * Tests-only. No production code, no UI, no automation, no device control.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const MIG_DIR = resolve(__dirname, "../../supabase/migrations");

function findLifecycleMigration(): string {
  for (const name of readdirSync(MIG_DIR).sort()) {
    if (!name.endsWith(".sql")) continue;
    const sql = readFileSync(join(MIG_DIR, name), "utf8");
    if (/action_queue_approved_at_lifecycle_chk/i.test(sql)) return sql;
  }
  throw new Error("lifecycle migration not found");
}

const SQL = findLifecycleMigration();

// Normalize whitespace for tolerant matching.
const FLAT = SQL.replace(/\s+/g, " ");

describe("action_queue lifecycle constraint migration", () => {
  it("drops the old narrow approved_at constraint name", () => {
    expect(FLAT).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_approved_at_chk\b/i);
  });

  it("drops the old narrow rejected_at constraint name", () => {
    expect(FLAT).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_rejected_at_chk\b/i);
  });

  it("drops the new approved_at lifecycle constraint name before re-adding (idempotent)", () => {
    const dropIdx = FLAT.search(
      /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_approved_at_lifecycle_chk\b/i,
    );
    const addIdx = FLAT.search(/ADD\s+CONSTRAINT\s+action_queue_approved_at_lifecycle_chk\b/i);
    expect(dropIdx).toBeGreaterThanOrEqual(0);
    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(dropIdx).toBeLessThan(addIdx);
  });

  it("drops the new rejected_at lifecycle constraint name before re-adding (idempotent)", () => {
    const dropIdx = FLAT.search(
      /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+action_queue_rejected_at_lifecycle_chk\b/i,
    );
    const addIdx = FLAT.search(/ADD\s+CONSTRAINT\s+action_queue_rejected_at_lifecycle_chk\b/i);
    expect(dropIdx).toBeGreaterThanOrEqual(0);
    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(dropIdx).toBeLessThan(addIdx);
  });

  it("approved_at constraint allows status IN ('approved','completed','cancelled')", () => {
    expect(FLAT).toMatch(
      /ADD\s+CONSTRAINT\s+action_queue_approved_at_lifecycle_chk\s+CHECK\s*\(\s*approved_at\s+IS\s+NULL\s+OR\s+status\s+IN\s*\(\s*'approved'\s*,\s*'completed'\s*,\s*'cancelled'\s*\)\s*\)/i,
    );
  });

  it("rejected_at constraint allows status IN ('rejected','cancelled')", () => {
    expect(FLAT).toMatch(
      /ADD\s+CONSTRAINT\s+action_queue_rejected_at_lifecycle_chk\s+CHECK\s*\(\s*rejected_at\s+IS\s+NULL\s+OR\s+status\s+IN\s*\(\s*'rejected'\s*,\s*'cancelled'\s*\)\s*\)/i,
    );
  });

  it("does not introduce service_role or device-control surface", () => {
    expect(SQL).not.toMatch(/service_role/i);
    expect(SQL).not.toMatch(/mqtt|home[\s_-]?assistant|webhook|actuator|relay/i);
  });
});
