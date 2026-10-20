/**
 * VER-189 reference behavior — tonight tent VPD today, canonical resolver tomorrow.
 *
 * Spec: docs/specs/dashboard-canonical-tent-vpd.md (comparator + CVP-10 / CVP-15
 * sensor-row subset). These tests pin behaviour that must survive extraction into
 * `canonicalTentVpdRules.ts` without rewriting the guards.
 */
import { describe, expect, it } from "vitest";
import {
  buildTonightTentMetrics,
  type TonightMetricView,
  type TonightSensorRow,
  type TonightSnapshotInput,
} from "@/lib/tonightTentHomeViewModel";
import { calculateVpdKpa } from "@/lib/greenhouseClimateRules";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function row(
  over: Partial<TonightSensorRow> & Pick<TonightSensorRow, "metric" | "value">,
): TonightSensorRow {
  const captured_at = over.captured_at ?? minutesAgo(2);
  return {
    id: over.id ?? `${over.metric}-${over.value}-${captured_at}`,
    tent_id: "tent-a",
    source: over.source ?? "live",
    quality: "ok",
    ts: captured_at,
    captured_at,
    raw_payload: null,
    ...over,
  } as TonightSensorRow;
}

function vpdView(
  rows: TonightSensorRow[],
  snapshot: TonightSnapshotInput = { status: "idle", snapshot: null },
) {
  return buildTonightTentMetrics({
    rows,
    rowsRead: { status: "success" },
    snapshot,
    now: NOW,
  }).find((m) => m.key === "vpd")!;
}

function vpdFingerprint(v: TonightMetricView) {
  return {
    state: v.state,
    value: v.value,
    source: v.source,
    calculated: v.calculated,
    capturedAt: v.capturedAt,
  };
}

describe("VER-189 reference — deterministic sensor input order (CVP-10 subset)", () => {
  const baseRows: TonightSensorRow[] = [
    row({
      id: "a-temp",
      metric: "temperature_c",
      value: 24,
      source: "live",
      captured_at: minutesAgo(5),
    }),
    row({
      id: "b-rh",
      metric: "humidity_pct",
      value: 55,
      source: "live",
      captured_at: minutesAgo(5),
    }),
    row({
      id: "c-vpd",
      metric: "vpd_kpa",
      value: 1.1,
      source: "live",
      captured_at: minutesAgo(10),
    }),
  ];

  it("returns the same VPD view when row order is shuffled", () => {
    const orders = [
      baseRows,
      [...baseRows].reverse(),
      [baseRows[2], baseRows[0], baseRows[1]],
      [baseRows[1], baseRows[2], baseRows[0]],
    ];
    const expected = vpdFingerprint(vpdView(baseRows));
    for (const rows of orders) {
      expect(vpdFingerprint(vpdView(rows))).toEqual(expected);
    }
  });
});

describe("VER-189 reference — comparator origin at equal capture time", () => {
  const at = minutesAgo(3);

  it("prefers a sensor-row stored VPD over a snapshot VPD at the same timestamp", () => {
    const vpd = vpdView(
      [row({ metric: "vpd_kpa", value: 1.05, source: "live", captured_at: at, id: "row-vpd" })],
      {
        status: "ok",
        snapshot: { source: "live", ts: at, temp: 24, rh: 55, vpd: 2.5 },
      },
    );
    expect(vpd).toMatchObject({ state: "value", value: 1.05, calculated: false });
  });

  it("keeps stored VPD over a same-time derived pair (comparator basis key)", () => {
    const vpd = vpdView([
      row({ metric: "vpd_kpa", value: 0.9, source: "manual", captured_at: at }),
      row({ metric: "temperature_c", value: 26, source: "manual", captured_at: at }),
      row({ metric: "humidity_pct", value: 50, source: "manual", captured_at: at }),
    ]);
    expect(vpd).toMatchObject({ value: 0.9, calculated: false });
    expect(vpd.value).not.toBe(calculateVpdKpa({ tempC: 26, rhPercent: 50 }));
  });
});
