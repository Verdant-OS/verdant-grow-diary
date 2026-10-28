/**
 * #2114 Codex P2: a fresh EC-only snapshot card must not read "Missing
 * current reading". Reservoir EC is a reading.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import type { ManualSnapshotTimelineCard as CardModel } from "@/lib/manualSensorSnapshotViewModel";

const TICK_MS = Date.parse("2026-10-19T12:00:00.000Z");
vi.mock("@/hooks/useNowTick", () => ({ useNowTick: () => TICK_MS }));

const ecOnly: CardModel = {
  id: "card-ec",
  title: "Manual sensor snapshot",
  capturedAt: new Date(TICK_MS - 10 * 60_000).toISOString(),
  sourceLabel: "Manual",
  source: "manual",
  tentId: "tent-1",
  plantId: "plant-1",
  isTentLevel: false,
  notes: null,
  readings: [{ field: "reservoir_ec_mscm", value: 1.4, unit: "mS/cm", derived: false }],
  severity: "ok",
  warnings: [],
  errors: [],
};

afterEach(() => cleanup());

describe("an EC-only manual snapshot card", () => {
  it("is a usable current reading, not a missing one", () => {
    render(
      <MemoryRouter>
        <ManualSnapshotTimelineCard card={ecOnly} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/missing current reading/i)).toBeNull();
    expect(screen.getByText("Usable current reading")).toBeInTheDocument();
  });
});
