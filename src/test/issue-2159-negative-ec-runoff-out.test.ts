/**
 * #2159 — negative EC on output and runoff fields (feeding + watering).
 */
import { describe, expect, it } from "vitest";

import {
  buildFeedingFormPayload,
  feedingFormReasonToHelper,
  FEEDING_FORM_DEFAULT_UNIT,
  type QuickLogFeedingFormState,
} from "@/lib/quickLogFeedingFormViewModel";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  buildWateringFormPayload,
  wateringFormReasonToHelper,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";

function wateringForm(patch: Partial<QuickLogWateringFormState> = {}): QuickLogWateringFormState {
  return { ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "500", waterTempC: "22", ...patch };
}

function feedingForm(patch: Partial<QuickLogFeedingFormState> = {}): QuickLogFeedingFormState {
  return {
    lineId: "cronk",
    volumeMl: "500",
    products: [{ name: "Base", amount: "2", unit: FEEDING_FORM_DEFAULT_UNIT }],
    ph: "",
    ecIn: "",
    ppmIn: "",
    ecOut: "",
    ppmOut: "",
    runoffMl: "",
    runoffPh: "",
    runoffEc: "",
    runoffPpm: "",
    waterTempC: "22",
    note: "",
    ...patch,
  };
}

describe("issue 2159 — negative EC on out/runoff fields", () => {
  it("feeding output EC -1 names the output EC field", () => {
    const built = buildFeedingFormPayload({
      growId: "grow-1",
      idempotencyKey: "idem-key-2159-feed-out",
      form: feedingForm({ ecOut: "-0.5" }),
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    const message = feedingFormReasonToHelper(built.reason);
    expect(message).toMatch(/Output EC can't be negative/i);
    expect(message).not.toMatch(/exceeds plausible max/i);
  });

  it("feeding runoff EC -1 names the runoff EC field", () => {
    const built = buildFeedingFormPayload({
      growId: "grow-1",
      idempotencyKey: "idem-key-2159-feed-runoff",
      form: feedingForm({ runoffEc: "-2" }),
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(feedingFormReasonToHelper(built.reason)).toMatch(/Runoff EC can't be negative/i);
  });

  it("watering runoff EC -1 names the runoff EC field", () => {
    const built = buildWateringFormPayload({
      growId: "grow-1",
      idempotencyKey: "idem-key-2159-water-runoff",
      form: wateringForm({ runoffEc: "-1" }),
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(wateringFormReasonToHelper(built.reason)).toMatch(/Runoff EC can't be negative/i);
  });
});
