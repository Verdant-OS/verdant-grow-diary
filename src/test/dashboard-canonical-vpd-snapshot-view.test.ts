/**
 * buildTentSnapshotView · canonicalVpd (#2303 / #2268): the tents list strip
 * grades VPD from the Dashboard Tonight derivation, including capture identity.
 */
import { describe, expect, it } from "vitest";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { sensorCaptureRef } from "@/lib/sensorCaptureRefRules";

const NOW = new Date("2026-10-22T15:00:00.000Z").getTime();
const TS = "2026-10-22T14:55:00.000Z";
/** Recent CSV capture, older than the cohort but inside freshness windows. */
const CSV_TS = "2026-10-22T14:50:00.000Z";

function row(over: Partial<BuildTentSnapshotInput>): BuildTentSnapshotInput {
  return {
    ts: TS,
    captured_at: TS,
    metric: "temperature_c",
    value: 24,
    source: "manual",
    ...over,
  };
}

function cohortManual(): BuildTentSnapshotInput[] {
  return [
    row({ metric: "temperature_c", value: 24 }),
    row({ metric: "humidity_pct", value: 55 }),
    row({ metric: "vpd_kpa", value: 0.9 }),
  ];
}

function vpdMetric(view: ReturnType<typeof buildTentSnapshotView>) {
  return view.metrics.find((m) => m.key === "vpd")!;
}

describe("buildTentSnapshotView · canonicalVpd capture identity", () => {
  it("replaces the cohort stored VPD when canonical shares a known capture ref", () => {
    const ref = sensorCaptureRef(TS, "manual")!;
    const rows = cohortManual().map((r) => ({ ...r, capture_ref: ref }));
    const view = buildTentSnapshotView(rows, "veg", NOW, {
      canonicalVpd: {
        kpa: 1.75,
        capturedAt: TS,
        source: "manual",
        sourceLabel: "Manual",
        ageText: "5m ago",
        captureRefs: [ref],
      },
    });
    expect(vpdMetric(view).display).toBe("1.75");
    expect(vpdMetric(view).status).toBe("ok");
  });

  it("grades a cross-capture canonical VPD with its own source, not the cohort badge", () => {
    const cohortRef = sensorCaptureRef(TS, "manual")!;
    const canonicalRef = sensorCaptureRef(CSV_TS, "csv")!;
    const rows = cohortManual().map((r) => ({ ...r, capture_ref: cohortRef }));
    const view = buildTentSnapshotView(rows, "veg", NOW, {
      canonicalVpd: {
        kpa: 1.2,
        capturedAt: CSV_TS,
        source: "csv",
        sourceLabel: "CSV",
        ageText: "10m ago",
        captureRefs: [canonicalRef],
      },
    });
    expect(vpdMetric(view).display).toBe("1.20");
    expect(vpdMetric(view).status).toBe("degraded");
    expect(vpdMetric(view).statusLabel).toMatch(/Historical/);
    expect(view.sourceLabel).toBe("Manual");
  });

  it("withholds the cohort stored VPD when the canonical capture is rejected at the same instant", () => {
    const ref = sensorCaptureRef(TS, "live")!;
    const rows = [
      row({ source: "live", metric: "temperature_c", value: 24, capture_ref: ref }),
      row({ source: "live", metric: "humidity_pct", value: 150, capture_ref: ref }),
      row({ source: "live", metric: "vpd_kpa", value: 1.1, capture_ref: ref }),
    ];
    const view = buildTentSnapshotView(rows, "veg", NOW, {
      canonicalVpd: {
        kpa: 1.1,
        capturedAt: TS,
        source: "live",
        sourceLabel: "Live",
        ageText: null,
        rejected: true,
        captureRefs: [ref],
      },
    });
    expect(vpdMetric(view).status).toBe("invalid");
    expect(vpdMetric(view).statusLabel).toBe("Invalid");
  });

  it("marks an in-range canonical VPD invalid when sensor truth rejects the kPa", () => {
    const ref = sensorCaptureRef(TS, "manual")!;
    const rows = cohortManual().map((r) => ({ ...r, capture_ref: ref }));
    const view = buildTentSnapshotView(rows, "veg", NOW, {
      canonicalVpd: {
        kpa: 4.0,
        capturedAt: TS,
        source: "manual",
        sourceLabel: "Manual",
        ageText: null,
        captureRefs: [ref],
      },
    });
    expect(vpdMetric(view).display).toBe("4.00");
    expect(vpdMetric(view).status).toBe("invalid");
  });

  it("falls back to source match when capture refs are unknown on either side", () => {
    const rows = cohortManual();
    const view = buildTentSnapshotView(rows, "veg", NOW, {
      canonicalVpd: {
        kpa: 1.75,
        capturedAt: TS,
        source: "manual",
        sourceLabel: "Manual",
        ageText: null,
        captureRefs: [null],
      },
    });
    expect(vpdMetric(view).display).toBe("1.75");
  });

  it("does not treat matching timestamp alone as the same capture when refs and source differ", () => {
    const cohortRef = sensorCaptureRef(TS, "manual")!;
    const rows = cohortManual().map((r) => ({ ...r, capture_ref: cohortRef }));
    const view = buildTentSnapshotView(rows, "veg", NOW, {
      canonicalVpd: {
        kpa: 2.0,
        capturedAt: TS,
        source: "csv",
        sourceLabel: "CSV",
        ageText: null,
        captureRefs: [sensorCaptureRef(TS, "csv")!],
      },
    });
    expect(vpdMetric(view).display).toBe("2.00");
    expect(vpdMetric(view).status).toBe("degraded");
    expect(view.metrics.find((m) => m.key === "vpd")!.display).not.toBe("0.90");
  });
});
