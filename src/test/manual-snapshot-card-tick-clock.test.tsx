/**
 * Codex review on #2114 (P2): ManualSnapshotTimelineCard derived
 * isCurrentWindow from the shared minute tick but let the quality evaluator
 * read Date.now() itself. Across the 24 h boundary the badge could say
 * "Needs review" (older than 24 h) inside a region labelled "Current". Both
 * now use the tick.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import type { ManualSnapshotTimelineCard as CardModel } from "@/lib/manualSensorSnapshotViewModel";

// The tick lags real time: by the tick the snapshot is one second inside the
// 24 h window, by Date.now() it is days outside it.
const TICK_MS = Date.parse("2026-10-14T12:00:00.000Z");
vi.mock("@/hooks/useNowTick", () => ({ useNowTick: () => TICK_MS }));

function card(capturedAt: string): CardModel {
  return {
    id: "card-1",
    title: "Manual sensor snapshot",
    capturedAt,
    sourceLabel: "Manual",
    source: "manual",
    tentId: "tent-1",
    plantId: null,
    isTentLevel: true,
    notes: null,
    readings: [
      { field: "air_temp_c", value: 25, unit: "°C", derived: false },
      { field: "humidity_pct", value: 55, unit: "%", derived: false },
    ],
    severity: "ok",
    warnings: [],
    errors: [],
  };
}

afterEach(() => cleanup());

describe("ManualSnapshotTimelineCard uses one clock for every freshness label", () => {
  it("a snapshot inside the window by the tick reads current in the badge and the region", () => {
    const capturedAt = new Date(TICK_MS - 24 * 3_600_000 + 1_000).toISOString();
    render(
      <MemoryRouter>
        <ManualSnapshotTimelineCard card={card(capturedAt)} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("region", { name: "Current snapshot quality" })).toBeInTheDocument();
    expect(screen.getByText("Usable current reading")).toBeInTheDocument();
    expect(screen.queryByText(/older than 24/i)).toBeNull();
  });
});
