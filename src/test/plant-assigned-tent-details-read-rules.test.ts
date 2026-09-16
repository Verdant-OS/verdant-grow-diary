import { describe, expect, it } from "vitest";
import {
  buildPlantAssignedTentDetailsReadView,
  resolveAssignedTentRow,
} from "@/lib/plantAssignedTentDetailsReadRules";

describe("resolveAssignedTentRow", () => {
  it("returns the row only when its id matches the plant assignment", () => {
    const row = { id: "tent-1", name: "Canopy" };
    expect(resolveAssignedTentRow("tent-1", row)).toBe(row);
    expect(resolveAssignedTentRow("tent-2", row)).toBeNull();
    expect(resolveAssignedTentRow(undefined, row)).toBeNull();
    expect(resolveAssignedTentRow("tent-1", null)).toBeNull();
  });
});

describe("buildPlantAssignedTentDetailsReadView", () => {
  it("shows loading copy on the first unresolved read", () => {
    expect(
      buildPlantAssignedTentDetailsReadView({
        hasResolvedDetails: false,
        isPending: true,
      }),
    ).toEqual({
      message: "Loading assigned tent details…",
      canRetry: false,
    });
  });

  it("shows unavailable copy after a failed first read and allows retry", () => {
    expect(
      buildPlantAssignedTentDetailsReadView({
        hasResolvedDetails: false,
        isError: true,
      }),
    ).toEqual({
      message: "Assigned tent details unavailable.",
      canRetry: true,
    });
  });

  it("shows cached refresh warning after a failed refresh", () => {
    expect(
      buildPlantAssignedTentDetailsReadView({
        hasResolvedDetails: true,
        isError: true,
      }),
    ).toEqual({
      message: "Could not refresh assigned tent details. Showing cached details.",
      canRetry: true,
    });
  });

  it("blocks retry while paused or fetching", () => {
    expect(
      buildPlantAssignedTentDetailsReadView({
        hasResolvedDetails: false,
        fetchStatus: "paused",
      }).canRetry,
    ).toBe(false);
    expect(
      buildPlantAssignedTentDetailsReadView({
        hasResolvedDetails: true,
        isFetching: true,
        isError: true,
      }).canRetry,
    ).toBe(false);
  });

  it("clears status copy once resolved details are available", () => {
    expect(
      buildPlantAssignedTentDetailsReadView({
        hasResolvedDetails: true,
      }),
    ).toEqual({ message: null, canRetry: false });
  });

  it("treats a completed null row as unavailable details with retry", () => {
    expect(
      buildPlantAssignedTentDetailsReadView({
        hasResolvedDetails: false,
      }),
    ).toEqual({
      message: "Assigned tent details unavailable.",
      canRetry: true,
    });
  });
});
