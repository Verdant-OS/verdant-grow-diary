/**
 * Regression — Photo and Environment Check Fast Add prefills seed
 * timestamps correctly from every Fast Add entry point.
 *
 * All Fast Add entry points (Global Fast Add button, plant/tent detail
 * Fast Add tray, dashboard shortcut, and the GlobalSearch empty-state
 * quick-start buttons) share a single code path: they call
 * `resolveFastAddIntent(actionId, ctx)` and dispatch the returned
 * `PLANT_QUICKLOG_PREFILL_EVENT` prefill unchanged. This test exercises
 * that helper directly against representative contexts (plant+tent,
 * plant-only, tent-only) so a regression in the shared helper is caught
 * regardless of which entry point invoked it.
 *
 * Contract (per buildFastAddTimestampDefaults):
 *   - environment → occurred_at = now AND captured_at = now
 *   - photo       → occurred_at = now only (captured_at is owned by the
 *                   photo upload flow, which stamps it from EXIF or the
 *                   upload moment — the Fast Add helper must not preseed
 *                   it and clobber that source of truth)
 */
import { describe, it, expect } from "vitest";
import {
  resolveFastAddIntent,
  type FastAddSelectionContext,
} from "../lib/fastAddActionRules";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "../lib/plantQuickLogPrefillRules";

const FIXED = new Date("2026-07-24T09:00:00.000Z");
const now = () => FIXED;

const CONTEXTS: ReadonlyArray<[string, FastAddSelectionContext]> = [
  [
    "plant + tent (GlobalSearch empty state on /plants/:id)",
    { plantId: "p1", plantName: "Blue Dream #2", tentId: "t1", tentName: "Tent A", growId: "g1" },
  ],
  [
    "plant only (Global Fast Add button on plant detail)",
    { plantId: "p1", plantName: "Blue Dream #2", tentId: null, growId: "g1" },
  ],
  [
    "tent only (Global Fast Add button on tent detail)",
    { plantId: null, tentId: "t1", tentName: "Tent A", growId: "g1" },
  ],
];

describe("Fast Add — Environment Check prefill seeds occurred_at + captured_at", () => {
  it.each(CONTEXTS)(
    "environment prefill from %s carries occurred_at=now AND captured_at=now",
    (_label, ctx) => {
      const intent = resolveFastAddIntent("environment", ctx, { now });
      expect(intent.kind).toBe("open-quicklog");
      if (intent.kind !== "open-quicklog") return;
      expect(intent.eventName).toBe(PLANT_QUICKLOG_PREFILL_EVENT);
      expect(intent.prefill.eventType).toBe("environment");
      expect(intent.prefill.occurred_at).toBe(FIXED.toISOString());
      expect(intent.prefill.captured_at).toBe(FIXED.toISOString());
    },
  );

  it("environment prefill carries plant/tent/grow context through unchanged", () => {
    const ctx: FastAddSelectionContext = {
      plantId: "p1",
      plantName: "Blue Dream #2",
      tentId: "t1",
      tentName: "Tent A",
      growId: "g1",
    };
    const intent = resolveFastAddIntent("environment", ctx, { now });
    if (intent.kind !== "open-quicklog") throw new Error("expected open-quicklog");
    expect(intent.prefill.plantId).toBe("p1");
    expect(intent.prefill.tentId).toBe("t1");
    expect(intent.prefill.growId).toBe("g1");
  });
});

describe("Fast Add — Photo prefill seeds occurred_at only", () => {
  it.each(CONTEXTS)(
    "photo prefill from %s carries occurred_at=now and does NOT preseed captured_at",
    (_label, ctx) => {
      const intent = resolveFastAddIntent("photo", ctx, { now });
      expect(intent.kind).toBe("open-quicklog");
      if (intent.kind !== "open-quicklog") return;
      expect(intent.eventName).toBe(PLANT_QUICKLOG_PREFILL_EVENT);
      expect(intent.prefill.eventType).toBe("photo");
      expect(intent.prefill.occurred_at).toBe(FIXED.toISOString());
      // captured_at must be undefined so the photo upload flow can stamp it
      // from EXIF or the upload moment without a Fast Add default winning.
      expect(intent.prefill.captured_at).toBeUndefined();
    },
  );

  it("photo prefill carries plant/tent/grow context through unchanged", () => {
    const ctx: FastAddSelectionContext = {
      plantId: "p1",
      plantName: "Blue Dream #2",
      tentId: "t1",
      tentName: "Tent A",
      growId: "g1",
    };
    const intent = resolveFastAddIntent("photo", ctx, { now });
    if (intent.kind !== "open-quicklog") throw new Error("expected open-quicklog");
    expect(intent.prefill.plantId).toBe("p1");
    expect(intent.prefill.tentId).toBe("t1");
    expect(intent.prefill.growId).toBe("g1");
  });
});
