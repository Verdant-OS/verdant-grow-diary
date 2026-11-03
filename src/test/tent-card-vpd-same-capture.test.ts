/**
 * #2800: a newer temperature saved without RH must not keep the previous
 * capture's VPD on the tent card. The Environment Snapshot already refuses
 * that split cohort.
 */
import { describe, expect, it } from "vitest";
import { buildTentSnapshotView } from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { buildTonightTentMetrics, type TonightSensorRow } from "@/lib/tonightTentHomeViewModel";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const fToC = (fahrenheit: number) => ((fahrenheit - 32) * 5) / 9;

function row(metric: string, value: number, minutes: number): TonightSensorRow & { value: number } {
  const at = minutesAgo(minutes);
  return {
    id: `${metric}-${minutes}`,
    tent_id: "tent-a",
    metric,
    value,
    source: "manual",
    quality: "ok",
    ts: at,
    captured_at: at,
    raw_payload: null,
  };
}

describe("tent card VPD follows the latest climate capture (#2800)", () => {
  const rows = [
    row("temperature_c", fToC(40), 4),
    row("humidity_pct", 60, 4),
    row("temperature_c", fToC(80), 0),
  ];

  it("shows no VPD when the newest temperature was saved without RH", () => {
    const metrics = buildTonightTentMetrics({
      rows,
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: NOW,
    });
    expect(metrics.find((metric) => metric.key === "temp")).toMatchObject({
      state: "value",
      value: fToC(80),
    });
    expect(metrics.find((metric) => metric.key === "rh")).toMatchObject({
      state: "value",
      value: 60,
    });
    expect(metrics.find((metric) => metric.key === "vpd")).toMatchObject({
      state: "not_computed",
      value: null,
      calculated: false,
    });
  });

  it("matches the Environment Snapshot, which does not compute VPD for that cohort", () => {
    const view = buildTentSnapshotView(rows, null, NOW.getTime());
    const vpd = view.metrics.find((metric) => metric.key === "vpd");
    expect(vpd?.display).toBe("—");
    expect(vpd?.statusLabel).toBe("Unknown");
  });
});
