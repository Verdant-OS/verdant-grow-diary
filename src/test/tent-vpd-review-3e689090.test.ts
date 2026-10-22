/**
 * Regressions for the Codex reviews of #2303 at b2606eca and 3e689090:
 *  - P1: a raw VPD row from a capture the snapshot rejected still won
 *    Tonight's tie over the rejected snapshot copy.
 *  - P1: a sibling rejected by its explicit stale/invalid source was dropped,
 *    not carried as rejection evidence.
 *  - P2: the tents list ignored a failed refresh of its cached rows.
 *  - P1: the tents list turned Tonight's invalid newer VPD into "no VPD", so
 *    an older stored VPD read healthy.
 *  - P2: a calculated VPD was checked against the displayed temperature and
 *    RH, not the pair it came from.
 */
import { describe, expect, it } from "vitest";
import { buildTonightTentMetrics, type TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import { tentsListCanonicalVpd } from "@/lib/tentsListVpdRules";
import { selectRejectedQualityRows } from "@/lib/dashboardSensorEvidenceRules";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";

const NOW = Date.parse("2026-10-22T18:00:00.000Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const T = at(3);
const TENT = "tent-1";

const row = (
  metric: string,
  value: number,
  iso: string,
  source = "live",
  quality: string | null = "ok",
): BuildTentSnapshotInput & { tent_id: string } => ({
  metric,
  value,
  ts: iso,
  captured_at: iso,
  tent_id: TENT,
  source,
  quality,
});

const ref = (source: string, iso: string, id: string) => ({ id, captured_at: iso, source });

function tonightVpd(input: {
  rows: ReturnType<typeof row>[];
  status: "success" | "error";
  snapshot: Record<string, unknown> | null;
}): TonightMetricView {
  return buildTonightTentMetrics({
    rows: input.rows as never,
    rowsRead: { status: input.status },
    snapshot: input.snapshot
      ? { status: "ok", snapshot: input.snapshot as never }
      : { status: "unavailable", snapshot: null },
    now: new Date(NOW),
  }).find((m) => m.key === "vpd")!;
}

describe("Tonight rejects the raw copy of a rejected capture too (P1 at b2606eca)", () => {
  it("withholds a successful raw VPD whose snapshot capture carries a degraded RH", () => {
    const vpd = tonightVpd({
      rows: [row("vpd_kpa", 1.2, T), row("temperature_c", 24, T)],
      status: "success",
      snapshot: {
        source: "live",
        ts: T,
        temp: 24,
        rh: null,
        vpd: 1.2,
        metric_refs: { temp: ref("live", T, "r-temp"), vpd: ref("live", T, "r-vpd") },
        rejected_quality_rows: [
          {
            metric: "humidity_pct",
            value: 55,
            captured_at: T,
            source: "live",
            quality: "degraded",
          },
        ],
      },
    });
    expect(vpd.state).toBe("invalid");
    expect(vpd.value).toBeNull();
  });

  it("keeps the raw VPD when the rejected sibling belongs to another capture", () => {
    const vpd = tonightVpd({
      rows: [row("vpd_kpa", 1.2, T)],
      status: "success",
      snapshot: {
        source: "live",
        ts: T,
        temp: null,
        rh: null,
        vpd: 1.2,
        metric_refs: { vpd: ref("live", T, "r-vpd") },
        rejected_quality_rows: [
          {
            metric: "humidity_pct",
            value: 55,
            captured_at: at(60),
            source: "live",
            quality: "degraded",
          },
        ],
      },
    });
    expect(vpd.state).toBe("value");
    expect(vpd.value).toBe(1.2);
  });
});

describe("explicit stale/invalid-source siblings are rejection evidence (P1 at b2606eca)", () => {
  it("carries stale- and invalid-source rows, naming the downgrade as their quality", () => {
    const carried = selectRejectedQualityRows([
      { ...row("humidity_pct", 55, T, "stale", "ok"), raw_payload: null },
      { ...row("temperature_c", 24, T, "invalid", null), raw_payload: null },
      { ...row("vpd_kpa", 1.2, T, "live", "ok"), raw_payload: null },
    ] as never);
    expect(carried).toEqual([
      expect.objectContaining({ metric: "humidity_pct", source: "stale", quality: "stale" }),
      expect.objectContaining({ metric: "temperature_c", source: "invalid", quality: "invalid" }),
    ]);
  });

  it("an invalid-source RH at the VPD's instant withholds that live VPD", () => {
    const vpd = tonightVpd({
      rows: [],
      status: "error",
      snapshot: {
        source: "live",
        ts: T,
        temp: null,
        rh: null,
        vpd: 1.2,
        metric_refs: { vpd: ref("live", T, "r-vpd") },
        rejected_quality_rows: [
          {
            metric: "humidity_pct",
            value: 55,
            captured_at: T,
            source: "invalid",
            quality: "invalid",
          },
        ],
      },
    });
    expect(vpd.state).toBe("invalid");
  });
});

describe("the tents list follows Tonight on a failed refresh (P2 at b2606eca)", () => {
  const cached = [
    row("temperature_c", 24, at(10), "manual"),
    row("humidity_pct", 60, at(10), "manual"),
    row("vpd_kpa", 1.2, at(10), "manual"),
  ];
  const unavailable = { status: "unavailable" as const, snapshot: null };

  it("derives no VPD from cached rows whose refresh failed", () => {
    expect(tentsListCanonicalVpd(cached, TENT, NOW, unavailable, "refresh_error")).toBeNull();
  });

  it("still derives it when the read succeeded", () => {
    expect(tentsListCanonicalVpd(cached, TENT, NOW, unavailable, "success")).toMatchObject({
      kpa: 1.2,
    });
  });
});

describe("an invalid newer VPD never reveals an older stored one (P1 at 3e689090)", () => {
  const older = [
    row("temperature_c", 24, at(120), "manual"),
    row("humidity_pct", 60, at(120), "manual"),
    row("vpd_kpa", 1.1, at(120), "manual"),
  ];
  const newerRejected = {
    status: "ok" as const,
    snapshot: {
      source: "live",
      ts: T,
      temp: null,
      rh: null,
      vpd: 1.3,
      metric_refs: { vpd: ref("live", T, "r-vpd") },
      rejected_quality_rows: [
        { metric: "humidity_pct", value: 55, captured_at: T, source: "live", quality: "degraded" },
      ],
    } as never,
  };

  it("returns an explicit rejection, not null", () => {
    expect(tentsListCanonicalVpd(older, TENT, NOW, newerRejected)).toMatchObject({
      kpa: null,
      rejected: true,
      capturedAt: T,
    });
  });

  it("the list shows the VPD as Invalid, not the older stored 1.1", () => {
    const view = buildTentSnapshotView(older, "veg", NOW, {
      canonicalVpd: tentsListCanonicalVpd(older, TENT, NOW, newerRejected),
    });
    const vpd = view.metrics.find((m) => m.key === "vpd")!;
    expect(vpd.status).toBe("invalid");
    expect(vpd.display).toBe("—");
  });
});

describe("a calculated VPD is checked against the pair it came from (P2 at 3e689090)", () => {
  // A valid same-capture pair ten minutes ago, then a newer out-of-range
  // temperature with no RH: Tonight calculates from the older pair.
  const rows = [
    row("temperature_c", 80, at(1), "manual"),
    row("temperature_c", 24, at(10), "manual"),
    row("humidity_pct", 60, at(10), "manual"),
  ];

  it("Tonight carries the pair it used", () => {
    const vpd = tonightVpd({ rows, status: "success", snapshot: null });
    expect(vpd.calculated).toBe(true);
    expect(vpd.inputs).toEqual({ temp: 24, rh: 60 });
  });

  it("the list does not reject it for the newer displayed temperature", () => {
    const canonical = tentsListCanonicalVpd(rows, TENT, NOW);
    expect(canonical?.rejected).toBeUndefined();
    expect(canonical?.kpa).toBeCloseTo(1.19, 2);
  });
});

describe("raw rejected siblings withhold a raw VPD without the snapshot (P1 at 413fdbd2)", () => {
  it.each([
    ["degraded RH", row("humidity_pct", 55, T, "live", "degraded")],
    ["invalid-source RH", row("humidity_pct", 55, T, "invalid", null)],
    ["stale-source temperature", row("temperature_c", 24, T, "stale", "ok")],
  ])(
    "withholds a live raw VPD beside a %s while the snapshot is unavailable",
    (_label, sibling) => {
      const vpd = tonightVpd({
        rows: [row("vpd_kpa", 1.2, T), sibling],
        status: "success",
        snapshot: null,
      });
      expect(vpd.state).toBe("invalid");
      expect(vpd.value).toBeNull();
    },
  );

  it("keeps the raw VPD when the rejected raw sibling belongs to another capture", () => {
    const vpd = tonightVpd({
      rows: [row("vpd_kpa", 1.2, T), row("humidity_pct", 55, at(60), "live", "degraded")],
      status: "success",
      snapshot: null,
    });
    expect(vpd.state).toBe("value");
    expect(vpd.value).toBe(1.2);
  });
});

describe("a self-rejected newest VPD stays terminal (P1 at 6a242e1f)", () => {
  const older = row("vpd_kpa", 1.1, at(30), "live");

  it.each([
    ["degraded quality", row("vpd_kpa", 1.4, T, "live", "degraded")],
    ["invalid source", row("vpd_kpa", 1.4, T, "invalid", null)],
    ["stale source", row("vpd_kpa", 1.4, T, "stale", "ok")],
  ])("withholds an older valid VPD behind a newest VPD with %s", (_label, rejected) => {
    const vpd = tonightVpd({ rows: [older, rejected], status: "success", snapshot: null });
    expect(vpd.state).toBe("invalid");
    expect(vpd.value).toBeNull();
  });

  it("withholds it when the rejection is only in the snapshot metadata", () => {
    const vpd = tonightVpd({
      rows: [],
      status: "error",
      snapshot: {
        source: "live",
        ts: at(30),
        temp: null,
        rh: null,
        vpd: 1.1,
        metric_refs: { vpd: ref("live", at(30), "r-old") },
        rejected_quality_rows: [
          { metric: "vpd_kpa", value: 1.4, captured_at: T, source: "live", quality: "degraded" },
        ],
      },
    });
    expect(vpd.state).toBe("invalid");
  });

  it("keeps a valid VPD that is newer than the rejected one", () => {
    const vpd = tonightVpd({
      rows: [row("vpd_kpa", 1.2, T), row("vpd_kpa", 1.4, at(30), "live", "degraded")],
      status: "success",
      snapshot: null,
    });
    expect(vpd.state).toBe("value");
    expect(vpd.value).toBe(1.2);
  });
});
