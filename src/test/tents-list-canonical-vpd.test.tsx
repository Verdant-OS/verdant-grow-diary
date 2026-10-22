/**
 * #2268 (QA on production ebaf1b6a, 2/2): after manual readings of 80°F/50% RH
 * then 85°F/45% RH, the Dashboard showed 1.75 then 2.26 kPa while the /tents
 * list showed "— kPa". The list now reads the same VPD the Dashboard's Tonight
 * card derives (VER-189), via tentsListCanonicalVpdKpa.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TentEnvironmentSnapshotStrip from "@/components/TentEnvironmentSnapshotStrip";
import { buildTonightTentMetrics } from "@/lib/tonightTentHomeViewModel";
import { tentsListCanonicalVpdKpa } from "@/lib/tentsListVpdRules";

const NOW = new Date("2026-10-22T03:00:00.000Z");
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
const row = (metric: string, value: number, ts: string) => ({
  metric,
  value,
  ts,
  captured_at: ts,
  tent_id: "tent-1",
  source: "manual",
});
const RAW_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const STORED_OLD = row("vpd_kpa", 1.3, at(24));
const FIRST = [row("temperature_c", (80 - 32) / 1.8, at(2)), row("humidity_pct", 50, at(2))];
const SECOND = [row("temperature_c", (85 - 32) / 1.8, at(1)), row("humidity_pct", 45, at(1))];

function renderStrip(rows: ReturnType<typeof row>[]) {
  render(
    <TentEnvironmentSnapshotStrip
      tentId="tent-1"
      stage="flower"
      sensorRows={rows}
      sensorStatus="success"
      now={NOW.getTime()}
      temperatureUnit="fahrenheit"
      manualCards={[]}
      manualStatus="success"
    />,
  );
  return screen.getByTestId("tents-list-metric-tent-1-vpd");
}

function dashboardVpd(rows: ReturnType<typeof row>[]) {
  return buildTonightTentMetrics({
    rows,
    rowsRead: { status: "success" },
    snapshot: { status: "idle", snapshot: null },
    now: NOW,
  }).find((metric) => metric.key === "vpd");
}

afterEach(cleanup);

describe("Tents list VPD matches the Dashboard (#2268)", () => {
  it("shows 1.75 kPa for 80°F/50% instead of — or the stored 1.30", () => {
    const vpd = renderStrip([STORED_OLD, ...FIRST]);
    expect(vpd).toHaveTextContent("1.75");
    expect(vpd).not.toHaveTextContent("—");
    expect(vpd).not.toHaveTextContent("1.30");
  });

  it("then shows 2.26 kPa after a newer 85°F/45% reading", () => {
    const vpd = renderStrip([STORED_OLD, ...FIRST, ...SECOND]);
    expect(vpd).toHaveTextContent("2.26");
  });

  it("uses exactly the Dashboard Tonight value for both captures", () => {
    for (const rows of [
      [STORED_OLD, ...FIRST],
      [STORED_OLD, ...FIRST, ...SECOND],
    ]) {
      const tonight = dashboardVpd(rows);
      expect(tonight?.state).toBe("value");
      expect(tentsListCanonicalVpdKpa(rows, "tent-1", NOW.getTime())).toBe(tonight?.value);
    }
  });

  it("keeps a stored VPD that is the newest capture", () => {
    const vpd = renderStrip([...FIRST, row("vpd_kpa", 1.62, at(0.5))]);
    expect(vpd).toHaveTextContent("1.62");
  });

  it("prints no raw ISO timestamp anywhere in the strip", () => {
    renderStrip([STORED_OLD, ...FIRST, ...SECOND]);
    expect(screen.getByTestId("tents-list-sensor-last-updated-tent-1").textContent).not.toMatch(
      RAW_ISO,
    );
    expect(document.body.textContent).not.toMatch(RAW_ISO);
  });
});
