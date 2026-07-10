/**
 * pheno-disabled-compare-workspace-navigation — E2E persistence coverage
 * for disabled "Compare candidates" states across workspace navigation.
 *
 * KEY ACCEPTANCE RULE:
 *   Changing workspace tabs/routes/anchors must NOT change comparison
 *   readiness. The disabled reason stays visible until real evidence
 *   changes.
 *
 * SAFETY / SCOPE:
 *  - Read-only. No writes, no schema, no RLS/entitlement changes.
 *  - Env-gated per fixture; missing env vars skip cleanly.
 *  - DOM-wide forbidden-copy scan (visible + hidden text, expanded
 *    accordions/disclosures) is enforced on every persistence pass.
 *
 * Fixture env vars:
 *   E2E_PHENO_HUNT_ID_MISSING_EVIDENCE
 *   E2E_PHENO_HUNT_ID_PENDING_HARVEST
 *   E2E_PHENO_HUNT_ID_PENDING_CURE
 */
import { test, expect } from "./lib/authedTest";
import {
  REASON_MISSING_EVIDENCE,
  REASON_PENDING_HARVEST,
  REASON_PENDING_CURE,
  assertDisabledCompareInert,
  assertNoForbiddenComparisonCopy,
} from "./lib/phenoDisabledCompareHelpers";

const WORKSPACE_ANCHORS = [
  "candidate-labels",
  "evidence-goals",
  "phenotype-notes",
  "post-harvest-notes",
  "post-cure-notes",
] as const;

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
    envVar: "E2E_PHENO_HUNT_ID_PENDING_CURE",
    reason: REASON_PENDING_CURE,
    label: "Pending until cure",
  },
  {
    envVar: "E2E_PHENO_HUNT_ID_PENDING_HARVEST",
    reason: REASON_PENDING_HARVEST,
    label: "Pending until harvest",
  },
];

for (const s of SCENARIOS) {
  test.describe(`disabled Compare persistence — ${s.label} (${s.envVar})`, () => {
    const huntId = process.env[s.envVar]?.trim() || "";
    test.skip(!huntId, `Set ${s.envVar} to run this persistence scenario`);

    test("desktop: nav around workspace, Compare stays disabled and reason unchanged", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 1600 });
      const workspaceUrl = `/pheno-hunts/${huntId}/workspace`;
      await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });

      const before = await assertDisabledCompareInert(page, s.reason);
      await assertNoForbiddenComparisonCopy(page, `${s.label} (initial)`);

      for (const anchor of WORKSPACE_ANCHORS) {
        if ((await page.locator(`#${anchor}`).count()) === 0) continue;
        await page.goto(`${workspaceUrl}#${anchor}`, {
          waitUntil: "domcontentloaded",
        });
      }
      await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });

      const after = await assertDisabledCompareInert(page, s.reason);
      expect(after.helperText).toBe(before.helperText);
      await assertNoForbiddenComparisonCopy(page, `${s.label} (post-nav)`);
    });

    test("mobile: disabled state, helper text, and screenshot render after nav", async ({
      page,
    }) => {
      // iPhone 13 mini portrait — narrow enough to exercise mobile layout.
      await page.setViewportSize({ width: 390, height: 844 });
      const workspaceUrl = `/pheno-hunts/${huntId}/workspace`;
      await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });

      const before = await assertDisabledCompareInert(page, s.reason);
      await assertNoForbiddenComparisonCopy(page, `${s.label} (mobile initial)`);

      for (const anchor of WORKSPACE_ANCHORS) {
        if ((await page.locator(`#${anchor}`).count()) === 0) continue;
        await page.goto(`${workspaceUrl}#${anchor}`, {
          waitUntil: "domcontentloaded",
        });
      }
      await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });

      const after = await assertDisabledCompareInert(page, s.reason);
      expect(after.helperText).toBe(before.helperText);
      await assertNoForbiddenComparisonCopy(page, `${s.label} (mobile post-nav)`);

      const action = page.getByTestId("pheno-workspace-compare-action");
      await action.scrollIntoViewIfNeeded();
      await action.screenshot({
        path: `e2e/screenshots/pheno-disabled-compare-mobile-${s.envVar}.png`,
      });
    });
  });
}
