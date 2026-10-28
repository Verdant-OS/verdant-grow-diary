/**
 * Regression for the Copilot P1 on #2410: the equal-time shortcut must not
 * bypass Tonight's terminal `invalid` state. An invalid calculated VPD (for
 * example RH 100) with a manual VPD observed at the same instant withholds
 * VPD, matching Tonight; only a strictly newer observation may stand in.
 */
import { describe, expect, it } from "vitest";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import { resolveTentDetailVpd } from "@/lib/tentDetailVpdRules";

const NOW = Date.parse("2026-10-22T12:20:00.000Z");
const T1200 = "2026-10-22T12:00:00.000Z";
const T1205 = "2026-10-22T12:05:00.000Z";

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

function resolve(t: TonightMetricView, existingAt: string) {
  return resolveTentDetailVpd({
    tonight: t,
    existing: { value: 1.1, capturedAt: existingAt, source: "manual", stale: false },
    rejectedMetrics: [],
    rejectedCapturedAt: null,
    contributors: null,
    captureClimate: [],
    nowMs: NOW,
  });
}

describe("equal-time shortcut never bypasses an invalid calculated VPD", () => {
  it("withholds VPD when the existing observation shares the invalid result's instant", () => {
    const out = resolve(
      tonight({ state: "invalid", value: null, source: "invalid", calculated: true }),
      T1205,
    );
    expect(out.value).toBeNull();
  });

  it("still lets a strictly newer observation stand beside an invalid result", () => {
    const out = resolve(
      tonight({
        state: "invalid",
        value: null,
        source: "invalid",
        calculated: true,
        capturedAt: T1200,
      }),
      T1205,
    );
    expect(out.value).toBe(1.1);
  });

  it("keeps the equal-time preference for a direct reading over a calculated value", () => {
    const out = resolve(tonight({ state: "value", value: 1.3, calculated: true }), T1205);
    expect(out.value).toBe(1.1);
  });
});
