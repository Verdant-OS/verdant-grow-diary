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

import {
  applySnapshotValidationSeverity,
  evaluateManualSensorSnapshotQuality,
} from "@/lib/manualSensorSnapshotQualityRules";

// Codex review on #2114 (P1): a fresh snapshot whose validator flagged a
// value the range check accepts (45°F → 7.2°C, warned as a likely unit
// mismatch) read "Usable current reading" beside its own warning.
describe("ManualSnapshotTimelineCard respects validation warnings and errors", () => {
  const fresh = () => new Date(TICK_MS - 5 * 60_000).toISOString();
  const WARNING = "Temperature 45°F looks like a Celsius value — check units.";

  function renderCard(model: CardModel) {
    return render(
      <MemoryRouter>
        <ManualSnapshotTimelineCard card={model} />
      </MemoryRouter>,
    );
  }

  it("a fresh snapshot with a validation warning needs review and is not labelled current", () => {
    renderCard({
      ...card(fresh()),
      readings: [{ field: "air_temp_c", value: 7.22, unit: "°C", derived: false }],
      severity: "warning",
      warnings: [WARNING],
    });
    expect(screen.queryByText("Usable current reading")).toBeNull();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Current snapshot quality" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "Recent snapshot quality, needs review" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Current reading —/)).toBeNull();
  });

  it("a fresh snapshot with a validation error is invalid", () => {
    renderCard({ ...card(fresh()), severity: "invalid", errors: ["Humidity outside 0–100%."] });
    expect(screen.getByText("Invalid reading")).toBeInTheDocument();
    expect(screen.queryByText("Usable current reading")).toBeNull();
    expect(screen.queryByRole("region", { name: "Current snapshot quality" })).toBeNull();
  });

  it("a fresh snapshot with no validation issues stays usable and current", () => {
    renderCard(card(fresh()));
    expect(screen.getByText("Usable current reading")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Current snapshot quality" })).toBeInTheDocument();
  });
});

describe("applySnapshotValidationSeverity", () => {
  const base = evaluateManualSensorSnapshotQuality(
    { source: "manual", captured_at: TICK_MS - 60_000, temperature_c: 24, humidity_pct: 55 },
    { nowMs: TICK_MS },
  );

  it("returns the evaluation unchanged when validation is clean", () => {
    expect(base.quality).toBe("usable");
    expect(
      applySnapshotValidationSeverity(base, { severity: "ok", warnings: [], errors: [] }),
    ).toBe(base);
  });

  it("downgrades usable to needs review on warnings and drops current-room support", () => {
    const r = applySnapshotValidationSeverity(base, {
      severity: "warning",
      warnings: ["w"],
      errors: [],
    });
    expect(r).toMatchObject({
      quality: "needs_review",
      summary: "Needs review",
      canSupportAiDoctorCurrentContext: false,
      canSupportActionSuggestionPreview: false,
    });
    expect(r.reasons[0]).toBe("w");
  });

  it("uses historical copy in historical mode and never upgrades a worse result", () => {
    expect(
      applySnapshotValidationSeverity(
        base,
        { severity: "warning", warnings: ["w"], errors: [] },
        "historical",
      ).summary,
    ).toBe("Historical reading needs review");
    const missing = evaluateManualSensorSnapshotQuality({ source: "manual" }, { nowMs: TICK_MS });
    expect(
      applySnapshotValidationSeverity(missing, { severity: "invalid", warnings: [], errors: ["e"] })
        .quality,
    ).toBe("missing");
  });
});
