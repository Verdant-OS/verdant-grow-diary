/**
 * Core-loop walk, 2026-11-19: on the live /tents list one tent's stored VPD
 * read "Stale · Manual reading · 13d ago" while another's read only "Stale".
 * The first came from another capture, which names its own source and age; the
 * second was the latest cohort's own stored reading, which named only its
 * status word. Every stored VPD on the Tents list now names its source and age
 * the same way. A stale or flagged reading never names Live, and an unverified
 * cohort names no source.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TentEnvironmentSnapshotStrip from "@/components/TentEnvironmentSnapshotStrip";
import { buildTentSnapshotView } from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { tentsListCanonicalVpd, tentsListStoredVpdStatusLabel } from "@/lib/tentsListVpdRules";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

const NOW = Date.parse("2026-11-19T09:00:00.000Z");
const TEN_MIN_AGO = "2026-11-19T08:50:00.000Z";
const THREE_HOURS_AGO = "2026-11-19T06:00:00.000Z";
const TWENTY_FOUR_DAYS_AGO = "2026-10-26T09:00:00.000Z";
const TENT = "tent-1";
const F77_IN_C = (77 - 32) / 1.8;

const row = (metric: string, value: number, ts: string, source = "manual") => ({
  id: `${metric}-${ts}`,
  metric,
  value,
  ts,
  captured_at: ts,
  tent_id: TENT,
  source,
});

const pair = (ts: string, source = "manual") => [
  row("temperature_c", F77_IN_C, ts, source),
  row("humidity_pct", 55, ts, source),
  row("vpd_kpa", 1.1, ts, source),
];

function viewFor(rows: ReturnType<typeof row>[]) {
  return buildTentSnapshotView(rows, "veg", NOW, {
    temperatureUnit: "fahrenheit",
    canonicalVpd: tentsListCanonicalVpd(rows, TENT, NOW),
  });
}

function labelFor(rows: ReturnType<typeof row>[]) {
  const view = viewFor(rows);
  const vpd = view.metrics.find((metric) => metric.key === "vpd");
  return tentsListStoredVpdStatusLabel(view, vpd, NOW);
}

afterEach(cleanup);

describe("tentsListStoredVpdStatusLabel", () => {
  it("names a stale manual cohort's source and age (the QA-BlueDream tent)", () => {
    expect(labelFor(pair(TWENTY_FOUR_DAYS_AGO))).toBe("Stale · Manual reading · 24d ago");
  });

  it("names a fresh manual cohort's source and age", () => {
    expect(labelFor(pair(TEN_MIN_AGO))).toBe("Manual reading · 10m ago");
  });

  it("never names Live beside a stale live cohort", () => {
    const label = tentsListStoredVpdStatusLabel(
      { cohortVpdProvenance: "live", lastUpdatedIso: THREE_HOURS_AGO },
      { status: "stale", statusLabel: "Stale" },
      NOW,
    );
    expect(label).toBe("Stale · 3h ago");
    // End to end, an aged live VPD reaches the list as Tonight's stale reading.
    expect(labelFor(pair(THREE_HOURS_AGO, "live"))).not.toMatch(/live/i);
  });

  it("names Live only beside an ok status", () => {
    expect(
      tentsListStoredVpdStatusLabel(
        { cohortVpdProvenance: "live", lastUpdatedIso: TEN_MIN_AGO },
        { status: "ok", statusLabel: null },
        NOW,
      ),
    ).toBe("Live sensor · 10m ago");
    expect(
      tentsListStoredVpdStatusLabel(
        { cohortVpdProvenance: "live", lastUpdatedIso: TEN_MIN_AGO },
        { status: "invalid", statusLabel: "Invalid" },
        NOW,
      ),
    ).toBe("Invalid · 10m ago");
  });

  it("names no source for an unverified cohort", () => {
    expect(
      tentsListStoredVpdStatusLabel(
        { cohortVpdProvenance: "unverified", lastUpdatedIso: TWENTY_FOUR_DAYS_AGO },
        { status: "stale", statusLabel: "Stale" },
        NOW,
      ),
    ).toBe("Stale · 24d ago");
  });

  it("leaves any other VPD's status label as it was", () => {
    const metric = { status: "stale" as const, statusLabel: "Stale · Manual reading · 13d ago" };
    expect(tentsListStoredVpdStatusLabel({ lastUpdatedIso: TEN_MIN_AGO }, metric, NOW)).toBe(
      metric.statusLabel,
    );
    expect(
      tentsListStoredVpdStatusLabel(
        { cohortVpdProvenance: "manual", lastUpdatedIso: TEN_MIN_AGO },
        { status: "unknown", statusLabel: "Unknown" },
        NOW,
      ),
    ).toBe("Unknown");
    expect(
      tentsListStoredVpdStatusLabel(
        { cohortVpdProvenance: "manual", lastUpdatedIso: null },
        undefined,
        NOW,
      ),
    ).toBeNull();
  });

  it("omits the age when the capture time is unknown", () => {
    expect(
      tentsListStoredVpdStatusLabel(
        { cohortVpdProvenance: "manual", lastUpdatedIso: null },
        { status: "degraded", statusLabel: "Needs verification" },
        NOW,
      ),
    ).toBe("Needs verification · Manual reading");
  });
});

describe("cohortVpdProvenance on the snapshot view", () => {
  it("is set when the shown VPD is the cohort's own stored reading", () => {
    expect(viewFor(pair(TWENTY_FOUR_DAYS_AGO)).cohortVpdProvenance).toBe("manual");
  });

  it("is absent when the VPD is calculated, not stored", () => {
    const rows = [
      row("temperature_c", F77_IN_C, TEN_MIN_AGO),
      row("humidity_pct", 55, TEN_MIN_AGO),
    ];
    expect(viewFor(rows).cohortVpdProvenance).toBeUndefined();
  });

  it("is absent when the VPD comes from another capture", () => {
    // Newest capture: a live CO2 row only. The VPD comes from an older manual pair.
    const rows = [...pair(THREE_HOURS_AGO), row("co2_ppm", 800, TEN_MIN_AGO, "live")];
    const view = viewFor(rows);
    expect(view.metrics.find((metric) => metric.key === "vpd")?.display).toBe("1.10");
    expect(view.cohortVpdProvenance).toBeUndefined();
  });
});

describe("Tents list strip", () => {
  it("captions the cohort's stored VPD with its source and age", () => {
    render(
      <TentEnvironmentSnapshotStrip
        tentId={TENT}
        tonightSnapshot={{ status: "idle", snapshot: EMPTY_SNAPSHOT }}
        stage="veg"
        sensorRows={pair(TWENTY_FOUR_DAYS_AGO)}
        sensorStatus="success"
        now={NOW}
        temperatureUnit="fahrenheit"
        manualCards={[]}
        manualStatus="success"
      />,
    );
    expect(screen.getByTestId(`tents-list-metric-status-${TENT}-vpd`).textContent).toBe(
      "Stale · Manual reading · 24d ago",
    );
    // Temperature and RH keep their own status word.
    expect(screen.getByTestId(`tents-list-metric-status-${TENT}-temp`).textContent).toBe("Stale");
  });
});
