import { describe, expect, it } from "vitest";
import {
  buildAssignTentListingReadState,
  type AssignTentListingReadInput,
} from "@/lib/assignTentListingReadRules";

describe("eligible-tent listing read state", () => {
  it.each<AssignTentListingReadInput | null | undefined>([
    undefined,
    null,
    {},
    { isError: false },
    { isPending: true },
    { isPending: true, isError: false },
  ])("keeps unresolved input %j loading and non-actionable", (input) => {
    expect(buildAssignTentListingReadState(input)).toEqual({
      status: "loading",
      message: "Loading…",
      canChoose: false,
    });
  });

  it.each<AssignTentListingReadInput>([
    { isError: true },
    { isPending: false, isError: true },
    { isPending: true, isError: true },
  ])("makes a failed read %j unavailable regardless of pending state", (input) => {
    expect(buildAssignTentListingReadState(input)).toEqual({
      status: "unavailable",
      message: "Tent destinations are unavailable. Retry to load them.",
      canChoose: false,
    });
  });

  it.each<AssignTentListingReadInput>([{ isPending: false }, { isPending: false, isError: false }])(
    "allows completed non-failed input %j to present its actual rows",
    (input) => {
      expect(buildAssignTentListingReadState(input)).toEqual({
        status: "ready",
        message: null,
        canChoose: true,
      });
    },
  );

  it("is deterministic and does not mutate a frozen input", () => {
    const input = Object.freeze({ isPending: false, isError: true });
    const first = buildAssignTentListingReadState(input);
    expect(buildAssignTentListingReadState(input)).toEqual(first);
    expect(input).toEqual({ isPending: false, isError: true });
  });
});
