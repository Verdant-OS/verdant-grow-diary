import { describe, expect, it } from "vitest";
import { deleteAccountConfirmNamesBilling } from "@/lib/settingsTilesRules";

/**
 * Ported from draft #2241 (the one case not already on base). A settled lookup
 * that returns any plan id other than the confirmed "free" id, including a
 * non-recurring one such as founder_lifetime, must still name billing on the
 * delete-account confirm: the client cannot prove that no billable row exists.
 * The loading, lookup-failed, null, undefined, paid and Free cases are pinned in
 * src/test/settings-tile-status-and-delete-copy.test.tsx.
 */
describe("deleteAccountConfirmNamesBilling: non-free plan ids", () => {
  it("names billing for a settled founder_lifetime plan", () => {
    expect(
      deleteAccountConfirmNamesBilling({
        loading: false,
        lookupFailed: false,
        displayPlanId: "founder_lifetime",
      }),
    ).toBe(true);
  });
});
