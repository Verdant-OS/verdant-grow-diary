/**
 * pheno-disabled-compare-direct-navigation — proves that even when a user
 * types `/pheno-hunts/:id/compare` directly, an incomplete hunt cannot
 * reach active candidate comparison / ranking / verdict / keeper UI.
 *
 * Additionally proves that disabled Compare flows do NOT trigger
 * comparison-execution or ranking/keeper/action-queue network requests.
 *
 * KEY CONTRACT:
 *  - `/compare` route may remain reachable.
 *  - When `comparisonReadiness !== "comparison_ready"`, the route MUST
 *    render the "Not comparison-ready yet" warning and MUST NOT expose
 *    active comparison UI, verdict/keeper/winner/ranking copy, or a live
 *    compare CTA.
 *  - Navigating back to the workspace keeps Compare disabled.
 *  - No comparison-execution / ranking / keeper / AI-comparison /
 *    Action Queue write endpoints fire in the disabled flow.
 *
 * SAFETY / SCOPE:
 *  - Read-only. No writes. No schema/RLS/entitlement changes.
 *  - Env-gated per fixture. Missing fixtures skip cleanly.
 */
import { test, expect } from "./lib/authedTest";
import {
  REASON_MISSING_EVIDENCE,
  REASON_PENDING_HARVEST,
  REASON_PENDING_CURE,
  REASON_GENERIC_HELP,
  assertDisabledCompareInert,
  assertNoForbiddenComparisonCopy,
  collectNetworkRequests,
  assertNoDisabledCompareNetworkSideEffects,
} from "./lib/phenoDisabledCompareHelpers";

interface Scenario {
  readonly envVar: string;
  readonly reason: string;
  readonly label: string;
}

const SCENARIOS: readonly Scenario[] = [
  {
    envVar: "E2E_PHENO_HUNT_ID_MISSING_EVIDENCE",
    reason: REASON_MISSING_EVIDENCE,
    label: "Missing evidence",
  },
  {
    envVar: "E2E_PHENO_HUNT_ID_PENDING_HARVEST",
    reason: REASON_PENDING_HARVEST,
    label: "Pending until harvest",
  },
  {
    envVar: "E2E_PHENO_HUNT_ID_PENDING_CURE",
    reason: REASON_PENDING_CURE,
    label: "Pending until cure",
  },
  {
    envVar: "E2E_PHENO_HUNT_ID_REPLICATION_PENDING",
    reason: REASON_GENERIC_HELP,
    label: "Replication readiness pending",
  },
];

for (const s of SCENARIOS) {
  test.describe(`disabled Compare direct nav — ${s.label} (${s.envVar})`, () => {
    const huntId = process.env[s.envVar]?.trim() || "";
    test.skip(!huntId, `Set ${s.envVar} to run this direct-nav scenario`);

    test("direct /compare URL shows not-ready warning; no active comparison UI; no forbidden network", async ({
      page,
    }) => {
      const requests = collectNetworkRequests(page);
      const workspaceUrl = `/pheno-hunts/${huntId}/workspace`;
      const compareUrl = `/pheno-hunts/${huntId}/compare`;

      // 1. Workspace — Compare disabled, capture reason.
      await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });
      const before = await assertDisabledCompareInert(page, s.reason);

      // 2. Direct compare URL.
      await page.goto(compareUrl, { waitUntil: "domcontentloaded" });

      // Not-ready warning is visible.
      const warning = page.getByTestId("pheno-hunt-compare-readiness-warning");
      await expect(warning).toBeVisible();
      await expect(warning).toHaveAttribute("role", "alert");
      await expect(warning).toHaveText(/Not comparison-ready yet/i);
      await expect(warning).toHaveText(
        /missing evidence needed for an honest candidate comparison/i,
      );

      // The shared comparison view is rendered in defense-in-depth mode:
      // no verdict/ranking/keeper conclusions may be exposed.
      const view = page.locator('[data-allow-conclusions]');
      if ((await view.count()) > 0) {
        await expect(view.first()).toHaveAttribute(
          "data-allow-conclusions",
          "false",
        );
      }

      // No active "Compare candidates" CTA anywhere on the route.
      expect(
        await page
          .getByRole("link", { name: /compare candidates/i })
          .count(),
      ).toBe(0);
      expect(
        await page
          .getByRole("button", { name: /compare candidates/i })
          .count(),
      ).toBe(0);

      // Back-to-workspace link exists and points at the workspace.
      const backLink = page.getByTestId(
        "pheno-hunt-compare-readiness-warning-workspace-link",
      );
      await expect(backLink).toBeVisible();
      await expect(backLink).toHaveAttribute(
        "href",
        new RegExp(`/pheno-hunts/${huntId}/workspace$`),
      );

      // DOM-wide forbidden-copy scan (visible + hidden panels).
      await assertNoForbiddenComparisonCopy(
        page,
        `${s.label} direct /compare DOM`,
      );

      // 3. Navigate back to workspace — Compare still disabled with the
      //    same reason (navigation cannot flip readiness).
      await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });
      const after = await assertDisabledCompareInert(page, s.reason);
      expect(after.helperText).toBe(before.helperText);

      // 4. Network assertions — nothing comparison-execution-y fired.
      assertNoDisabledCompareNetworkSideEffects(
        requests,
        `${s.label} direct-nav flow`,
      );
    });
  });
}
