/**
 * Review on #2802 at 951535b7: same-instant timestamps group by epoch,
 * the tent header does not keep an older VPD when Tonight says not_computed,
 * and the card renders that state for the #2800 rows.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import TonightTentHomeCard from "@/components/TonightTentHomeCard";
import { snapshotFromReadings } from "@/lib/sensorSnapshot";
import { resolveTentDetailVpd } from "@/lib/tentDetailVpdRules";
import { tentsListCanonicalVpd } from "@/lib/tentsListVpdRules";
import {
  buildTonightTentMetrics,
  TONIGHT_TENT_HOME_COPY,
  type TonightSensorRow,
  type TonightTentSelection,
} from "@/lib/tonightTentHomeViewModel";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const TENT = "tent-a";
const fToC = (fahrenheit: number) => ((fahrenheit - 32) * 5) / 9;

function reading(metric: string, value: number, ts: string): TonightSensorRow & { value: number } {
  return {
    id: `${metric}-${ts}`,
    tent_id: TENT,
    metric,
    value,
    source: "manual",
    quality: "ok",
    ts,
    captured_at: ts,
    raw_payload: null,
  };
}

describe("snapshotFromReadings — instant, not timestamp string", () => {
  it("treats Z and +00:00 for the same instant as one capture and keeps both climate metrics", () => {
    const snap = snapshotFromReadings([
      reading("temperature_c", fToC(75), "2026-11-03T12:00:00.000Z"),
      reading("humidity_pct", 55, "2026-11-03T12:00:00+00:00"),
    ]);
    expect(snap?.temp).toBeCloseTo(fToC(75), 5);
    expect(snap?.rh).toBe(55);
    const metrics = buildTonightTentMetrics({
      rows: [
        reading("temperature_c", fToC(75), "2026-11-03T12:00:00.000Z"),
        reading("humidity_pct", 55, "2026-11-03T12:00:00+00:00"),
      ],
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: NOW,
    });
    expect(metrics.find((metric) => metric.key === "vpd")).toMatchObject({
      state: "value",
      calculated: true,
    });
  });

  it("ranks an older capture older even when its timestamp string is lexically larger", () => {
    const olderLexical = "2026-11-03T12:00:00+00:00";
    const newerLexical = "2026-11-03T08:00:00-05:00";
    expect(olderLexical > newerLexical).toBe(true);
    expect(Date.parse(newerLexical)).toBeGreaterThan(Date.parse(olderLexical));
    const snap = snapshotFromReadings([
      reading("temperature_c", fToC(70), olderLexical),
      reading("humidity_pct", 50, olderLexical),
      reading("temperature_c", fToC(80), newerLexical),
      reading("humidity_pct", 60, newerLexical),
    ]);
    expect(snap?.temp).toBeCloseTo(fToC(80), 5);
    expect(snap?.rh).toBe(60);
    expect(typeof snap?.ts).toBe("string");
    expect(Date.parse(snap?.ts ?? "")).toBe(Date.parse(newerLexical));
  });
});

describe("tent detail header honors not_computed (#2800 rows)", () => {
  const older = new Date(NOW.getTime() - 4 * 60_000).toISOString();
  const newer = NOW.toISOString();
  const rows = [
    reading("temperature_c", fToC(40), older),
    reading("humidity_pct", 60, older),
    reading("temperature_c", fToC(80), newer),
  ];

  it("does not keep the previous manual VPD when the newest temperature has no RH", () => {
    const tonight = buildTonightTentMetrics({
      rows,
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: NOW,
    }).find((metric) => metric.key === "vpd");
    expect(tonight?.state).toBe("not_computed");
    const observation = resolveTentDetailVpd({
      tonight,
      existing: {
        value: 0.34,
        capturedAt: older,
        source: "manual",
        stale: false,
      },
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: null,
      captureClimate: [],
      nowMs: NOW.getTime(),
    });
    expect(observation.value).toBeNull();
    expect(observation.rejected).toBeUndefined();
    expect(observation.source).toBeNull();
  });
});

describe("tents list — newer temp-only row", () => {
  it("does not keep the older pair's VPD when the newest row is temperature only", () => {
    const older = new Date(NOW.getTime() - 4 * 60_000).toISOString();
    const newer = NOW.toISOString();
    const canonical = tentsListCanonicalVpd(
      [
        {
          metric: "temperature_c",
          value: fToC(40),
          ts: older,
          captured_at: older,
          tent_id: TENT,
          source: "manual",
        },
        {
          metric: "humidity_pct",
          value: 60,
          ts: older,
          captured_at: older,
          tent_id: TENT,
          source: "manual",
        },
        {
          metric: "vpd_kpa",
          value: 0.34,
          ts: older,
          captured_at: older,
          tent_id: TENT,
          source: "manual",
        },
        {
          metric: "temperature_c",
          value: fToC(80),
          ts: newer,
          captured_at: newer,
          tent_id: TENT,
          source: "manual",
        },
      ],
      TENT,
      NOW.getTime(),
    );
    expect(canonical).toMatchObject({ kpa: null, missing: true });
  });
});

describe("TonightTentHomeCard — split capture", () => {
  const selection: TonightTentSelection = {
    kind: "tent",
    basis: "only",
    tent: { id: TENT, name: "Veg Tent", growId: "g1" },
  };

  it("shows VPD as not computed after 40°F/60% then 80°F with no RH, and marks the older RH", () => {
    const older = new Date(NOW.getTime() - 4 * 60_000).toISOString();
    const newer = NOW.toISOString();
    const metrics = buildTonightTentMetrics({
      rows: [
        reading("temperature_c", fToC(40), older),
        reading("humidity_pct", 60, older),
        reading("temperature_c", fToC(80), newer),
      ],
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: NOW,
    });
    render(
      <MemoryRouter>
        <TonightTentHomeCard
          selection={selection}
          metrics={metrics}
          lastLog={{ kind: "none_today", text: "No log today" }}
          logHref="/daily-check?growId=g1"
        />
      </MemoryRouter>,
    );
    const vpd = screen.getByTestId("tonight-tent-home-metric-vpd");
    expect(vpd).toHaveAttribute("data-state", "not_computed");
    expect(vpd).toHaveTextContent(TONIGHT_TENT_HOME_COPY.vpdNotComputed);
    expect(vpd).toHaveTextContent(TONIGHT_TENT_HOME_COPY.vpdNotComputedLabel);
    expect(screen.getByTestId("tonight-tent-home-metric-rh-older")).toHaveTextContent(
      TONIGHT_TENT_HOME_COPY.olderReading,
    );
  });

  it("uses the same not-computed mark when a split capture's VPD is unavailable", () => {
    const older = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    const newer = NOW.toISOString();
    const metrics = buildTonightTentMetrics({
      rows: [
        { ...reading("temperature_c", 24, older), source: "live" },
        { ...reading("humidity_pct", 55, newer), source: "manual" },
      ],
      rowsRead: { status: "success" },
      snapshot: { status: "idle", snapshot: null },
      now: NOW,
    });
    expect(metrics.find((metric) => metric.key === "vpd")?.state).toBe("unavailable");
    render(
      <MemoryRouter>
        <TonightTentHomeCard
          selection={selection}
          metrics={metrics}
          lastLog={{ kind: "none_today", text: "No log today" }}
          logHref="/daily-check?growId=g1"
        />
      </MemoryRouter>,
    );
    const vpd = screen.getByTestId("tonight-tent-home-metric-vpd");
    expect(vpd).toHaveTextContent(TONIGHT_TENT_HOME_COPY.vpdNotComputed);
    expect(vpd).not.toHaveTextContent(TONIGHT_TENT_HOME_COPY.unavailable);
  });
});
