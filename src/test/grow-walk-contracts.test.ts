import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GROW_WALK_ATTENTION_BANDS,
  GROW_WALK_CONTEXT_VERSION,
  GROW_WALK_CONTRADICTION_CODES,
  GROW_WALK_MISSING_EVIDENCE_CODES,
  GROW_WALK_REASON_CODES,
  type GrowWalkContext,
} from "@/lib/growWalkContracts";

const LIVE_HUMIDITY_READING = {
  id: "reading-1",
  tent_id: "tent-1",
  metric: "humidity_pct",
  value: 58,
  quality: "ok",
  source: "live",
  ts: "2026-08-07T11:55:00.000Z",
  captured_at: "2026-08-07T11:55:00.000Z",
  freshness: "fresh",
  current_live: true,
} as const;

const TENT_CONTEXT = {
  scope: {
    growId: "grow-1",
    growName: "Owned Grow",
    tentId: "tent-1",
    tentName: "Flower Tent",
    plantId: null,
    plantName: null,
  },
  profile: {
    stage: "flower",
    strain: null,
    medium: null,
    potSize: null,
    growType: "photoperiod",
    plantStatus: null,
  },
  evidence: {
    recentEvents: [],
    sensors: { available: true, readings: { humidity_pct: LIVE_HUMIDITY_READING } },
    photos: [
      {
        id: "photo-event-1",
        capturedAt: "2026-08-07T10:00:00.000Z",
        source: "manual",
        inspectedInThisRun: false,
      },
    ],
    alerts: [],
    aiDoctor: null,
    actionQueue: { openCount: 0, items: [] },
  },
  derived: {
    reasonCodes: [],
    missingEvidenceCodes: [],
    contradictionCodes: [],
    recentMajorChangeCount48h: 0,
    latestMajorChangeAt: null,
    latestObservationAt: "2026-08-07T10:00:00.000Z",
    latestAdverseEvidenceAt: null,
    evidenceConfidence: "high",
    attentionBand: "routine_observation",
  },
  receipt: {
    generatedAt: "2026-08-07T12:00:00.000Z",
    lookbackHours: 72,
    contextVersion: "grow-walk-v0.1",
    partialLanes: [],
    truncatedLanes: [],
  },
} satisfies GrowWalkContext;

const PLANT_CONTEXT = {
  ...TENT_CONTEXT,
  scope: {
    ...TENT_CONTEXT.scope,
    plantId: "plant-1",
    plantName: "Sour Diesel Auto",
  },
  profile: {
    ...TENT_CONTEXT.profile,
    strain: "Sour Diesel",
    medium: "coco",
    potSize: "5 gal",
    growType: "autoflower",
    plantStatus: "recovering",
  },
} satisfies GrowWalkContext;

describe("Grow Walk closed contract", () => {
  it("pins attention bands in priority declaration order", () => {
    expect(GROW_WALK_ATTENTION_BANDS).toEqual([
      "immediate_physical_verification",
      "watch_today",
      "routine_observation",
      "insufficient_evidence",
    ]);
    expect(GROW_WALK_CONTEXT_VERSION).toBe("grow-walk-v0.1");
  });

  it("keeps every reason-code vocabulary closed and duplicate-free", () => {
    expect(new Set(GROW_WALK_REASON_CODES).size).toBe(GROW_WALK_REASON_CODES.length);
    expect(new Set(GROW_WALK_MISSING_EVIDENCE_CODES).size).toBe(
      GROW_WALK_MISSING_EVIDENCE_CODES.length,
    );
    expect(new Set(GROW_WALK_CONTRADICTION_CODES).size).toBe(
      GROW_WALK_CONTRADICTION_CODES.length,
    );
  });

  it("supports tent scope and plant scope without inventing relationships", () => {
    expect(TENT_CONTEXT.scope.plantId).toBeNull();
    expect(PLANT_CONTEXT.scope.tentId).toBe("tent-1");
    expect(PLANT_CONTEXT.scope.plantId).toBe("plant-1");
    expect(PLANT_CONTEXT.evidence.photos[0]?.inspectedInThisRun).toBe(false);
  });

  it("does not expose write, secret, raw-payload, or private-storage fields", () => {
    const source = readFileSync("src/lib/growWalkContracts.ts", "utf8");
    for (const forbidden of [
      /\buser_id\b/i,
      /\braw_payload\b/i,
      /signed[_ -]?url/i,
      /storage[_ -]?path/i,
      /bearer\s+/i,
      /access[_ -]?token/i,
      /refresh[_ -]?token/i,
      /target[_ -]?device/i,
      /device[_ -]?command/i,
      /\bapprove\s*\(/i,
      /\bexecute\s*\(/i,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });
});
