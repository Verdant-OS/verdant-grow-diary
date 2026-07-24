/**
 * Regression — Note, Watering, and Feeding Fast Add prefills carry the
 * correct plant/tent/grow IDs and timestamp defaults from every Fast Add
 * entry point.
 *
 * All Fast Add entry points (Global Fast Add button, plant/tent detail
 * Fast Add tray, dashboard shortcut, and the GlobalSearch empty-state
 * quick-start buttons) share one code path: they call
 * `resolveFastAddIntent(actionId, ctx)` and dispatch the returned intent
 * unchanged. Exercising the shared helper against representative
 * contexts (plant+tent, plant-only, tent-only) catches regressions in
 * that helper regardless of which UI entry point invoked it.
 *
 * Contracts under test (per buildFastAddTimestampDefaults + resolver):
 *   - diary_note (Note) → open-quicklog, eventType "observation",
 *     occurred_at = now, no captured_at, plant/tent/grow forwarded.
 *   - feeding           → open-quicklog, eventType "feeding",
 *     occurred_at = now, no captured_at, plant/tent/grow forwarded.
 *   - watering          → open-quicklog-v2 with targetKey preferring
 *     plantId over tentId (structured Water form owns its own
 *     timestamp UI; no timestamp defaults come from Fast Add here).
 */
import { describe, it, expect } from "vitest";
import {
  resolveFastAddIntent,
  type FastAddSelectionContext,
} from "../lib/fastAddActionRules";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "../lib/plantQuickLogPrefillRules";
import { QUICK_LOG_V2_OPEN_EVENT } from "../lib/quickLogV2OpenIntent";

const FIXED = new Date("2026-07-24T09:00:00.000Z");
const now = () => FIXED;

const PLANT_TENT: FastAddSelectionContext = {
  plantId: "p1",
  plantName: "Blue Dream #2",
  tentId: "t1",
  tentName: "Tent A",
  growId: "g1",
};
const PLANT_ONLY: FastAddSelectionContext = {
  plantId: "p1",
  plantName: "Blue Dream #2",
  tentId: null,
  growId: "g1",
};
const TENT_ONLY: FastAddSelectionContext = {
  plantId: null,
  tentId: "t1",
  tentName: "Tent A",
  growId: "g1",
};

const OPEN_QUICKLOG_CONTEXTS: ReadonlyArray<[string, FastAddSelectionContext]> = [
  ["plant + tent (GlobalSearch empty state on /plants/:id)", PLANT_TENT],
  ["plant only (Global Fast Add button on plant detail)", PLANT_ONLY],
  ["tent only (Global Fast Add button on tent detail)", TENT_ONLY],
];

describe("Fast Add — Note (diary_note) prefill", () => {
  it.each(OPEN_QUICKLOG_CONTEXTS)(
    "note prefill from %s carries plant/tent/grow IDs, eventType=observation, occurred_at=now, no captured_at",
    (_label, ctx) => {
      const intent = resolveFastAddIntent("diary_note", ctx, { now });
      expect(intent.kind).toBe("open-quicklog");
      if (intent.kind !== "open-quicklog") return;
      expect(intent.eventName).toBe(PLANT_QUICKLOG_PREFILL_EVENT);
      expect(intent.prefill.eventType).toBe("observation");
      expect(intent.prefill.plantId).toBe(ctx.plantId);
      expect(intent.prefill.tentId).toBe(ctx.tentId);
      expect(intent.prefill.growId).toBe(ctx.growId);
      expect(intent.prefill.occurred_at).toBe(FIXED.toISOString());
      // Note is not a captured-in-the-moment event; captured_at must not
      // be preseeded by the Fast Add helper.
      expect(intent.prefill.captured_at).toBeUndefined();
    },
  );
});

describe("Fast Add — Feeding prefill", () => {
  it.each(OPEN_QUICKLOG_CONTEXTS)(
    "feeding prefill from %s carries plant/tent/grow IDs, eventType=feeding, occurred_at=now, no captured_at",
    (_label, ctx) => {
      const intent = resolveFastAddIntent("feeding", ctx, { now });
      expect(intent.kind).toBe("open-quicklog");
      if (intent.kind !== "open-quicklog") return;
      expect(intent.eventName).toBe(PLANT_QUICKLOG_PREFILL_EVENT);
      expect(intent.prefill.eventType).toBe("feeding");
      expect(intent.prefill.plantId).toBe(ctx.plantId);
      expect(intent.prefill.tentId).toBe(ctx.tentId);
      expect(intent.prefill.growId).toBe(ctx.growId);
      expect(intent.prefill.occurred_at).toBe(FIXED.toISOString());
      expect(intent.prefill.captured_at).toBeUndefined();
    },
  );
});

describe("Fast Add — Watering prefill (Quick Log v2 handoff)", () => {
  it("watering from plant+tent context prefers plantId in targetKey", () => {
    const intent = resolveFastAddIntent("watering", PLANT_TENT, { now });
    expect(intent.kind).toBe("open-quicklog-v2");
    if (intent.kind !== "open-quicklog-v2") return;
    expect(intent.eventName).toBe(QUICK_LOG_V2_OPEN_EVENT);
    expect(intent.detail).toEqual({ targetKey: "plant:p1", action: "water" });
  });

  it("watering from plant-only context uses plant targetKey", () => {
    const intent = resolveFastAddIntent("watering", PLANT_ONLY, { now });
    expect(intent.kind).toBe("open-quicklog-v2");
    if (intent.kind !== "open-quicklog-v2") return;
    expect(intent.detail).toEqual({ targetKey: "plant:p1", action: "water" });
  });

  it("watering from tent-only context falls back to tent targetKey", () => {
    const intent = resolveFastAddIntent("watering", TENT_ONLY, { now });
    expect(intent.kind).toBe("open-quicklog-v2");
    if (intent.kind !== "open-quicklog-v2") return;
    expect(intent.detail).toEqual({ targetKey: "tent:t1", action: "water" });
  });

  it("watering with no plant or tent returns needs-context (blocks silent writes)", () => {
    const intent = resolveFastAddIntent("watering", null, { now });
    expect(intent.kind).toBe("needs-context");
  });
});

describe("Fast Add — Note and Feeding require plant or tent context", () => {
  it("diary_note without context returns needs-context", () => {
    expect(resolveFastAddIntent("diary_note", null, { now }).kind).toBe(
      "needs-context",
    );
  });
  it("feeding without context returns needs-context", () => {
    expect(resolveFastAddIntent("feeding", null, { now }).kind).toBe(
      "needs-context",
    );
  });
});
