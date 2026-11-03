/**
 * D2 follow-up (#2812 review): when the assigned tent changes, the What's Missing
 * panel must not render the previous tent's "present" result for the new tent,
 * not even for the first render before the new tent's read reports.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import type { PlantDetailWhatsMissingInput } from "@/lib/plantDetailWhatsMissing";

/** tentCurrentReadings passed to the rules on each render of the panel. */
const rulesCalls = vi.hoisted(() => [] as unknown[]);
const tentStatus = vi.hoisted(() => new Map<string, string>());

vi.mock("@/lib/plantDetailWhatsMissing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/plantDetailWhatsMissing")>();
  return {
    ...actual,
    buildPlantDetailWhatsMissing: (input: PlantDetailWhatsMissingInput) => {
      rulesCalls.push(input.tentCurrentReadings);
      return actual.buildPlantDetailWhatsMissing(input);
    },
  };
});
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => ({
    data: [
      {
        id: "n-1",
        plant_id: "p-1",
        entry_at: "2026-09-03T02:00:00.000Z",
        note: "Checked leaves.",
        details: { event_type: "observation" },
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useTentCurrentReadingsPresence", () => ({
  useTentCurrentReadingsPresence: (tentId: string) => tentStatus.get(tentId) ?? "unknown",
}));

import PlantDetailWhatsMissing from "@/components/PlantDetailWhatsMissing";

const TENT_A = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e77";
const TENT_B = "6b2d7f10-3c4e-4d6f-9a01-2b3c4d5e6f88";

function panel(tentId: string) {
  return (
    <MemoryRouter>
      <PlantDetailWhatsMissing
        plantId="p-1"
        growId="g-1"
        stage="veg"
        hasPlantPhoto
        tentId={tentId}
      />
    </MemoryRouter>
  );
}

describe("PlantDetailWhatsMissing tent switch", () => {
  beforeEach(() => {
    rulesCalls.length = 0;
    tentStatus.clear();
  });

  it("never renders the previous tent's readings for a newly assigned tent", () => {
    tentStatus.set(TENT_A, "present");
    tentStatus.set(TENT_B, "unknown");
    const { rerender } = render(panel(TENT_A));
    expect(screen.getByText("No plant snapshot")).toBeInTheDocument();

    rulesCalls.length = 0;
    rerender(panel(TENT_B));
    expect(rulesCalls.length).toBeGreaterThan(0);
    expect(rulesCalls.filter((value) => value === "present")).toEqual([]);
    expect(screen.getByText("No sensor snapshot")).toBeInTheDocument();
  });

  it("shows the new tent's readings once that tent reports present", () => {
    tentStatus.set(TENT_A, "absent");
    tentStatus.set(TENT_B, "present");
    const { rerender } = render(panel(TENT_A));
    expect(screen.getByText("No sensor snapshot")).toBeInTheDocument();
    rerender(panel(TENT_B));
    expect(screen.getByText("No plant snapshot")).toBeInTheDocument();
  });
});
