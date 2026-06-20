/**
 * Static safety check for the alerts_acknowledged_at_status_check
 * relaxation migration. Verifies the migration:
 *   - drops the old constraint,
 *   - re-adds it with the relaxed shape,
 *   - does not touch unrelated alert columns/policies.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260619000545_0ca6c1fa-3f16-4e59-a118-5f467ebbdde6.sql",
  ),
  "utf8",
);

describe("alerts ack check relaxation migration", () => {
  it("drops the prior constraint", () => {
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS alerts_acknowledged_at_status_check/i,
    );
  });

  it("re-adds the constraint allowing resolved/dismissed to keep acknowledged_at", () => {
    expect(sql).toMatch(/ADD CONSTRAINT alerts_acknowledged_at_status_check/i);
    expect(sql).toMatch(/status\s*=\s*'open'[\s\S]*acknowledged_at IS NULL/i);
    expect(sql).toMatch(
      /status\s*=\s*'acknowledged'[\s\S]*acknowledged_at IS NOT NULL/i,
    );
    expect(sql).toMatch(/status IN \('resolved',\s*'dismissed'\)/i);
  });

  it("does not drop the alerts table, RLS, or other constraints", () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).not.toMatch(/DROP\s+POLICY/i);
    expect(sql).not.toMatch(/alerts_resolved_at_status_check/i);
    expect(sql).not.toMatch(/alerts_status_check\b/i);
    expect(sql).not.toMatch(/alerts_severity_check/i);
  });

  it("never introduces service_role, AI, action_queue, or device control", () => {
    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/action_queue/i);
    expect(sql.toLowerCase()).not.toMatch(/device[_-]?control/);
    expect(sql.toLowerCase()).not.toMatch(/ai[_-]?doctor/);
  });
});
