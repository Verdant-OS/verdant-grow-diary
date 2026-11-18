/**
 * Core-loop walk, 2026-11-18 (L5): one tent at 77°F / 55% RH showed 1.10 kPa on
 * the /tents list (a stored vpd_kpa reading) and 1.43 kPa on the Dashboard
 * (calculated from that temperature and RH). Matthew chose to show both on the
 * Tents list, each labelled with where it came from, rather than pick one.
 *
 * The stored VPD chip says "Stored reading"; the VPD calculated from the
 * temperature and RH on the same card sits beside it, labelled "Calculated
 * from temperature and RH". The calculated value appears only beside a stored
 * one, only from the card's own temperature and RH (one capture, one source),
 * never from missing or invalid inputs; stale inputs keep it stale and CSV
 * inputs keep it Historical.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TentEnvironmentSnapshotStrip from "@/components/TentEnvironmentSnapshotStrip";
import {
  buildTentSnapshotView,
  type MetricView,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import {
  TENTS_LIST_VPD_ORIGIN_COPY,
  tentsListCalculatedVpd,
  tentsListCanonicalVpd,
} from "@/lib/tentsListVpdRules";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

const NOW = Date.parse("2026-11-18T02:00:00.000Z");
const FRESH = "2026-11-18T01:50:00.000Z";
const OLD = "2026-11-15T01:50:00.000Z";
const TENT = "tent-1";
const F77_IN_C = (77 - 32) / 1.8; // 25 °C

interface RowExtra {
  quality?: string;
  source?: string;
  device_id?: string;
}

const row = (metric: string, value: number, ts = FRESH, extra: RowExtra = {}) => ({
  id: `${metric}-${ts}-${extra.device_id ?? "none"}`,
  metric,
  value,
  ts,
  captured_at: ts,
  tent_id: TENT,
  source: "manual",
  ...extra,
});

const WALK_ROWS = [row("temperature_c", F77_IN_C), row("humidity_pct", 55), row("vpd_kpa", 1.1)];

function viewFor(rows: ReturnType<typeof row>[]) {
  return buildTentSnapshotView(rows, "veg", NOW, {
    temperatureUnit: "fahrenheit",
    canonicalVpd: tentsListCanonicalVpd(rows, TENT, NOW),
  });
}

function vpdOf(rows: ReturnType<typeof row>[]) {
  return viewFor(rows).metrics.find((metric) => metric.key === "vpd");
}

afterEach(cleanup);

describe("VPD origin on the snapshot view", () => {
  it("marks the walk's 1.10 kPa as a stored reading", () => {
    const vpd = vpdOf(WALK_ROWS);
    expect(vpd?.display).toBe("1.10");
    expect(vpd?.origin).toBe("stored");
  });

  it("marks a VPD worked out from temperature and RH as calculated", () => {
    const rows = [row("temperature_c", F77_IN_C), row("humidity_pct", 55)];
    expect(tentsListCanonicalVpd(rows, TENT, NOW)).toMatchObject({ kpa: 1.43, calculated: true });
    const vpd = vpdOf(rows);
    expect(vpd?.display).toBe("1.43");
    expect(vpd?.origin).toBe("calculated");
  });

  it("gives no origin when no VPD number is shown", () => {
    const vpd = vpdOf([
      row("temperature_c", F77_IN_C),
      row("humidity_pct", 55, FRESH, { quality: "invalid" }),
      row("vpd_kpa", 1.1),
    ]);
    expect(vpd?.display).toBe("—");
    expect(vpd?.origin).toBeUndefined();
  });
});

describe("tentsListCalculatedVpd", () => {
  it("works out 1.43 kPa from 77°F / 55% beside the stored 1.10", () => {
    const calculated = tentsListCalculatedVpd(viewFor(WALK_ROWS), WALK_ROWS, "veg");
    expect(calculated).toMatchObject({
      kpa: 1.43,
      display: "1.43",
      unit: " kPa",
      status: "ok",
      statusLabel: null,
      label: TENTS_LIST_VPD_ORIGIN_COPY.calculated,
    });
  });

  it("adds nothing when the shown VPD is already calculated", () => {
    const rows = [row("temperature_c", F77_IN_C), row("humidity_pct", 55)];
    expect(tentsListCalculatedVpd(viewFor(rows), rows, "veg")).toBeNull();
  });

  it("adds nothing when the temperature is missing", () => {
    const rows = [row("humidity_pct", 55), row("vpd_kpa", 1.1)];
    expect(vpdOf(rows)?.origin).toBe("stored");
    expect(tentsListCalculatedVpd(viewFor(rows), rows, "veg")).toBeNull();
  });

  it("adds nothing when the RH is missing", () => {
    const rows = [row("temperature_c", F77_IN_C), row("vpd_kpa", 1.1)];
    expect(vpdOf(rows)?.origin).toBe("stored");
    expect(tentsListCalculatedVpd(viewFor(rows), rows, "veg")).toBeNull();
  });

  it("adds nothing when the stored VPD is missing and no VPD can be shown", () => {
    expect(tentsListCalculatedVpd(viewFor([]), [], "veg")).toBeNull();
  });

  it("keeps stale inputs stale, never healthy", () => {
    const rows = [
      row("temperature_c", F77_IN_C, OLD),
      row("humidity_pct", 55, OLD),
      row("vpd_kpa", 1.1, OLD),
    ];
    const calculated = tentsListCalculatedVpd(viewFor(rows), rows, "veg");
    expect(calculated).toMatchObject({ kpa: 1.43, status: "stale", statusLabel: "Stale" });
    expect(calculated?.chipStatus).not.toBe("ok");
  });

  it("calculates nothing from an invalid input", () => {
    const view = viewFor(WALK_ROWS);
    const metrics: MetricView[] = view.metrics.map((metric) =>
      metric.key === "rh" ? { ...metric, status: "invalid", statusLabel: "Invalid" } : metric,
    );
    expect(tentsListCalculatedVpd({ metrics }, WALK_ROWS, "veg")).toBeNull();
  });

  it("keeps CSV inputs Historical, never a healthy cue", () => {
    const csv = { source: "csv" };
    const rows = [
      row("temperature_c", F77_IN_C, FRESH, csv),
      row("humidity_pct", 65, FRESH, csv),
      row("vpd_kpa", 1.1, FRESH, csv),
    ];
    const calculated = tentsListCalculatedVpd(viewFor(rows), rows, "veg");
    expect(calculated).toMatchObject({
      kpa: 1.11,
      status: "degraded",
      statusLabel: "Historical",
    });
    expect(calculated?.chipStatus).not.toBe("ok");
  });

  it("calculates nothing from temperature and RH of two devices at one instant", () => {
    const deviceA = { source: "live", device_id: "A" };
    const deviceB = { source: "live", device_id: "B" };
    const rows = [
      row("temperature_c", F77_IN_C, FRESH, deviceA),
      row("humidity_pct", 55, FRESH, deviceB),
      row("vpd_kpa", 1.1, FRESH, deviceA),
      row("temperature_c", 22, FRESH, deviceB),
      row("humidity_pct", 70, FRESH, deviceA),
    ];
    expect(vpdOf(rows)?.origin).toBe("stored");
    expect(tentsListCalculatedVpd(viewFor(rows), rows, "veg")).toBeNull();
  });

  it("still calculates when one device reports both", () => {
    const deviceA = { source: "live", device_id: "A" };
    const rows = [
      row("temperature_c", F77_IN_C, FRESH, deviceA),
      row("humidity_pct", 55, FRESH, deviceA),
      row("vpd_kpa", 1.1, FRESH, deviceA),
    ];
    expect(tentsListCalculatedVpd(viewFor(rows), rows, "veg")).toMatchObject({ kpa: 1.43 });
  });

  it("calculates nothing from temperature and RH of different sources", () => {
    const rows = [
      row("temperature_c", F77_IN_C, FRESH, { source: "manual" }),
      row("humidity_pct", 55, FRESH, { source: "live" }),
      row("vpd_kpa", 1.1),
    ];
    expect(vpdOf(rows)?.origin).toBe("stored");
    expect(tentsListCalculatedVpd(viewFor(rows), rows, "veg")).toBeNull();
  });

  it("calculates nothing from RH pinned at 100%", () => {
    const rows = [row("temperature_c", F77_IN_C), row("humidity_pct", 100), row("vpd_kpa", 1.1)];
    const okMetrics: MetricView[] = viewFor(WALK_ROWS).metrics;
    expect(tentsListCalculatedVpd({ metrics: okMetrics }, rows, "veg")).toBeNull();
  });

  it("treats a zero temperature as a real value, not missing", () => {
    const rows = [row("temperature_c", 0), row("humidity_pct", 50), row("vpd_kpa", 0.3)];
    const okMetrics: MetricView[] = viewFor(WALK_ROWS).metrics.map((metric) =>
      metric.key === "vpd" ? { ...metric, origin: "stored" } : metric,
    );
    expect(tentsListCalculatedVpd({ metrics: okMetrics }, rows, "veg")).toMatchObject({
      kpa: 0.31,
      display: "0.31",
    });
  });
});

describe("Tents list strip", () => {
  function renderStrip(rows: ReturnType<typeof row>[]) {
    render(
      <TentEnvironmentSnapshotStrip
        tentId={TENT}
        tonightSnapshot={{ status: "idle", snapshot: EMPTY_SNAPSHOT }}
        stage="veg"
        sensorRows={rows}
        sensorStatus="success"
        now={NOW}
        temperatureUnit="fahrenheit"
        manualCards={[]}
        manualStatus="success"
      />,
    );
  }

  it("shows the stored 1.10 and the calculated 1.43, each labelled", () => {
    renderStrip(WALK_ROWS);
    const stored = screen.getByTestId(`tents-list-metric-${TENT}-vpd`);
    expect(stored.textContent).toContain("1.10");
    expect(screen.getByTestId(`tents-list-vpd-origin-${TENT}`).textContent).toBe(
      TENTS_LIST_VPD_ORIGIN_COPY.stored,
    );
    const calculated = screen.getByTestId(`tents-list-vpd-calculated-${TENT}`);
    expect(calculated.textContent).toContain("1.43");
    expect(calculated.textContent).toContain(TENTS_LIST_VPD_ORIGIN_COPY.calculated);
  });

  it("shows one calculated VPD, labelled, when nothing is stored", () => {
    renderStrip([row("temperature_c", F77_IN_C), row("humidity_pct", 55)]);
    expect(screen.getByTestId(`tents-list-metric-${TENT}-vpd`).textContent).toContain("1.43");
    expect(screen.getByTestId(`tents-list-vpd-origin-${TENT}`).textContent).toBe(
      TENTS_LIST_VPD_ORIGIN_COPY.calculated,
    );
    expect(screen.queryByTestId(`tents-list-vpd-calculated-${TENT}`)).toBeNull();
  });

  it("shows no calculated VPD when the RH is missing", () => {
    renderStrip([row("temperature_c", F77_IN_C), row("vpd_kpa", 1.1)]);
    expect(screen.getByTestId(`tents-list-vpd-origin-${TENT}`).textContent).toBe(
      TENTS_LIST_VPD_ORIGIN_COPY.stored,
    );
    expect(screen.queryByTestId(`tents-list-vpd-calculated-${TENT}`)).toBeNull();
  });
});
