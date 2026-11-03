/**
 * Regressions for #2790, #2784, and #2786.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArchivedPlantsToggle } from "@/components/ArchivedPlantsToggle";
import {
  filterVisiblePlants,
  isActivePlant,
  withGrowArchiveVisibility,
} from "@/lib/archivedPlantVisibilityRules";
import { PlantLifecycleWriteRules } from "@/lib/plantLifecycleWriteRules";
import {
  evaluateTentDeleteGuard,
  resolveVerifiedAssignedPlantCount,
} from "@/lib/tentManagementRules";

describe("#2786 plants in an archived grow", () => {
  const plant = {
    id: "plant-a",
    name: "Plant A",
    isArchived: false,
    growId: "grow-archived",
  };

  it("hides a plant in an archived grow until the archived toggle is on", () => {
    const [marked] = withGrowArchiveVisibility([plant], new Set(["grow-archived"]));
    expect(isActivePlant(marked)).toBe(false);
    expect(filterVisiblePlants([marked], { showArchived: false })).toEqual([]);
    expect(filterVisiblePlants([marked], { showArchived: true })).toEqual([marked]);
  });

  it("flips the show-archived toggle", async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    const view = render(<ArchivedPlantsToggle pressed={false} onPressedChange={onPressedChange} />);
    await user.click(screen.getByTestId("tent-detail-show-archived-toggle"));
    expect(onPressedChange).toHaveBeenCalledWith(true);
    view.rerender(<ArchivedPlantsToggle pressed={true} onPressedChange={onPressedChange} />);
    expect(screen.getByTestId("tent-detail-show-archived-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByTestId("tent-detail-show-archived-toggle"));
    expect(onPressedChange).toHaveBeenLastCalledWith(false);
  });
});

describe("#2784 archived plants do not block tent delete", () => {
  it("allows delete when every assigned plant is archived", () => {
    const rows = [
      { id: "a", isArchived: true },
      { id: "b", isArchived: true },
      { id: "c", isArchived: true },
    ];
    const active = resolveVerifiedAssignedPlantCount(
      { data: rows },
      (row) => row.isArchived !== true,
    );
    const archived = resolveVerifiedAssignedPlantCount(
      { data: rows },
      (row) => row.isArchived === true,
    );
    expect(active).toBe(0);
    const guard = evaluateTentDeleteGuard({
      tentId: "vegetation-charlie",
      assignedPlantCount: active,
      archivedAssignedPlantCount: archived,
    });
    expect(guard.canDelete).toBe(true);
    expect(guard.reason).toMatch(/unassigned/i);
  });
});

describe("#2790 merge write outcomes", () => {
  it("treats a swallowed empty update as a failure", () => {
    expect(PlantLifecycleWriteRules.rowWasWritten({ data: [], error: null })).toBe(false);
    expect(
      PlantLifecycleWriteRules.failureMessage({ data: [], error: null }, "Merge failed."),
    ).toBe("Merge failed.");
  });

  it("keeps the merge dialog open while confirm is showing", () => {
    expect(PlantLifecycleWriteRules.holdMergeDialog({ confirming: true, busy: false })).toBe(true);
    expect(PlantLifecycleWriteRules.holdMergeDialog({ confirming: false, busy: false })).toBe(
      false,
    );
  });

  it("accepts a confirmed merge summary row", () => {
    expect(PlantLifecycleWriteRules.rowWasWritten({ data: [{ id: "plant" }], error: null })).toBe(
      true,
    );
  });
});
