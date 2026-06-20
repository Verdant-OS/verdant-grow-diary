import { describe, expect, it } from "vitest";
import {
  CAPTURE_STORE_SAFETY_BOUND,
  createAiDoctorPromptMeasurementCaptureStore,
} from "@/lib/cost/aiDoctorPromptMeasurementCaptureStore";
import { buildAiDoctorPromptMeasurement } from "@/lib/cost/aiDoctorPromptMeasurement";

function makeBundle(idx: number) {
  return buildAiDoctorPromptMeasurement({
    promptName: "ai_doctor_review",
    recordedAt: new Date(1_700_000_000_000 + idx).toISOString(),
    userPromptText: `sample-${idx}`,
    sourceTags: ["live"],
    includedWindows: ["5m"],
  });
}

describe("aiDoctorPromptMeasurementCaptureStore", () => {
  it("captures, lists, sizes, and clears", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore(10);
    expect(store.size()).toBe(0);
    store.capture(makeBundle(1));
    store.capture(makeBundle(2));
    expect(store.size()).toBe(2);
    expect(store.list().map((c) => c.measurement.promptName)).toEqual([
      "ai_doctor_review",
      "ai_doctor_review",
    ]);
    store.clear();
    expect(store.size()).toBe(0);
  });

  it("enforces bounded ring buffer deterministically (oldest evicted)", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore(3);
    for (let i = 0; i < 5; i++) store.capture(makeBundle(i));
    const ts = store.list().map((c) => c.measurement.recordedAt);
    expect(ts).toHaveLength(3);
    expect(ts[0]).toBe(new Date(1_700_000_000_002).toISOString());
    expect(ts[2]).toBe(new Date(1_700_000_000_004).toISOString());
  });

  it("rejects bundles carrying forbidden fields (prompt text, raw response, secrets)", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore();
    const bundle = makeBundle(1);
    const tainted = {
      ...bundle,
      userPromptText: "leaked diary",
    } as unknown as ReturnType<typeof makeBundle>;
    expect(() => store.capture(tainted)).toThrow(/forbidden/);
  });

  it("safety bound default is a small finite number, not a token threshold", () => {
    expect(CAPTURE_STORE_SAFETY_BOUND).toBeGreaterThan(0);
    expect(CAPTURE_STORE_SAFETY_BOUND).toBeLessThanOrEqual(1000);
  });

  it("captured measurement carries no prompt text fields", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore();
    store.capture(makeBundle(1));
    const [c] = store.list();
    const m = c.measurement as unknown as Record<string, unknown>;
    expect(m.userPromptText).toBeUndefined();
    expect(m.promptText).toBeUndefined();
    expect(m.rawResponse).toBeUndefined();
  });
});
