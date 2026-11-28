import { describe, expect, it } from "vitest";
import { SAVED_REVIEWS_LIST_HREF, resolveSavedReviewBackTarget } from "@/lib/savedReviewBackRules";

const toList = { kind: "link", to: SAVED_REVIEWS_LIST_HREF };

describe("saved AI Doctor review Back target", () => {
  it("goes back when the router recorded an earlier in-app page", () => {
    expect(resolveSavedReviewBackTarget({ __TSR_index: 1 })).toEqual({ kind: "history" });
    expect(resolveSavedReviewBackTarget({ __TSR_index: 7, key: "abc" })).toEqual({
      kind: "history",
    });
  });

  it("opens the saved reviews list when the review is the first page in the tab", () => {
    expect(resolveSavedReviewBackTarget({ __TSR_index: 0 })).toEqual(toList);
  });

  it("opens the saved reviews list when there is no router state", () => {
    for (const state of [null, undefined, {}, "x", 3, [], { idx: 2 }]) {
      expect(resolveSavedReviewBackTarget(state)).toEqual(toList);
    }
  });

  it("does not trust a malformed index", () => {
    for (const index of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2", null]) {
      expect(resolveSavedReviewBackTarget({ __TSR_index: index })).toEqual(toList);
    }
  });

  it("points the fallback at the saved reviews list route", () => {
    expect(SAVED_REVIEWS_LIST_HREF).toBe("/doctor/sessions");
  });
});
