/**
 * Regression — Training Fast Add prefill seeds BOTH occurred_at and
 * captured_at, matching Environment, from every Fast Add entry point.
 *
 * Fast Add entry points (Global Fast Add button, plant/tent detail Fast Add
 * tray, dashboard shortcut, and the GlobalSearch empty-state "Create
 * training" button) all share a single code path: they call
 * `resolveFastAddIntent("training", ctx)` and dispatch the returned
 * `PLANT_QUICKLOG_PREFILL_EVENT` prefill unchanged. This test exercises
 * that helper directly against representative contexts (plant-only,
 * tent-only, plant+tent) so a regression in the shared helper is caught
 * regardless of which entry point invoked it.
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

describe("Fast Add — Training prefill seeds occurred_at + captured_at", () => {
  it.each(CONTEXTS)(
    "training prefill from %s carries occurred_at=now AND captured_at=now",
    (_label, ctx) => {
      const intent = resolveFastAddIntent("training", ctx, { now });
      expect(intent.kind).toBe("open-quicklog");
      if (intent.kind !== "open-quicklog") return;
      expect(intent.eventName).toBe(PLANT_QUICKLOG_PREFILL_EVENT);
      expect(intent.prefill.eventType).toBe("training");
      expect(intent.prefill.occurred_at).toBe(FIXED.toISOString());
      expect(intent.prefill.captured_at).toBe(FIXED.toISOString());
    },
  );

  it("training prefill matches the environment prefill shape for timestamps", () => {
    const ctx: FastAddSelectionContext = {
      plantId: "p1",
      tentId: "t1",
      growId: "g1",
    };
    const training = resolveFastAddIntent("training", ctx, { now });
    const environment = resolveFastAddIntent("environment", ctx, { now });
    if (training.kind !== "open-quicklog" || environment.kind !== "open-quicklog") {
      throw new Error("expected open-quicklog for both training and environment");
    }
    expect(training.prefill.occurred_at).toBe(environment.prefill.occurred_at);
    expect(training.prefill.captured_at).toBe(environment.prefill.captured_at);
  });
});
