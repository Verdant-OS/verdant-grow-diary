/**
 * Regressions for Copilot's review of #2459 at de8c1b27: a rejected cohort VPD
 * shows no number and no stage prompt, the unpaired fallback never combines
 * two devices at one instant, and Tent Detail labels a withheld VPD.
 */
import { describe, expect, it } from "vitest";
import { buildTonightTentMetrics, type TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import { buildTentSnapshotView } from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { resolveTentDetailVpd, tentDetailCaptureClimate } from "@/lib/tentDetailVpdRules";
import { sensorCaptureRef } from "@/lib/sensorCaptureRefRules";

const NOW = Date.parse("2026-10-23T19:00:00.000Z");
const T = new Date(NOW - 3 * 60_000).toISOString();
const TENT = "tent-1";

const row = (
  metric: string,
  value: number,
  device: string | null,
  quality = "ok",
  source = "live",
) => ({
  id: `${metric}-${device ?? "none"}`,
  metric,
  value,
  ts: T,
  captured_at: T,
  tent_id: TENT,
  source,
  quality,
  device_id: device,
});

const rejectedCanonical = {
  kpa: null,
  capturedAt: T,
  source: "live" as const,
  sourceLabel: "Live",
  ageText: "3m ago",
  rejected: true as const,
  captureRefs: [sensorCaptureRef(T, "live", "gw-a")],
};

describe("a rejected cohort VPD on the tent strip", () => {
  it("shows Invalid without the rejected number", () => {
    const view = buildTentSnapshotView(
      [row("temperature_c", 25, "gw-a"), row("vpd_kpa", 1.2, "gw-a", "invalid")],
      "veg",
      NOW,
      { canonicalVpd: rejectedCanonical },
    );
    const vpd = view.metrics.find((m) => m.key === "vpd")!;
    expect(vpd.status).toBe("invalid");
    expect(vpd.display).toBe("—");
  });

  it("withholds the stage prompt when only the canonical snapshot carries the rejection", () => {
    const view = buildTentSnapshotView(
      [row("temperature_c", 25, "gw-a"), row("humidity_pct", 60, "gw-a")],
      "veg",
      NOW,
      { canonicalVpd: rejectedCanonical },
    );
    expect(view.metrics.find((m) => m.key === "vpd")?.status).toBe("invalid");
    expect(view.canAssessStage).toBe(false);
  });
});

describe("Tonight's unpaired VPD fallback", () => {
  it("does not calculate from two devices' temperature and RH at one instant", () => {
    const vpd = buildTonightTentMetrics({
      rows: [row("temperature_c", 25, "gw-a"), row("humidity_pct", 60, "gw-b")] as never,
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: new Date(NOW),
    }).find((m) => m.key === "vpd")!;
    expect(vpd.state).not.toBe("value");
    expect(vpd.value ?? null).toBeNull();
  });

  it("still calculates from one device's temperature and RH", () => {
    const vpd = buildTonightTentMetrics({
      rows: [row("temperature_c", 25, "gw-a"), row("humidity_pct", 60, "gw-a")] as never,
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: new Date(NOW),
    }).find((m) => m.key === "vpd")!;
    expect(vpd.state).toBe("value");
    expect(vpd.calculated).toBe(true);
  });
});

describe("Tent Detail reports a withheld VPD as rejected", () => {
  const base = {
    existing: { value: null, capturedAt: null, source: null, stale: false },
    contributors: null,
    captureClimate: [],
    nowMs: NOW,
  };

  it("when Tonight's value fails sensor truth and nothing else stands in", () => {
    const observation = resolveTentDetailVpd({
      ...base,
      tonight: {
        key: "vpd",
        state: "value",
        value: 9.9,
        capturedAt: T,
        source: "live",
        calculated: false,
      } as unknown as TonightMetricView,
      rejectedMetrics: [],
      rejectedCapturedAt: null,
    });
    expect(observation.value).toBeNull();
    expect(observation.rejected).toBe(true);
  });

  it("when the header rejects the VPD and there is no stand-in", () => {
    const observation = resolveTentDetailVpd({
      ...base,
      tonight: null,
      rejectedMetrics: ["vpd"],
      rejectedCapturedAt: T,
    });
    expect(observation.value).toBeNull();
    expect(observation.rejected).toBe(true);
  });

  it("does not call a VPD invalid when only the temperature was rejected and no VPD existed", () => {
    // Independent review on #2474 at 5e9cb604: no VPD row, no RH, Tonight
    // missing. A rejected temperature alone is not a rejected VPD.
    const observation = resolveTentDetailVpd({
      ...base,
      tonight: null,
      rejectedMetrics: ["temp"],
      rejectedCapturedAt: T,
    });
    expect(observation.value).toBeNull();
    expect(observation.rejected).toBeUndefined();
  });

  it("still withholds when the rejected capture had a temperature + RH pair", () => {
    // Codex P2 on #2499: the production helper emits temperature and RH as
    // separate entries, so build the climate from rows, as the page does.
    const observation = resolveTentDetailVpd({
      ...base,
      tonight: null,
      captureClimate: tentDetailCaptureClimate(
        [row("temperature_c", 60, "gw-a"), row("humidity_pct", 55, "gw-a")] as never,
        null,
      ),
      rejectedMetrics: ["temp"],
      rejectedCapturedAt: T,
    });
    expect(observation.value).toBeNull();
    expect(observation.rejected).toBe(true);
  });

  it("does not mark a VPD that was simply never observed", () => {
    const observation = resolveTentDetailVpd({
      ...base,
      tonight: null,
      rejectedMetrics: [],
      rejectedCapturedAt: null,
    });
    expect(observation.rejected).toBeUndefined();
  });
});
