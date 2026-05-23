/**
 * Unit + static guardrail tests for piIngestCommitPlan.
 *
 * Covers:
 *  - empty plan
 *  - all-duplicate plan
 *  - partial-duplicate plan (order preservation, summary counts)
 *  - sensor row / idempotency row alignment by index
 *  - idempotency_key never leaks into the sensor row payload
 *  - failure pipeline result throws
 *  - existingKeys accepts both Set and Iterable
 *  - static safety (no Supabase, no service_role, no other table writes)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPiIngestCommitPlan } from "@/lib/piIngestCommitPlan";
import type { PiIngestPipelineResult } from "@/lib/piIngestPipeline";
import type { NormalizedSensorReadingDraft } from "@/lib/sensorIngestNormalizationRules";

// ----------------------- fixtures -----------------------

const OWNER = "owner-user-1";
const BRIDGE = "bridge-a";
const TENT = "11111111-1111-1111-1111-111111111111";

function makeDraft(i: number, opts?: Partial<NormalizedSensorReadingDraft>): NormalizedSensorReadingDraft {
  return {
    user_id: OWNER,
    tent_id: TENT,
    device_id: `dev-${i}`,
    metric: "temperature_c",
    value: 20 + i,
    captured_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    source: "pi_bridge",
    quality: "ok",
    ...opts,
  } as NormalizedSensorReadingDraft;
}

function makeSuccess(
  drafts: readonly NormalizedSensorReadingDraft[],
  keys: readonly string[],
): PiIngestPipelineResult {
  return {
    ok: true,
    ownerUserId: OWNER,
    bridgeId: BRIDGE,
    tentId: TENT,
    readingDrafts: drafts,
    idempotencyKeys: keys,
  };
}

// ----------------------- buildPiIngestCommitPlan -----------------------

describe("buildPiIngestCommitPlan", () => {
  it("returns an empty plan for a successful pipeline with zero drafts", () => {
    const plan = buildPiIngestCommitPlan({
      pipelineResult: makeSuccess([], []),
      existingKeys: new Set<string>(),
    });
    expect(plan.ownerUserId).toBe(OWNER);
    expect(plan.bridgeId).toBe(BRIDGE);
    expect(plan.tentId).toBe(TENT);
    expect(plan.toInsertSensorRows).toEqual([]);
    expect(plan.toInsertIdempotencyRows).toEqual([]);
    expect(plan.duplicates).toEqual([]);
    expect(plan.summary).toEqual({ total: 0, toInsert: 0, duplicates: 0 });
  });

  it("treats every reading as new when existingKeys is empty", () => {
    const drafts = [makeDraft(1), makeDraft(2), makeDraft(3)];
    const keys = ["k1", "k2", "k3"];
    const plan = buildPiIngestCommitPlan({
      pipelineResult: makeSuccess(drafts, keys),
      existingKeys: new Set(),
    });
    expect(plan.toInsertSensorRows).toEqual(drafts);
    expect(plan.duplicates).toEqual([]);
    expect(plan.summary).toEqual({ total: 3, toInsert: 3, duplicates: 0 });
    expect(plan.toInsertIdempotencyRows.map((r) => r.idempotency_key)).toEqual(
      keys,
    );
  });

  it("marks every reading as duplicate when all keys already exist", () => {
    const drafts = [makeDraft(1), makeDraft(2)];
    const keys = ["k1", "k2"];
    const plan = buildPiIngestCommitPlan({
      pipelineResult: makeSuccess(drafts, keys),
      existingKeys: new Set(keys),
    });
    expect(plan.toInsertSensorRows).toEqual([]);
    expect(plan.toInsertIdempotencyRows).toEqual([]);
    expect(plan.duplicates.map((d) => d.idempotencyKey)).toEqual(keys);
    expect(plan.summary).toEqual({ total: 2, toInsert: 0, duplicates: 2 });
  });

  it("partial-duplicate: preserves input order in both partitions and counts correctly", () => {
    const drafts = [makeDraft(1), makeDraft(2), makeDraft(3), makeDraft(4)];
    const keys = ["k1", "k2", "k3", "k4"];
    const plan = buildPiIngestCommitPlan({
      pipelineResult: makeSuccess(drafts, keys),
      existingKeys: new Set(["k2", "k4"]),
    });
    expect(plan.toInsertSensorRows).toEqual([drafts[0], drafts[2]]);
    expect(plan.toInsertIdempotencyRows.map((r) => r.idempotency_key)).toEqual([
      "k1",
      "k3",
    ]);
    expect(plan.duplicates.map((d) => d.idempotencyKey)).toEqual(["k2", "k4"]);
    expect(plan.summary).toEqual({ total: 4, toInsert: 2, duplicates: 2 });
  });

  it("aligns sensor row and idempotency row at the same index", () => {
    const drafts = [
      makeDraft(1, { metric: "humidity_pct", value: 55 }),
      makeDraft(2, { metric: "vpd_kpa", value: 1.1 }),
    ];
    const keys = ["alpha", "beta"];
    const plan = buildPiIngestCommitPlan({
      pipelineResult: makeSuccess(drafts, keys),
      existingKeys: new Set(),
    });
    for (let i = 0; i < plan.toInsertSensorRows.length; i++) {
      const sensor = plan.toInsertSensorRows[i] as Record<string, unknown>;
      const idem = plan.toInsertIdempotencyRows[i];
      expect(idem.idempotency_key).toBe(keys[i]);
      expect(idem.device_id).toBe(sensor.device_id);
      expect(idem.metric).toBe(sensor.metric);
      expect(idem.captured_at).toBe(sensor.captured_at);
      expect(idem.user_id).toBe(OWNER);
      expect(idem.bridge_id).toBe(BRIDGE);
      expect(idem.tent_id).toBe(TENT);
    }
  });

  it("does not splice idempotency_key into any sensor row payload", () => {
    const drafts = [makeDraft(1), makeDraft(2)];
    const keys = ["k1", "k2"];
    const plan = buildPiIngestCommitPlan({
      pipelineResult: makeSuccess(drafts, keys),
      existingKeys: new Set(["k2"]),
    });
    for (const row of plan.toInsertSensorRows) {
      expect("idempotency_key" in (row as Record<string, unknown>)).toBe(false);
    }
    for (const dup of plan.duplicates) {
      expect("idempotency_key" in (dup.row as Record<string, unknown>)).toBe(false);
    }
  });

  it("throws when the upstream draft already carries an idempotency_key field", () => {
    const tainted = makeDraft(1) as NormalizedSensorReadingDraft & {
      idempotency_key?: string;
    };
    (tainted as Record<string, unknown>).idempotency_key = "leak";
    expect(() =>
      buildPiIngestCommitPlan({
        pipelineResult: makeSuccess([tainted], ["k1"]),
        existingKeys: new Set(),
      }),
    ).toThrow(/must not contain an idempotency_key/);
  });

  it("accepts an Array (Iterable) for existingKeys, not just a Set", () => {
    const drafts = [makeDraft(1), makeDraft(2)];
    const keys = ["k1", "k2"];
    const plan = buildPiIngestCommitPlan({
      pipelineResult: makeSuccess(drafts, keys),
      existingKeys: ["k1"],
    });
    expect(plan.summary).toEqual({ total: 2, toInsert: 1, duplicates: 1 });
    expect(plan.toInsertIdempotencyRows[0].idempotency_key).toBe("k2");
    expect(plan.duplicates[0].idempotencyKey).toBe("k1");
  });

  it("throws when the pipeline result is a failure", () => {
    const failure: PiIngestPipelineResult = {
      ok: false,
      stage: "auth",
      issues: [
        { stage: "auth", code: "missing_header", message: "no bridge id" },
      ],
    };
    expect(() =>
      buildPiIngestCommitPlan({
        pipelineResult: failure,
        existingKeys: new Set(),
      }),
    ).toThrow(/successful PiIngestPipelineResult/);
  });

  it("throws when sensor row is missing device_id / metric / captured_at", () => {
    const baseDrafts = [makeDraft(1)];
    const taintMissing = (field: keyof NormalizedSensorReadingDraft) => {
      const d = { ...baseDrafts[0] } as Record<string, unknown>;
      delete d[field as string];
      return buildPiIngestCommitPlan({
        pipelineResult: makeSuccess(
          [d as NormalizedSensorReadingDraft],
          ["k1"],
        ),
        existingKeys: new Set(),
      });
    };
    expect(() => taintMissing("device_id")).toThrow(/device_id/);
    expect(() => taintMissing("metric")).toThrow(/metric/);
    expect(() => taintMissing("captured_at")).toThrow(/captured_at/);
  });

  it("propagates ownerUserId / bridgeId / tentId from the pipeline success", () => {
    const plan = buildPiIngestCommitPlan({
      pipelineResult: makeSuccess([makeDraft(1)], ["k1"]),
      existingKeys: new Set(),
    });
    expect(plan.ownerUserId).toBe(OWNER);
    expect(plan.bridgeId).toBe(BRIDGE);
    expect(plan.tentId).toBe(TENT);
    expect(plan.toInsertIdempotencyRows[0].user_id).toBe(OWNER);
    expect(plan.toInsertIdempotencyRows[0].bridge_id).toBe(BRIDGE);
    expect(plan.toInsertIdempotencyRows[0].tent_id).toBe(TENT);
  });
});

// ----------------------- static safety guards -----------------------

describe("piIngestCommitPlan static safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../lib/piIngestCommitPlan.ts"),
    "utf8",
  );

  it("does not import Supabase, React, or any I/O surface", () => {
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\//);
    expect(src).not.toMatch(/from\s+["']@supabase\//);
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/fetch\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it("does not reference forbidden elevated keys or raw SQL", () => {
    expect(src).not.toMatch(/SERVICE_ROLE/);
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.insert\(/);
  });

  it("does not reference tables outside the pi-ingest write scope", () => {
    const forbidden = [
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
      "grow_events",
      "watering_events",
      "feeding_events",
      "environment_events",
      "plants",
      "tents",
      "grows",
      "profiles",
    ];
    for (const t of forbidden) {
      expect(src.includes(`"${t}"`)).toBe(false);
    }
  });
});
