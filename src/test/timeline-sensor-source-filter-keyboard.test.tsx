/**
 * timeline-sensor-source-filter-keyboard — accessibility + URL-sync
 * tests for the Timeline source filter chips.
 *
 * Uses a minimal harness that mirrors the exact wiring in
 * src/pages/Timeline.tsx (state ↔ ?sensorSources= sync, aria-pressed
 * chips, Clear filters reset). This keeps the test fast while exercising
 * the same pure rules and URL helpers the page uses.
 *
 * Read-only. No DB / fetch / AI / Action Queue / alert / device writes.
 */
import { describe, it, expect } from "vitest";
import React, { useEffect, useMemo, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import {
  SENSOR_SOURCES_PARAM,
  encodeSensorSourcesParam,
  parseSensorSourcesParam,
  sensorSourcesEqual,
} from "@/lib/sensorSourceUrlRules";
import {
  SENSOR_SOURCE_KINDS,
  SENSOR_SOURCE_SHORT_LABEL,
} from "@/constants/sensorSourceLabels";
import {
  filterTimelineEvidenceRows,
  isTimelineEvidenceFilterActive,
} from "@/lib/timelineEvidenceFilterRules";
import type { TimelineSensorSourceKind } from "@/lib/timelineSensorSourceBadgeRules";
import SensorSourceLegendTooltip from "@/components/SensorSourceLegendTooltip";

const ROWS = [
  {
    id: "live-row",
    note: "live",
    stage: "veg",
    plant_id: "p1",
    tent_id: "t1",
    entry_at: new Date(Date.now() - 1000).toISOString(),
    details: {
      sensor_snapshot: { source: "live", ts: new Date(Date.now() - 1000).toISOString() },
    },
  },
  {
    id: "manual-row",
    note: "manual",
    stage: "veg",
    plant_id: "p1",
    tent_id: "t1",
    entry_at: "2026-06-10T12:00:00Z",
    details: { sensor_snapshot: { temp: 22 } },
  },
  {
    id: "csv-row",
    note: "csv",
    stage: "veg",
    plant_id: "p1",
    tent_id: "t1",
    entry_at: "2026-06-10T12:00:00Z",
    details: { sensor_snapshot: { source: "csv" } },
  },
  {
    id: "note-row",
    note: "note only",
    stage: "veg",
    plant_id: "p1",
    tent_id: "t1",
    entry_at: "2026-06-10T12:00:00Z",
    details: { event_type: "note" },
  },
];

function Harness() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sensorSourceFilter, setSensorSourceFilter] = useState<TimelineSensorSourceKind[]>(
    () => parseSensorSourcesParam(searchParams.get(SENSOR_SOURCES_PARAM)),
  );

  useEffect(() => {
    const next = parseSensorSourcesParam(searchParams.get(SENSOR_SOURCES_PARAM));
    setSensorSourceFilter((cur) => (sensorSourcesEqual(cur, next) ? cur : next));
  }, [searchParams]);

  useEffect(() => {
    const fromUrl = parseSensorSourcesParam(searchParams.get(SENSOR_SOURCES_PARAM));
    if (sensorSourcesEqual(fromUrl, sensorSourceFilter)) return;
    const next = new URLSearchParams(searchParams);
    const encoded = encodeSensorSourcesParam(sensorSourceFilter);
    if (encoded) next.set(SENSOR_SOURCES_PARAM, encoded);
    else next.delete(SENSOR_SOURCES_PARAM);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensorSourceFilter]);

  const filtered = useMemo(
    () =>
      filterTimelineEvidenceRows(ROWS, {
        sensorSources: sensorSourceFilter,
      }),
    [sensorSourceFilter],
  );
  const active = isTimelineEvidenceFilterActive({
    sensorSources: sensorSourceFilter,
  });

  function toggle(kind: TimelineSensorSourceKind) {
    setSensorSourceFilter((cur) =>
      cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind],
    );
  }

  return (
    <div>
      <div data-testid="timeline-sensor-source-filter">
        {SENSOR_SOURCE_KINDS.map((kind) => {
          const on = sensorSourceFilter.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggle(kind)}
              aria-pressed={on}
              data-testid={`timeline-sensor-source-toggle-${kind}`}
            >
              {SENSOR_SOURCE_SHORT_LABEL[kind]}
            </button>
          );
        })}
        <SensorSourceLegendTooltip testIdSuffix="timeline-filter" />
      </div>
      <button
        type="button"
        onClick={() => setSensorSourceFilter([])}
        disabled={!active}
        data-testid="timeline-clear-filters"
        aria-label="Clear timeline filters"
      >
        Clear filters
      </button>
      <ul data-testid="timeline-results">
        {filtered.map((r) => (
          <li key={r.id} data-testid={`row-${r.id}`}>
            {r.note}
          </li>
        ))}
      </ul>
      <span data-testid="timeline-url-sensor-sources">
        {searchParams.get(SENSOR_SOURCES_PARAM) ?? ""}
      </span>
    </div>
  );
}

function renderHarness(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Harness />
    </MemoryRouter>,
  );
}

describe("Timeline source filter — accessibility & URL sync", () => {
  it("chips are keyboard reachable and expose aria-pressed state", async () => {
    const user = userEvent.setup();
    renderHarness();
    const liveBtn = screen.getByTestId("timeline-sensor-source-toggle-live");
    expect(liveBtn).toHaveAttribute("aria-pressed", "false");
    await user.tab();
    // Tab order should land on the first chip first.
    expect(document.activeElement).toBe(liveBtn);
    await user.keyboard("[Enter]");
    expect(liveBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("toggling a chip with keyboard filters visible rows", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("timeline-sensor-source-toggle-csv"));
    expect(screen.getByTestId("row-csv-row")).toBeInTheDocument();
    expect(screen.queryByTestId("row-live-row")).toBeNull();
    expect(screen.queryByTestId("row-note-row")).toBeNull();
  });

  it("Clear filters is keyboard reachable and resets selected sources", async () => {
    const user = userEvent.setup();
    renderHarness("/?sensorSources=csv,manual");
    const clear = screen.getByTestId("timeline-clear-filters");
    expect(clear).not.toBeDisabled();
    clear.focus();
    await user.keyboard("[Enter]");
    expect(
      screen.getByTestId("timeline-sensor-source-toggle-csv"),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByTestId("timeline-url-sensor-sources").textContent,
    ).toBe("");
  });

  it("seeds filter state from the ?sensorSources= URL param", () => {
    renderHarness("/?sensorSources=manual");
    expect(
      screen.getByTestId("timeline-sensor-source-toggle-manual"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("row-manual-row")).toBeInTheDocument();
    expect(screen.queryByTestId("row-live-row")).toBeNull();
  });

  it("updates the URL param when chip is toggled", async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByTestId("timeline-sensor-source-toggle-live"));
    expect(
      screen.getByTestId("timeline-url-sensor-sources").textContent,
    ).toContain("live");
  });

  it("ignores unknown source tokens in URL without crashing", () => {
    renderHarness("/?sensorSources=live,foo,xss<script>");
    expect(
      screen.getByTestId("timeline-sensor-source-toggle-live"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTestId("timeline-url-sensor-sources").textContent,
    ).toContain("live");
  });

  it("legend is keyboard accessible and exposes all six definitions", async () => {
    const user = userEvent.setup();
    renderHarness();
    const summary = screen.getByTestId(
      "sensor-source-legend-timeline-filter-summary",
    );
    summary.focus();
    expect(document.activeElement).toBe(summary);
    await user.keyboard("[Enter]");
    for (const k of SENSOR_SOURCE_KINDS) {
      expect(
        screen.getByTestId(`sensor-source-legend-timeline-filter-row-${k}`),
      ).toBeInTheDocument();
    }
  });
});
