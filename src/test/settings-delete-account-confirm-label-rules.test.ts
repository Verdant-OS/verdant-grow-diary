import { describe, it, expect } from "vitest";
import { deleteAccountConfirmNamesBilling } from "@/lib/settingsTilesRules";

/**
 * Pure regression guard for delete-account confirm button labelling (#2113).
 * UI integration lives in settings-tile-status-and-delete-copy.test.tsx.
 */
describe("deleteAccountConfirmNamesBilling", () => {
  it.each([
    ["loading", { loading: true, lookupFailed: false, displayPlanId: "free" }],
    ["lookup failed", { loading: false, lookupFailed: true, displayPlanId: "free" }],
    ["missing plan (null)", { loading: false, lookupFailed: false, displayPlanId: null }],
    ["missing plan (undefined)", { loading: false, lookupFailed: false, displayPlanId: undefined }],
    ["paid plan", { loading: false, lookupFailed: false, displayPlanId: "pro_monthly" }],
    ["unknown plan id", { loading: false, lookupFailed: false, displayPlanId: "founder_lifetime" }],
  ] as const)("names billing when %s", (_label, input) => {
    expect(deleteAccountConfirmNamesBilling(input)).toBe(true);
  });

  it("uses plain delete label only for a settled, confirmed Free plan", () => {
    expect(
      deleteAccountConfirmNamesBilling({
        loading: false,
        lookupFailed: false,
        displayPlanId: "free",
      }),
    ).toBe(false);
  });
});
