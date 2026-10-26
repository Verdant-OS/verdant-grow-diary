/**
 * Regressions for the Copilot review of #2303 at b49c32ae (Tent Detail VPD):
 *  - Tonight's invalid state is terminal before the header-rejection fallback.
 *  - The final fallback honours known, distinct capture identities.
 */
import { describe, expect, it } from "vitest";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import { resolveTentDetailVpd } from "@/lib/tentDetailVpdRules";
import { sensorCaptureRef } from "@/lib/sensorCaptureRefRules";

const NOW = Date.parse("2026-10-22T12:20:00.000Z");
const T1200 = "2026-10-22T12:00:00.000Z";
const T1205 = "2026-10-22T12:05:00.000Z";
const T1210 = "2026-10-22T12:10:00.000Z";

function tonight(over: Partial<TonightMetricView>): TonightMetricView {
  return {
    key: "vpd",
    label: "VPD",
    state: "value",
    value: 1.2,
    source: "live",
    sourceLabel: "Live",
    capturedAt: T1205,
    ageText: null,
    calculated: false,
    ...over,
  } as TonightMetricView;
}

describe("Tonight invalid is terminal before the header fallback", () => {
  it("withholds VPD instead of restoring an older manual observation", () => {
    const out = resolveTentDetailVpd({
      tonight: tonight({ state: "invalid", value: null, source: "invalid", capturedAt: T1205 }),
      existing: { value: 1.1, capturedAt: T1200, source: "manual", stale: false },
      rejectedMetrics: ["rh"],
      rejectedCapturedAt: T1210,
      rejectedRefs: [null],
      existingRef: null,
      contributors: null,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBeNull();
  });

  it("still keeps a genuinely newer existing observation", () => {
    const out = resolveTentDetailVpd({
      tonight: tonight({ state: "invalid", value: null, source: "invalid", capturedAt: T1200 }),
      existing: { value: 1.1, capturedAt: T1205, source: "manual", stale: false },
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: null,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.1);
  });
});

describe("the final fallback honours known capture identities", () => {
  const manualRef = sensorCaptureRef(T1205, "manual")!;
  const liveRef = sensorCaptureRef(T1205, "live")!;

  it("keeps a valid same-instant sensor VPD when the manual capture fails its RH check", () => {
    const out = resolveTentDetailVpd({
      tonight: tonight({ source: "manual", captureRefs: [manualRef] }),
      existing: { value: 1.3, capturedAt: T1205, source: "live", stale: false },
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      existingRef: liveRef,
      contributors: null,
      captureClimate: [{ at: T1205, temp: 24, rh: 0, ref: manualRef }],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.3);
    expect(out.source).toBe("live");
  });

  it("withholds when the existing VPD is the failed capture itself", () => {
    const out = resolveTentDetailVpd({
      tonight: tonight({ source: "manual", captureRefs: [manualRef] }),
      existing: { value: 1.2, capturedAt: T1205, source: "manual", stale: false },
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      existingRef: manualRef,
      contributors: null,
      captureClimate: [{ at: T1205, temp: 24, rh: 0, ref: manualRef }],
      nowMs: NOW,
    });
    expect(out.value).toBeNull();
  });
});
