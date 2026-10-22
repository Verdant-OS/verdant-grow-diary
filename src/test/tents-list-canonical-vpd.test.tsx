/**
 * #2268 (QA on production ebaf1b6a, 2/2): after manual readings of 80°F/50% RH
 * then 85°F/45% RH, the Dashboard showed 1.75 then 2.26 kPa while the /tents
 * list showed "— kPa". The list now reads the same VPD the Dashboard's Tonight
 * card derives (VER-189), via tentsListCanonicalVpd, from the same stored rows
 * and the same diary-inclusive snapshot (Codex P2 on #2303). A VPD from another
 * capture keeps its own source and age (Codex P1 on #2303).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

const hook = vi.hoisted(() => ({
  state: { status: "idle", snapshot: null as unknown } as { status: string; snapshot: unknown },
  calls: [] as { growId: unknown; tentIds: unknown }[],
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: (growId: unknown, tentIds: unknown) => {
    hook.calls.push({ growId, tentIds });
    return hook.state;
  },
}));

import TentEnvironmentSnapshotStrip from "@/components/TentEnvironmentSnapshotStrip";
import { buildTonightTentMetrics } from "@/lib/tonightTentHomeViewModel";
import { tentsListCanonicalVpd, tentsListDiarySnapshotRows } from "@/lib/tentsListVpdRules";
import { classifySnapshotTimestamp } from "@/lib/sensorTruthRules";

const NOW = new Date("2026-10-22T03:00:00.000Z");
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
const row = (metric: string, value: number, ts: string, source = "manual") => ({
  metric,
  value,
  ts,
  captured_at: ts,
  tent_id: "tent-1",
  source,
});
const RAW_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const STORED_OLD = row("vpd_kpa", 1.3, at(24));
const FIRST = [row("temperature_c", (80 - 32) / 1.8, at(2)), row("humidity_pct", 50, at(2))];
const SECOND = [row("temperature_c", (85 - 32) / 1.8, at(1)), row("humidity_pct", 45, at(1))];

function renderStrip(rows: ReturnType<typeof row>[]) {
  render(
    <TentEnvironmentSnapshotStrip
      tentId="tent-1"
      growId="grow-1"
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

function renderEmptyStrip() {
  render(
    <TentEnvironmentSnapshotStrip
      tentId="tent-1"
      growId="grow-1"
      stage="flower"
      sensorRows={[]}
      sensorStatus="success"
      now={NOW.getTime()}
      temperatureUnit="fahrenheit"
      manualCards={[]}
      manualStatus="success"
    />,
  );
}

function dashboardVpd(
  rows: ReturnType<typeof row>[],
  snapshot: { status: "idle" | "ok"; snapshot: SensorSnapshot | null } = {
    status: "idle",
    snapshot: null,
  },
) {
  return buildTonightTentMetrics({
    rows,
    rowsRead: { status: "success" },
    snapshot,
    now: NOW,
  }).find((metric) => metric.key === "vpd");
}

beforeEach(() => {
  hook.state = { status: "idle", snapshot: EMPTY_SNAPSHOT };
  hook.calls = [];
});
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
      expect(tentsListCanonicalVpd(rows, "tent-1", NOW.getTime())?.kpa).toBe(tonight?.value);
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

  it("reads the Dashboard's tent-scoped diary-inclusive snapshot", () => {
    renderStrip([STORED_OLD, ...FIRST]);
    expect(hook.calls.at(-1)).toEqual({ growId: "grow-1", tentIds: ["tent-1"] });
  });

  it("uses a newer Quick Log diary capture, as the Dashboard does (Codex P2)", () => {
    // Stored rows: a stale live pair three hours old. Diary: 80°F/50% half an hour ago.
    const stored = [
      row("temperature_c", 24, at(3), "live"),
      row("humidity_pct", 60, at(3), "live"),
    ];
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts: at(0.5),
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    hook.state = { status: "ok", snapshot: diary };
    const tonight = dashboardVpd(stored, { status: "ok", snapshot: diary });
    expect(tonight?.value).toBeCloseTo(1.75, 2);
    const vpd = renderStrip(stored);
    expect(vpd).toHaveTextContent("1.75");
    // Its own capture, labelled as such: manual, half an hour old, not the stale live pair's.
    expect(vpd).toHaveAttribute("data-status", "ok");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(/Manual/);
  });

  it("never grades an older manual VPD with a newer live capture's freshness (Codex P1)", () => {
    // Newest capture: fresh live CO2 only. The VPD comes from a manual pair 3 hours earlier.
    const rows = [
      ...FIRST.map((r) => ({ ...r, ts: at(3), captured_at: at(3) })),
      row("co2_ppm", 800, at(0.05), "live"),
    ];
    const vpd = renderStrip(rows);
    expect(vpd).toHaveTextContent("1.75");
    const label = screen.getByTestId("tents-list-metric-status-tent-1-vpd").textContent ?? "";
    expect(label).toMatch(/Manual/);
    expect(label).toMatch(/3h/);
    expect(label).not.toMatch(/Live/i);
  });

  it("marks an older live VPD stale even beside a fresh live capture (Codex P1)", () => {
    const rows = [
      row("temperature_c", (80 - 32) / 1.8, at(2), "live"),
      row("humidity_pct", 50, at(2), "live"),
      row("co2_ppm", 800, at(0.05), "live"),
    ];
    const vpd = renderStrip(rows);
    expect(vpd).toHaveAttribute("data-status", "stale");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(/Stale/);
  });

  it("marks an older out-of-range manual VPD invalid, never current (Codex P1 at 69de43db)", () => {
    // Newest capture: fresh live CO2 only. The stored VPD an hour earlier is 4.0 kPa,
    // outside the shared realistic range (0.2–3.0), so it must read Invalid.
    const rows = [row("vpd_kpa", 4.0, at(1)), row("co2_ppm", 800, at(0.05), "live")];
    expect(dashboardVpd(rows)?.value).toBe(4.0);
    const vpd = renderStrip(rows);
    expect(vpd).toHaveAttribute("data-status", "invalid");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(/Invalid/);
  });

  it("shows the Dashboard's diary-only VPD when the tent has no stored rows (Codex P2 at 69de43db)", () => {
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts: at(0.5),
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    hook.state = { status: "ok", snapshot: diary };
    expect(dashboardVpd([], { status: "ok", snapshot: diary })?.value).toBeCloseTo(1.75, 2);
    const vpd = renderStrip([]);
    expect(vpd).toHaveTextContent("1.75");
    expect(vpd).toHaveAttribute("data-status", "ok");
    // Same capture as the strip's cohort, so the strip's source badge grades it: manual.
    expect(screen.getByTestId("tents-list-sensor-source-tent-1")).toHaveTextContent(/Manual/);
    expect(screen.queryByTestId("tents-list-sensor-empty-tent-1")).toBeNull();
  });

  it("marks a diary-only direct VPD outside the shared range invalid (Codex P1 at 85ec1e78)", () => {
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts: at(0.5),
      temp: (80 - 32) / 1.8,
      rh: 50,
      vpd: 4.0,
      tent_id: "tent-1",
    };
    hook.state = { status: "ok", snapshot: diary };
    expect(dashboardVpd([], { status: "ok", snapshot: diary })?.value).toBe(4.0);
    const vpd = renderStrip([]);
    expect(vpd).toHaveAttribute("data-status", "invalid");
    expect(screen.getByTestId("tents-list-metric-status-tent-1-vpd")).toHaveTextContent(/Invalid/);
  });

  it("shows nothing for a diary capture stamped in the future (Codex P1 at 85ec1e78)", () => {
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts: at(-2),
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    hook.state = { status: "ok", snapshot: diary };
    expect(dashboardVpd([], { status: "ok", snapshot: diary })?.state).not.toBe("value");
    expect(
      tentsListDiarySnapshotRows({ status: "ok", snapshot: diary }, "tent-1", NOW.getTime()),
    ).toEqual([]);
    renderEmptyStrip();
    expect(screen.getByTestId("tents-list-sensor-empty-tent-1")).toHaveTextContent(
      "No sensor data yet",
    );
  });

  it("uses Tonight's one-minute future skew, not the five-minute classifier (Codex P1 at 0c19a9e0)", () => {
    const ts = new Date(NOW.getTime() + 2 * 60_000).toISOString();
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts,
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    // The shared classifier still accepts a capture two minutes ahead...
    expect(classifySnapshotTimestamp(ts, NOW.getTime())).toBe("ok");
    // ...and the Dashboard withholds it, so the list must too.
    expect(dashboardVpd([], { status: "ok", snapshot: diary })?.state).not.toBe("value");
    expect(
      tentsListDiarySnapshotRows({ status: "ok", snapshot: diary }, "tent-1", NOW.getTime()),
    ).toEqual([]);
    hook.state = { status: "ok", snapshot: diary };
    renderEmptyStrip();
    expect(screen.getByTestId("tents-list-sensor-empty-tent-1")).toHaveTextContent(
      "No sensor data yet",
    );
  });

  it("still shows a diary capture within Tonight's skew", () => {
    const ts = new Date(NOW.getTime() + 30_000).toISOString();
    const diary: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "diary",
      ts,
      temp: (80 - 32) / 1.8,
      rh: 50,
      tent_id: "tent-1",
    };
    expect(dashboardVpd([], { status: "ok", snapshot: diary })?.state).toBe("value");
    expect(
      tentsListDiarySnapshotRows({ status: "ok", snapshot: diary }, "tent-1", NOW.getTime()),
    ).toHaveLength(2);
  });

  it.each([
    ["loading", "tents-list-sensor-loading-tent-1", /Loading sensor data/],
    ["unavailable", "tents-list-sensor-unavailable-tent-1", /Sensor data unavailable/],
  ] as const)(
    "keeps the %s state visible instead of claiming no sensor data (Codex P2 at 85ec1e78)",
    (status, testId, copy) => {
      hook.state = { status, snapshot: EMPTY_SNAPSHOT };
      renderEmptyStrip();
      expect(screen.getByTestId(testId)).toHaveTextContent(copy);
      expect(screen.queryByTestId("tents-list-sensor-empty-tent-1")).toBeNull();
    },
  );

  it("still says no sensor data when there are no rows and no diary capture", () => {
    render(
      <TentEnvironmentSnapshotStrip
        tentId="tent-1"
        growId="grow-1"
        stage="flower"
        sensorRows={[]}
        sensorStatus="success"
        now={NOW.getTime()}
        temperatureUnit="fahrenheit"
        manualCards={[]}
        manualStatus="success"
      />,
    );
    expect(screen.getByTestId("tents-list-sensor-empty-tent-1")).toHaveTextContent(
      "No sensor data yet",
    );
  });

  it.each(["invalid", "stale", "degraded"])(
    "calculates no VPD from a temperature flagged %s",
    (quality) => {
      const vpd = renderStrip([{ ...FIRST[0], quality }, FIRST[1]] as ReturnType<typeof row>[]);
      expect(vpd).toHaveAttribute("data-status", "unknown");
      expect(vpd).not.toHaveTextContent("1.75");
    },
  );
});
