/**
 * Regressions for the Codex review of #2303 at 4a304fe3:
 *  - P1: Tonight ignored a snapshot's quality-rejected siblings (Dashboard and
 *    Tent Detail showed that capture's VPD as current Live).
 *  - P1: Tonight lent the snapshot's aggregate source to every metric.
 *  - P2: the tents list relabelled a raw `pi_bridge` ref as unverified.
 *  - P2: Tent Detail named a generic diary snapshot "Manual reading".
 *  - P2: a header-rejected capture suppressed an independent same-instant
 *    Tonight VPD from another record.
 */
import { describe, expect, it } from "vitest";
import { buildTonightTentMetrics, type TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import { resolveTentDetailVpd, tentDetailCaptureClimate } from "@/lib/tentDetailVpdRules";
import { tentsListDiarySnapshotRows } from "@/lib/tentsListVpdRules";
import { sensorCaptureRef } from "@/lib/sensorCaptureRefRules";

const NOW = Date.parse("2026-10-22T03:00:00.000Z");
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const T = at(0.05);
const ref = (source: string, id: string) => ({ id, captured_at: T, source });
const NO_VPD = { value: null, capturedAt: null, source: null, stale: false };

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    source: "live",
    ts: T,
    temp: 24,
    rh: null,
    vpd: 1.2,
    metric_refs: { temp: ref("live", "row-temp"), vpd: ref("live", "row-vpd") },
    ...overrides,
  };
}

function tonightVpd(snap: Record<string, unknown>): TonightMetricView {
  return buildTonightTentMetrics({
    rows: [],
    rowsRead: { status: "error" },
    snapshot: { status: "ok", snapshot: snap as never },
    now: new Date(NOW),
  }).find((m) => m.key === "vpd")!;
}

const DEGRADED_RH = { metric: "humidity_pct", value: 55, source: "live", quality: "degraded" };

describe("Tonight honours a snapshot's quality-rejected siblings (P1)", () => {
  it("never shows a VPD whose own capture has a degraded RH as current", () => {
    const vpd = tonightVpd(
      snapshot({ rejected_quality_rows: [{ ...DEGRADED_RH, captured_at: T }] }),
    );
    expect(vpd.state).toBe("invalid");
    expect(vpd.value).toBeNull();
  });

  it("keeps the VPD when the rejected row belongs to another capture", () => {
    const vpd = tonightVpd(
      snapshot({ rejected_quality_rows: [{ ...DEGRADED_RH, captured_at: at(2) }] }),
    );
    expect(vpd.state).toBe("value");
    expect(vpd.value).toBe(1.2);
  });

  it("Tent Detail's capture climate carries the rejected sibling as untrusted", () => {
    const climate = tentDetailCaptureClimate(
      [],
      snapshot({ rejected_quality_rows: [{ ...DEGRADED_RH, captured_at: T }] }) as never,
    );
    expect(climate).toContainEqual(
      expect.objectContaining({ untrusted: true, ref: sensorCaptureRef(T, "live") }),
    );
  });
});

describe("Tonight uses each snapshot metric's own source (P1)", () => {
  it("shows a CSV VPD as CSV beside a manual temperature", () => {
    const vpd = tonightVpd(
      snapshot({
        source: "manual",
        metric_refs: { temp: ref("manual", "row-temp"), vpd: ref("csv", "row-vpd") },
      }),
    );
    expect(vpd.source).toBe("csv");
  });
});

describe("tents list normalizes raw ref sources (P2)", () => {
  it("keeps a proven pi_bridge row Live", () => {
    const rows = tentsListDiarySnapshotRows(
      {
        status: "ok",
        snapshot: snapshot({
          metric_refs: { temp: ref("pi_bridge", "row-temp"), vpd: ref("pi_bridge", "row-vpd") },
        }) as never,
      },
      "tent-1",
      NOW,
    );
    expect(rows.find((r) => r.metric === "temperature_c")?.source).toBe("live");
    expect(rows.find((r) => r.metric === "vpd_kpa")?.source).toBe("live");
  });
});

const tonight = (overrides: Partial<TonightMetricView>): TonightMetricView => ({
  key: "vpd",
  label: "VPD",
  state: "value",
  value: 1.1,
  source: "manual",
  sourceLabel: "Manual",
  capturedAt: T,
  ageText: "3m ago",
  calculated: false,
  ...overrides,
});

describe("Tent Detail VPD resolver (P2)", () => {
  it("keeps the 'Diary note' label for a generic diary snapshot", () => {
    const out = resolveTentDetailVpd({
      tonight: tonight({ historical: true, sourceLabel: "Diary note" }),
      existing: NO_VPD,
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: null,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.1);
    expect(out.sourceLabel).toBe("Diary note");
  });

  it("keeps an independent same-instant Tonight VPD beside a rejected header capture", () => {
    const out = resolveTentDetailVpd({
      tonight: tonight({ captureRefs: ["diary:entry-1"] }),
      existing: NO_VPD,
      rejectedMetrics: ["temp"],
      rejectedCapturedAt: T,
      rejectedRefs: [sensorCaptureRef(T, "live")],
      contributors: null,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBe(1.1);
  });

  it("still withholds a Tonight VPD from the rejected capture itself", () => {
    const out = resolveTentDetailVpd({
      tonight: tonight({ captureRefs: [sensorCaptureRef(T, "live")] }),
      existing: NO_VPD,
      rejectedMetrics: ["temp"],
      rejectedCapturedAt: T,
      rejectedRefs: [sensorCaptureRef(T, "live")],
      contributors: null,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(out.value).toBeNull();
  });
});
