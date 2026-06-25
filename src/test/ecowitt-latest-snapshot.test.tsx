import { describe, it, expect } from "vitest";
import {
  ECOWITT_EMPTY_STATE_MESSAGE,
  buildEcowittSnapshotViewModel,
} from "@/lib/ecowittReadingViewModel";

const NOW = new Date("2026-06-04T12:30:00Z");
const FRESH_AT = "2026-06-04T12:20:00Z"; // 10 min ago
const OLDER_AT = "2026-06-04T12:00:00Z"; // 30 min ago
const STALE_AT = "2026-06-04T10:00:00Z"; // 2.5 hr ago

function payload(dateutc: string, overrides: Record<string, unknown> = {}) {
  return { dateutc, temp1f: 77, humidity1: 55, soilmoisture1: 40, ...overrides };
}

describe("ecowittReadingViewModel.buildEcowittSnapshotViewModel", () => {
  it("renders empty state when there are no candidates", () => {
    const vm = buildEcowittSnapshotViewModel([], { now: NOW });
    expect(vm.hasReading).toBe(false);
    expect(vm.emptyStateMessage).toBe(ECOWITT_EMPTY_STATE_MESSAGE);
    expect(vm.snapshot).toBeNull();
    expect(vm.sourceLabel).toBeNull();
  });

  it("renders empty state when all candidate payloads are invalid", () => {
    const vm = buildEcowittSnapshotViewModel(
      [
        { payload: null, source: "live" },
        { payload: { passkey: "x" }, source: "live" },
      ],
      { now: NOW },
    );
    expect(vm.hasReading).toBe(false);
    expect(vm.emptyStateMessage).toBe(ECOWITT_EMPTY_STATE_MESSAGE);
  });

  it("picks the newest valid reading and labels a fresh listener reading as Ecowitt", () => {
    const vm = buildEcowittSnapshotViewModel(
      [
        { payload: payload(OLDER_AT, { humidity1: 60 }), source: "live" },
        { payload: payload(FRESH_AT, { humidity1: 55 }), source: "live" },
      ],
      { now: NOW },
    );
    expect(vm.hasReading).toBe(true);
    expect(Date.parse(vm.snapshot?.capturedAt ?? "")).toBe(Date.parse(FRESH_AT));
    expect(vm.metrics.humidity_pct).toBe(55);
    expect(vm.source).toBe("live");
    expect(vm.sourceLabel?.label).toBe("Ecowitt");
    expect(vm.sourceLabel?.vendorPromoted).toBe(true);
  });

  it("labels a manual EcoWitt entry as Manual and never Live", () => {
    const vm = buildEcowittSnapshotViewModel(
      [{ payload: payload(FRESH_AT), source: "manual" }],
      { now: NOW },
    );
    expect(vm.source).toBe("manual");
    expect(vm.sourceLabel?.label).toBe("Manual");
    expect(vm.sourceLabel?.vendorPromoted).toBe(false);
    expect(vm.sourceLabel?.label).not.toBe("Live");
    expect(vm.sourceLabel?.label).not.toBe("Ecowitt");
  });

  it("demotes a stale listener reading to Stale, never Live", () => {
    const vm = buildEcowittSnapshotViewModel(
      [{ payload: payload(STALE_AT), source: "live" }],
      { now: NOW },
    );
    expect(vm.freshness).toBe("stale");
    expect(vm.source).toBe("stale");
    expect(vm.sourceLabel?.label).toBe("Stale");
    expect(vm.sourceLabel?.label).not.toBe("Live");
    expect(vm.sourceLabel?.label).not.toBe("Ecowitt");
  });

  it("exposes a derived VPD value labelled by the consumer (never Live)", () => {
    const vm = buildEcowittSnapshotViewModel(
      [{ payload: payload(FRESH_AT), source: "live" }],
      { now: NOW },
    );
    expect(vm.derivedVpdKpa).not.toBeNull();
    // VPD is now explicitly surfaced in the metrics map for presenter convenience.
    expect(vm.metrics.vpd_kpa).not.toBeNull();
    // Derived VPD lives in metrics.vpd_kpa and derivedVpdKpa, not inside snapshot.readings.
    expect(
      vm.snapshot?.readings.some(
        (r) => (r as { metric: string }).metric === "vpd_kpa",
      ),
    ).toBe(false);
  });
});
