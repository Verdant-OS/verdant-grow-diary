/**
 * Tests for the pure pi-ingest insert-plan rules.
 * No Supabase, no Edge Function, no I/O, no writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPiIngestInsertPlan,
  partitionAgainstExistingKeys,
  summarizeInsertPlanPartition,
} from "@/lib/piIngestInsertPlanRules";
import type { PiIngestPipelineResult } from "@/lib/piIngestPipeline";
import type { NormalizedSensorReadingDraft } from "@/lib/sensorIngestNormalizationRules";

const OWNER = "owner-uuid-1";
const BRIDGE = "pi-bridge-1";
const TENT = "tent-uuid-1";
const DEVICE = "sensorpush-gateway-1";
const TS = "2026-05-23T11:59:30.000Z";

function draft(
  metric: NormalizedSensorReadingDraft["metric"],
  value: number,
): NormalizedSensorReadingDraft {
  return {
    tent_id: TENT,
    metric,
    value,
    source: "pi_bridge",
    ts: TS,
    quality: "ok",
    device_id: DEVICE,
    captured_at: TS,
    raw_payload: null,
  };
}

function success(
  drafts: NormalizedSensorReadingDraft[],
  keys: string[],
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

const KEY_A = `pi:${BRIDGE}:${TENT}:${DEVICE}:temperature_c:${TS}`;
const KEY_B = `pi:${BRIDGE}:${TENT}:${DEVICE}:humidity_pct:${TS}`;
const KEY_C = `pi:${BRIDGE}:${TENT}:${DEVICE}:vpd_kpa:${TS}`;

describe("buildPiIngestInsertPlan", () => {
  it("returns deterministic plan with rows aligned to keys in input order", () => {
    const drafts = [draft("temperature_c", 24.2), draft("humidity_pct", 58)];
    const plan = buildPiIngestInsertPlan(success(drafts, [KEY_A, KEY_B]));
    expect(plan.ownerUserId).toBe(OWNER);
    expect(plan.bridgeId).toBe(BRIDGE);
    expect(plan.tentId).toBe(TENT);
    expect(plan.items.length).toBe(2);
    expect(plan.items[0].idempotencyKey).toBe(KEY_A);
    expect(plan.items[0].row).toBe(drafts[0]);
    expect(plan.items[1].idempotencyKey).toBe(KEY_B);
    expect(plan.items[1].row).toBe(drafts[1]);
  });

  it("does NOT splice idempotency_key into the row payload", () => {
    const drafts = [draft("temperature_c", 24.2)];
    const plan = buildPiIngestInsertPlan(success(drafts, [KEY_A]));
    expect((plan.items[0].row as Record<string, unknown>).idempotency_key).toBeUndefined();
  });

  it("produces a stable plan across repeated calls (same input → same output shape)", () => {
    const drafts = [draft("temperature_c", 24.2), draft("humidity_pct", 58)];
    const a = buildPiIngestInsertPlan(success(drafts, [KEY_A, KEY_B]));
    const b = buildPiIngestInsertPlan(success(drafts, [KEY_A, KEY_B]));
    expect(a.items.map((i) => i.idempotencyKey)).toEqual(
      b.items.map((i) => i.idempotencyKey),
    );
  });

  it("returns an empty plan when there are zero drafts/keys", () => {
    const plan = buildPiIngestInsertPlan(success([], []));
    expect(plan.items).toEqual([]);
  });

  it("throws when given a failed pipeline result", () => {
    const failure: PiIngestPipelineResult = {
      ok: false,
      stage: "auth",
      issues: [{ stage: "auth", code: "x", message: "y" }],
    };
    expect(() => buildPiIngestInsertPlan(failure)).toThrow();
  });

  it("throws when drafts and keys lengths disagree", () => {
    const drafts = [draft("temperature_c", 24.2), draft("humidity_pct", 58)];
    expect(() => buildPiIngestInsertPlan(success(drafts, [KEY_A]))).toThrow(
      /length mismatch/,
    );
  });
});

describe("partitionAgainstExistingKeys", () => {
  const drafts = [
    draft("temperature_c", 24.2),
    draft("humidity_pct", 58),
    draft("vpd_kpa", 1.18),
  ];
  const plan = buildPiIngestInsertPlan(
    success(drafts, [KEY_A, KEY_B, KEY_C]),
  );

  it("returns all items as toInsert when no keys exist", () => {
    const p = partitionAgainstExistingKeys(plan, new Set<string>());
    expect(p.toInsert.length).toBe(3);
    expect(p.duplicates.length).toBe(0);
  });

  it("classifies existing keys as duplicates and preserves input order", () => {
    const p = partitionAgainstExistingKeys(plan, new Set([KEY_B]));
    expect(p.toInsert.map((i) => i.idempotencyKey)).toEqual([KEY_A, KEY_C]);
    expect(p.duplicates.map((i) => i.idempotencyKey)).toEqual([KEY_B]);
  });

  it("returns all items as duplicates when every key exists", () => {
    const p = partitionAgainstExistingKeys(
      plan,
      new Set([KEY_A, KEY_B, KEY_C]),
    );
    expect(p.toInsert.length).toBe(0);
    expect(p.duplicates.length).toBe(3);
  });

  it("accepts an array of existing keys", () => {
    const p = partitionAgainstExistingKeys(plan, [KEY_A, KEY_C]);
    expect(p.toInsert.map((i) => i.idempotencyKey)).toEqual([KEY_B]);
    expect(p.duplicates.map((i) => i.idempotencyKey)).toEqual([KEY_A, KEY_C]);
  });

  it("does not mutate the input plan", () => {
    const before = plan.items.map((i) => i.idempotencyKey);
    partitionAgainstExistingKeys(plan, new Set([KEY_A]));
    expect(plan.items.map((i) => i.idempotencyKey)).toEqual(before);
  });
});

describe("summarizeInsertPlanPartition", () => {
  it("counts totals correctly", () => {
    const drafts = [draft("temperature_c", 24.2), draft("humidity_pct", 58)];
    const plan = buildPiIngestInsertPlan(success(drafts, [KEY_A, KEY_B]));
    const part = partitionAgainstExistingKeys(plan, new Set([KEY_A]));
    expect(summarizeInsertPlanPartition(part)).toEqual({
      total: 2,
      toInsert: 1,
      duplicates: 1,
    });
  });

  it("handles an empty partition", () => {
    expect(
      summarizeInsertPlanPartition({ toInsert: [], duplicates: [] }),
    ).toEqual({ total: 0, toInsert: 0, duplicates: 0 });
  });
});

describe("static safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../lib/piIngestInsertPlanRules.ts"),
    "utf8",
  );
  it("does not import Supabase, React, or perform I/O", () => {
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']react/);
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/createClient/);
  });
  it("only depends on pure pi-ingest pipeline + normalization types", () => {
    expect(src).toMatch(/from\s+["']\.\/piIngestPipeline["']/);
    expect(src).toMatch(/from\s+["']\.\/sensorIngestNormalizationRules["']/);
  });
});
