/**
 * VER-299 regression: the Sensor source summary must separate provenance from
 * freshness and agree with the individual badges and the Dashboard.
 *
 * Before the fix, `/sensors` rendered the summary without a clock, so "Stale"
 * stayed 0 while the badges beside it read "MANUAL · STALE"; the rules file
 * could only ever downgrade live readings.
 */
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import SensorSourceSummaryWidget from "@/components/SensorSourceSummaryWidget";
import {
  classifySensorSourceSummaryFreshness,
  summarizeSensorSources,
} from "@/lib/sensorSourceSummaryRules";
import { resolveDashboardSensorBadgeStatus } from "@/lib/dashboardSensorEvidenceRules";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

describe("summarizeSensorSources freshness (VER-299)", () => {
  it("counts a 30-hour-old manual reading as manual provenance and stale freshness", () => {
    const r = summarizeSensorSources([{ source: "manual", captured_at: hoursAgo(30) }], {
      now: NOW,
    });
    expect(r.counts.manual).toBe(1);
    expect(r.counts.stale).toBe(1);
    expect(r.freshness).toEqual({ fresh: 0, stale: 1, unknown: 0 });
  });

  it("keeps a 23-hour-old manual reading fresh (24-hour manual window)", () => {
    const r = summarizeSensorSources([{ source: "manual", captured_at: hoursAgo(23) }], {
      now: NOW,
    });
    expect(r.counts.stale).toBe(0);
    expect(r.freshness).toEqual({ fresh: 1, stale: 0, unknown: 0 });
  });

  it("counts a 20-minute-old live reading as live provenance and stale freshness", () => {
    const r = summarizeSensorSources([{ source: "live", captured_at: minutesAgo(20) }], {
      now: NOW,
    });
    expect(r.counts.live).toBe(1);
    expect(r.counts.stale).toBe(1);
    expect(r.freshness).toEqual({ fresh: 0, stale: 1, unknown: 0 });
  });

  it("counts a five-minute-old live reading as fresh", () => {
    const r = summarizeSensorSources([{ source: "live", captured_at: minutesAgo(5) }], {
      now: NOW,
    });
    expect(r.counts.live).toBe(1);
    expect(r.counts.stale).toBe(0);
    expect(r.freshness).toEqual({ fresh: 1, stale: 0, unknown: 0 });
  });

  it("never counts a missing, unparseable, or future timestamp as fresh", () => {
    const r = summarizeSensorSources(
      [
        { source: "live", captured_at: null, ts: null },
        { source: "manual", captured_at: "not-a-date" },
        { source: "live", captured_at: minutesAgo(-30) },
      ],
      { now: NOW },
    );
    expect(r.total).toBe(3);
    expect(r.freshness.fresh).toBe(0);
    expect(r.freshness).toEqual({ fresh: 0, stale: 0, unknown: 3 });
    // Provenance is still reported honestly.
    expect(r.counts.live).toBe(2);
    expect(r.counts.manual).toBe(1);
  });

  it("counts a reading persisted as stale under stale, and invalid under unknown", () => {
    const r = summarizeSensorSources(
      [
        { source: "stale", captured_at: minutesAgo(1) },
        { source: "stale", captured_at: null, ts: null },
        { source: "invalid", captured_at: minutesAgo(1) },
        { source: null, captured_at: minutesAgo(1) },
      ],
      { now: NOW },
    );
    // Persisted-stale provenance stays visible in the Stale row even when its
    // timestamp is missing; its freshness is unknown, never fresh.
    expect(r.counts.stale).toBe(2);
    expect(r.counts.invalid).toBe(2);
    expect(r.freshness).toEqual({ fresh: 0, stale: 1, unknown: 3 });
  });

  it("freshness buckets always sum to the total", () => {
    const r = summarizeSensorSources(
      [
        { source: "live", captured_at: minutesAgo(5) },
        { source: "live", captured_at: minutesAgo(20) },
        { source: "manual", captured_at: hoursAgo(30) },
        { source: "csv", captured_at: minutesAgo(1) },
        { source: "demo", captured_at: minutesAgo(1) },
        { source: "invalid", captured_at: minutesAgo(1) },
      ],
      { now: NOW },
    );
    const { fresh, stale, unknown } = r.freshness;
    expect(fresh + stale + unknown).toBe(r.total);
    expect(r.freshness).toEqual({ fresh: 1, stale: 2, unknown: 3 });
  });

  it("is deterministic and does not read the real clock when now is injected", () => {
    const readings = [{ source: "manual", captured_at: hoursAgo(30) }];
    const a = summarizeSensorSources(readings, { now: NOW });
    const b = summarizeSensorSources(readings, { now: NOW });
    expect(a).toEqual(b);
    expect(summarizeSensorSources(readings, { now: NOW - 7 * 3_600_000 }).freshness.stale).toBe(0);
  });

  it("classifies each reading by the same rule the Dashboard badge uses", () => {
    const cases = [
      { source: "manual", captured_at: hoursAgo(30) },
      { source: "manual", captured_at: hoursAgo(1) },
      { source: "live", captured_at: minutesAgo(20) },
      { source: "live", captured_at: minutesAgo(5) },
      { source: "csv", captured_at: minutesAgo(1) },
      { source: "demo", captured_at: minutesAgo(1) },
      { source: "stale", captured_at: minutesAgo(1) },
      { source: "invalid", captured_at: minutesAgo(1) },
      { source: "live", captured_at: null, ts: null },
    ];
    for (const reading of cases) {
      const dashboard = resolveDashboardSensorBadgeStatus(reading, NOW);
      const expected =
        dashboard === "usable" ? "fresh" : dashboard === "stale" ? "stale" : "unknown";
      expect(classifySensorSourceSummaryFreshness(reading, NOW)).toBe(expected);
    }
  });
});

describe("persisted status and quality floors (Codex P2 on #2586 at b1cab8f9d)", () => {
  const recentLive = { source: "live", captured_at: minutesAgo(5) };

  it("keeps a recent live reading out of fresh when its canonical status is stale", () => {
    const r = summarizeSensorSources([{ ...recentLive, status: "stale" }], { now: NOW });
    expect(r.counts.live).toBe(1);
    expect(r.counts.stale).toBe(1);
    expect(r.freshness).toEqual({ fresh: 0, stale: 1, unknown: 0 });
  });

  it("treats a persisted quality of stale the same way", () => {
    expect(classifySensorSourceSummaryFreshness({ ...recentLive, quality: "stale" }, NOW)).toBe(
      "stale",
    );
  });

  it.each([
    ["status invalid", { status: "invalid" }],
    ["status needs_review", { status: "needs_review" }],
    ["status no_data", { status: "no_data" }],
    ["an unrecognised status", { status: "weird" }],
    ["quality invalid", { quality: "invalid" }],
    ["quality degraded", { quality: "degraded" }],
    ["an unrecognised non-ok quality", { quality: "suspect" }],
  ])("never counts a recent live reading as fresh with %s", (_label, downgrade) => {
    const r = summarizeSensorSources([{ ...recentLive, ...downgrade }], { now: NOW });
    expect(r.freshness).toEqual({ fresh: 0, stale: 0, unknown: 1 });
    expect(r.counts.stale).toBe(0);
  });

  it("leaves a usable status, an ok quality, or no flags to the clock", () => {
    for (const extra of [{ status: "usable" }, { quality: "ok" }, { quality: "" }, {}]) {
      expect(classifySensorSourceSummaryFreshness({ ...recentLive, ...extra }, NOW)).toBe("fresh");
    }
  });

  it("cannot promote a reading the clock already calls stale or unknown", () => {
    expect(
      classifySensorSourceSummaryFreshness(
        { source: "manual", captured_at: hoursAgo(30), status: "usable", quality: "ok" },
        NOW,
      ),
    ).toBe("stale");
    expect(
      classifySensorSourceSummaryFreshness(
        { source: "live", captured_at: null, ts: null, status: "usable" },
        NOW,
      ),
    ).toBe("unknown");
  });

  it("renders the Stale row as a non-linking aggregate even when its count is positive", () => {
    render(
      <SensorSourceSummaryWidget
        options={{ now: NOW }}
        readings={[
          { source: "manual", captured_at: hoursAgo(30) },
          { source: "live", captured_at: minutesAgo(5) },
        ]}
      />,
    );
    const staleRow = screen.getByTestId("sensor-source-summary-row-stale");
    expect(screen.getByTestId("sensor-source-summary-count-stale")).toHaveTextContent("1");
    expect(staleRow).toHaveAttribute("data-clickable", "false");
    expect(staleRow).toHaveAttribute("data-aggregate", "true");
    expect(staleRow).not.toHaveAttribute("aria-disabled");
    expect(staleRow.getAttribute("title")).toMatch(/not a Timeline source filter/i);
    expect(screen.queryByTestId("sensor-source-summary-link-stale")).toBeNull();
    // Provenance rows keep their Timeline links.
    expect(screen.getByTestId("sensor-source-summary-link-live")).toHaveAttribute(
      "href",
      expect.stringContaining("sensorSources=live"),
    );
  });
});

describe("invalid provenance is never fresh (Copilot on #2586 at 12f1e03fe)", () => {
  it.each(["mqtt", "home_assistant", "ecowitt", "quick_log", "manual_snapshot", "totally-unknown"])(
    "counts a recent snapshot with raw source %s as Invalid provenance and unknown freshness",
    (rawSource) => {
      const r = summarizeSensorSources([{ source: rawSource, captured_at: minutesAgo(1) }], {
        now: NOW,
        fallback: "invalid",
      });
      expect(r.counts.invalid).toBe(1);
      expect(r.counts.live).toBe(0);
      expect(r.counts.manual).toBe(0);
      expect(r.freshness).toEqual({ fresh: 0, stale: 0, unknown: 1 });
    },
  );

  it("still lets canonical live and manual sources through the clock rule", () => {
    expect(
      classifySensorSourceSummaryFreshness({ source: "live", captured_at: minutesAgo(1) }, NOW),
    ).toBe("fresh");
    expect(
      classifySensorSourceSummaryFreshness({ source: "manual", captured_at: hoursAgo(1) }, NOW),
    ).toBe("fresh");
  });
});

describe("SensorSourceSummaryWidget freshness line (VER-299)", () => {
  it("shows Stale > 0 for a stale manual reading instead of Stale 0", () => {
    render(
      <SensorSourceSummaryWidget
        options={{ now: NOW }}
        readings={[
          { source: "manual", captured_at: hoursAgo(30) },
          { source: "manual", captured_at: hoursAgo(1) },
          { source: "live", captured_at: minutesAgo(20) },
          { source: "live", captured_at: minutesAgo(5) },
        ]}
      />,
    );
    expect(screen.getByTestId("sensor-source-summary-count-manual")).toHaveTextContent("2");
    expect(screen.getByTestId("sensor-source-summary-count-live")).toHaveTextContent("2");
    expect(screen.getByTestId("sensor-source-summary-count-stale")).toHaveTextContent("2");
    expect(screen.getByTestId("sensor-source-summary-freshness-count-fresh")).toHaveTextContent(
      "2",
    );
    expect(screen.getByTestId("sensor-source-summary-freshness-count-stale")).toHaveTextContent(
      "2",
    );
    expect(screen.getByTestId("sensor-source-summary-freshness-count-unknown")).toHaveTextContent(
      "0",
    );
    expect(screen.getByTestId("sensor-source-summary-freshness")).toHaveTextContent(
      "Fresh 2 · Stale 2 · Unknown 0",
    );
  });

  it("hides the freshness line in the empty state", () => {
    render(<SensorSourceSummaryWidget readings={[]} options={{ now: NOW }} />);
    expect(screen.queryByTestId("sensor-source-summary-freshness")).not.toBeInTheDocument();
  });
});
