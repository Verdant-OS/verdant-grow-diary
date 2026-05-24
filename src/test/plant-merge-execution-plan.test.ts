/**
 * Static guardrail tests for docs/plant-merge-execution-plan.md.
 *
 * This task is audit + plan only. These tests ensure the plan document
 * exists and continues to enforce the safety contract:
 *   - server-side, one transaction
 *   - auth.uid() ownership checks
 *   - no service_role
 *   - no hard delete of plants
 *   - reassigns the correct set of tables
 *   - leaves tent-scoped data alone
 *   - documents idempotency / repeat-merge rejection
 *   - documents return summary shape
 *
 * No runtime DB calls. No RPC is implemented yet.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PLAN_PATH = resolve(__dirname, "../../docs/plant-merge-execution-plan.md");

function plan(): string {
  return readFileSync(PLAN_PATH, "utf8");
}

describe("plant merge execution plan doc", () => {
  it("exists", () => {
    expect(existsSync(PLAN_PATH)).toBe(true);
  });

  it("declares audit/plan-only scope", () => {
    const doc = plan();
    expect(doc).toMatch(/Audit \+ plan only/i);
    expect(doc).toMatch(/No RPC implemented/i);
  });

  it("names the proposed RPC", () => {
    expect(plan()).toMatch(/merge_duplicate_plant\s*\(/);
  });

  it("requires server-side, single-transaction, auth.uid() ownership", () => {
    const doc = plan();
    expect(doc).toMatch(/server-side/i);
    expect(doc).toMatch(/one transaction|single transaction|BEGIN \.\.\. COMMIT/i);
    expect(doc).toMatch(/auth\.uid\(\)/);
  });

  it("forbids service_role and hard delete", () => {
    const doc = plan();
    expect(doc).toMatch(/No `?service_role`?/i);
    expect(doc).toMatch(/never.*hard-?delete|must not delete/i);
  });

  it("lists every plant-linked table that must be reassigned", () => {
    const doc = plan();
    for (const table of [
      "grow_events",
      "diary_entries",
      "alerts",
      "action_queue",
    ]) {
      expect(doc).toContain(table);
    }
  });

  it("explicitly excludes tent-scoped / unrelated tables from the merge", () => {
    const doc = plan();
    for (const table of [
      "sensor_readings",
      "pi_ingest_idempotency_keys",
      "pi_ingest_bridge_credentials",
      "grow_targets",
      "harvests",
    ]) {
      expect(doc).toContain(table);
    }
    expect(doc).toMatch(/must not be touched|Untouched|tent.scoped/i);
  });

  it("documents source-plant terminal state without hard delete", () => {
    const doc = plan();
    expect(doc).toMatch(/is_archived\s*=\s*true/);
    expect(doc).not.toMatch(/delete from public\.plants/i);
  });

  it("documents idempotency / repeat-merge rejection", () => {
    const doc = plan();
    expect(doc).toMatch(/plant_already_merged/);
    expect(doc).toMatch(/idempoten/i);
  });

  it("documents return summary shape with moved counts", () => {
    const doc = plan();
    expect(doc).toMatch(/"moved"\s*:/);
    expect(doc).toMatch(/"grow_events"/);
    expect(doc).toMatch(/"diary_entries"/);
    expect(doc).toMatch(/source_status/);
  });

  it("blocks cross-grow merges at v1", () => {
    expect(plan()).toMatch(/cross-grow/i);
  });

  it("defers audit logging and documents an optional future migration only", () => {
    const doc = plan();
    expect(doc).toMatch(/audit logging is deferred/i);
    expect(doc).toMatch(/merged_into_plant_id/);
    expect(doc).toMatch(/no migration is applied in this task/i);
  });

  it("does not propose Edge Function / pi-ingest / Action Queue behavior changes", () => {
    const doc = plan();
    expect(doc).toMatch(/No sensor.*changes|Must not touch.*sensor_readings/i);
    expect(doc).toMatch(/pi-ingest/i);
    expect(doc).toMatch(/automation/i);
  });
});
