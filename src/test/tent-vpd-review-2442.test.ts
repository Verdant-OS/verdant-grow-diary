/**
 * Regressions for the reviews of #2437 at 9ddaa0ae and #2442 at e50d6087, and
 * the owner's device_id capture-identity decision on #2442:
 *  - a sibling-rejected raw VPD ranks with the rejection placeholders on ties;
 *  - a valid equal-time calculation replaces only disjoint rejections;
 *  - a mixed-source same-capture VPD keeps its own source and age;
 *  - the stage prompt follows a replacement VPD's own grade;
 *  - Tonight's missing VPD withholds the rows' own VPD;
 *  - device_id splits same-instant captures, and a device-less row matches all.
 */
import { describe, expect, it } from "vitest";
import { buildTonightTentMetrics, type TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
  type CanonicalTentVpd,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import {
  captureRefsMatch,
  sensorCaptureRef,
  snapshotCaptureRef,
} from "@/lib/sensorCaptureRefRules";
import { withRejectedQualityRows } from "@/lib/dashboardSensorEvidenceRules";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = Date.parse("2026-10-23T17:00:00.000Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const T = at(3);
const TENT = "tent-1";

const row = (
  metric: string,
  value: number,
  iso: string,
  source = "live",
  quality: string | null = "ok",
  extra: Record<string, unknown> = {},
) => ({
  metric,
  value,
  ts: iso,
  captured_at: iso,
  tent_id: TENT,
  source,
  quality,
  ...extra,
});

function tonightVpd(
  rows: ReturnType<typeof row>[],
  snapshot: Record<string, unknown> | null = null,
): TonightMetricView {
  return buildTonightTentMetrics({
    rows,
    rowsRead: { status: "success" },
    snapshot: snapshot
      ? { status: "ok", snapshot: snapshot as never }
      : { status: "idle", snapshot: null },
    now: new Date(NOW),
  }).find((m) => m.key === "vpd")!;
}

describe("a sibling-rejected raw VPD ranks with the rejections (Copilot on #2442)", () => {
  // A live VPD beside a degraded live RH at T: that capture is rejected.
  const taintedCapture = [
    row("vpd_kpa", 1.1, T, "live", "ok", { id: "v1" }),
    row("humidity_pct", 55, T, "live", "degraded", { id: "h1" }),
  ];
  const manualEnvelope = (iso: string) => ({
    source: "manual",
    ts: iso,
    temp: null,
    rh: null,
    vpd: 1.3,
    diary_evidence_ref: { id: "entry-1", entry_at: iso },
  });

  it("lets an independent manual-envelope VPD at the same instant stand", () => {
    const vpd = tonightVpd(taintedCapture, manualEnvelope(T));
    expect(vpd.state).toBe("value");
    expect(vpd.value).toBe(1.3);
    expect(vpd.source).toBe("manual");
  });

  it("still reads invalid behind a strictly newer rejected capture", () => {
    const newer = at(1);
    const vpd = tonightVpd(
      [
        row("vpd_kpa", 1.1, newer, "live", "ok", { id: "v1" }),
        row("humidity_pct", 55, newer, "live", "degraded", { id: "h1" }),
      ],
      manualEnvelope(T),
    );
    expect(vpd.state).toBe("invalid");
  });

  it("still reads invalid with no independent VPD at that instant", () => {
    expect(tonightVpd(taintedCapture).state).toBe("invalid");
  });
});

describe("an equal-time calculation replaces only disjoint rejections (Copilot on #2437 and #2442)", () => {
  const livePair = [
    row("temperature_c", 25, T, "live", "ok", { id: "t1", device_id: "gw-a" }),
    row("humidity_pct", 60, T, "live", "ok", { id: "h1", device_id: "gw-a" }),
  ];

  it("calculates from a valid live pair beside a rejected manual VPD at the same instant", () => {
    const vpd = tonightVpd([
      ...livePair,
      row("vpd_kpa", 9.9, T, "manual", "invalid", { id: "m1" }),
    ]);
    expect(vpd.state).toBe("value");
    expect(vpd.calculated).toBe(true);
    expect(vpd.source).toBe("live");
  });

  it("stays invalid when the rejected VPD is the pair's own capture", () => {
    const vpd = tonightVpd([
      ...livePair,
      row("vpd_kpa", 9.9, T, "live", "invalid", { id: "v1", device_id: "gw-a" }),
    ]);
    expect(vpd.state).toBe("invalid");
  });

  it("stays invalid behind a strictly newer rejected VPD", () => {
    const vpd = tonightVpd([
      ...livePair,
      row("vpd_kpa", 9.9, at(1), "manual", "invalid", { id: "m1" }),
    ]);
    expect(vpd.state).toBe("invalid");
  });
});

describe("device_id is part of a sensor capture (owner decision on #2442)", () => {
  it("names the device in the ref and keeps device-less rows matching every device", () => {
    const a = sensorCaptureRef(T, "live", "gw-a");
    const b = sensorCaptureRef(T, "live", "gw-b");
    const legacy = sensorCaptureRef(T, "live");
    expect(a).toBe(`sensor:${Date.parse(T)}:live:dev:gw-a`);
    expect(captureRefsMatch(a, b)).toBe(false);
    expect(captureRefsMatch(a, legacy)).toBe(true);
    expect(captureRefsMatch(legacy, b)).toBe(true);
  });

  it("carries each snapshot metric's device into its capture ref", () => {
    const snapshot: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "live",
      ts: T,
      vpd: 1.1,
      metric_refs: { vpd: { id: "v1", captured_at: T, source: "live" } },
    };
    const rows = [
      row("vpd_kpa", 1.1, T, "live", "ok", { id: "v1", device_id: "gw-a" }),
      row("humidity_pct", 55, T, "live", "degraded", { id: "h1", device_id: "gw-b" }),
    ];
    const withEvidence = withRejectedQualityRows(snapshot, rows)!;
    expect(snapshotCaptureRef(withEvidence, "vpd")).toBe(sensorCaptureRef(T, "live", "gw-a"));
    expect(withEvidence.rejected_quality_rows?.[0]?.device_id).toBe("gw-b");
  });

  it("does not let another device's rejected RH taint this device's VPD", () => {
    const vpd = tonightVpd([
      row("vpd_kpa", 1.1, T, "live", "ok", { id: "v1", device_id: "gw-a" }),
      row("humidity_pct", 55, T, "live", "degraded", { id: "h1", device_id: "gw-b" }),
    ]);
    expect(vpd.state).toBe("value");
    expect(vpd.value).toBe(1.1);
  });

  it("still lets a device-less rejected RH taint it", () => {
    const vpd = tonightVpd([
      row("vpd_kpa", 1.1, T, "live", "ok", { id: "v1", device_id: "gw-a" }),
      row("humidity_pct", 55, T, "live", "degraded", { id: "h1" }),
    ]);
    expect(vpd.state).toBe("invalid");
  });
});

describe("tent strip VPD grading (Codex and Copilot on #2437 at 9ddaa0ae)", () => {
  const vpdMetric = (rows: BuildTentSnapshotInput[], canonicalVpd: CanonicalTentVpd) => {
    const view = buildTentSnapshotView(rows, "veg", NOW, { canonicalVpd });
    return { view, vpd: view.metrics.find((m) => m.key === "vpd")! };
  };
  const ref = (source: string) => sensorCaptureRef(T, source);

  it("grades a live VPD beside a stale-flagged manual temperature on its own source", () => {
    const { vpd } = vpdMetric(
      [
        row("temperature_c", 25, T, "manual", "stale"),
        row("humidity_pct", 60, T, "manual", "ok"),
        row("vpd_kpa", 1.2, T, "live", "ok"),
      ],
      {
        kpa: 1.2,
        capturedAt: T,
        source: "live",
        sourceLabel: "Live",
        ageText: "3m ago",
        captureRefs: [ref("live")],
      },
    );
    expect(vpd.status).toBe("ok");
    expect(vpd.statusLabel).toContain("Live");
  });

  it("keeps a CSV VPD's own label beside manual temperature and RH", () => {
    const { vpd } = vpdMetric(
      [
        row("temperature_c", 25, T, "manual", "ok"),
        row("humidity_pct", 60, T, "manual", "ok"),
        row("vpd_kpa", 1.2, T, "csv", "ok"),
      ],
      {
        kpa: 1.2,
        capturedAt: T,
        source: "csv",
        sourceLabel: "CSV import",
        ageText: "3m ago",
        captureRefs: [ref("csv")],
      },
    );
    expect(vpd.status).toBe("degraded");
    expect(vpd.statusLabel).toBe("Historical · CSV import · 3m ago");
  });

  it("withholds the stage prompt when the VPD from another capture is not ok", () => {
    const old = at(400);
    const { view, vpd } = vpdMetric(
      [row("temperature_c", 25, T, "live", "ok"), row("humidity_pct", 60, T, "live", "ok")],
      {
        kpa: 1.2,
        capturedAt: old,
        source: "csv",
        sourceLabel: "CSV import",
        ageText: "6h ago",
        captureRefs: [sensorCaptureRef(old, "csv")],
      },
    );
    expect(vpd.status).not.toBe("ok");
    expect(view.canAssessStage).toBe(false);
  });

  it("withholds the rows' own VPD when Tonight has none", () => {
    const { vpd } = vpdMetric(
      [
        row("temperature_c", 25, T, "manual", "ok"),
        row("humidity_pct", 60, T, "manual", "ok"),
        row("vpd_kpa", 1.2, T, "manual", "ok"),
      ],
      {
        kpa: null,
        capturedAt: null,
        source: null,
        sourceLabel: null,
        ageText: null,
        missing: true,
      },
    );
    expect(vpd.status).toBe("unknown");
    expect(vpd.display).toBe("—");
  });
});
