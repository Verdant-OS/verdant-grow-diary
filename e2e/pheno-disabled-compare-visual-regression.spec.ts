/**
 * pheno-disabled-compare-visual-regression — one visual/E2E scenario per
 * disabled "Compare candidates" reason. Proves each disabled state stays
 * visually stable, accessible, inert, and never leaks verdict/keeper/
 * ranking copy — including in hidden panels and collapsed accordions.
 *
 * SAFETY / SCOPE:
 *  - Read-only. No writes. No schema/RLS/entitlement changes.
 *  - Env-gated per fixture. Missing fixtures skip cleanly.
 *  - Screenshots are ARTIFACTS under e2e/screenshots/. This spec does NOT
 *    rely on committed pixel baselines — copy/structure assertions are the
 *    real guard.
 *
 * Persistence-across-navigation coverage lives in the sibling spec
 * `pheno-disabled-compare-workspace-navigation.spec.ts`.
 *
 * Fixture env vars:
 *   E2E_PHENO_HUNT_ID_MISSING_EVIDENCE
 *   E2E_PHENO_HUNT_ID_PENDING_HARVEST
 *   E2E_PHENO_HUNT_ID_PENDING_CURE
 *   E2E_PHENO_HUNT_ID_REPLICATION_PENDING
 */
import { test } from "./lib/authedTest";
import {
  REASON_MISSING_EVIDENCE,
  REASON_PENDING_HARVEST,
  REASON_PENDING_CURE,
  REASON_GENERIC_HELP,
  assertDisabledCompareInert,
  assertNoForbiddenComparisonCopy,
} from "./lib/phenoDisabledCompareHelpers";

interface Scenario {
  readonly name: string;
  readonly envVar: string;
  readonly reason: string;
  readonly screenshot: string;
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: "Missing evidence",
    envVar: "E2E_PHENO_HUNT_ID_MISSING_EVIDENCE",
    reason: REASON_MISSING_EVIDENCE,
    screenshot: "pheno-disabled-compare-missing-evidence.png",
  },
  {
    name: "Pending until harvest",
    envVar: "E2E_PHENO_HUNT_ID_PENDING_HARVEST",
    reason: REASON_PENDING_HARVEST,
    screenshot: "pheno-disabled-compare-pending-harvest.png",
  },
  {
    name: "Pending until cure",
    envVar: "E2E_PHENO_HUNT_ID_PENDING_CURE",
    reason: REASON_PENDING_CURE,
    screenshot: "pheno-disabled-compare-pending-cure.png",
  },
  {
    name: "Replication readiness pending",
    envVar: "E2E_PHENO_HUNT_ID_REPLICATION_PENDING",
    // Replication readiness uses the generic help copy today
    // (buildPhenoComparisonActionState resolves to readiness="not_ready").
    reason: REASON_GENERIC_HELP,
    screenshot: "pheno-disabled-compare-replication-pending.png",
  },
];

for (const s of SCENARIOS) {
  test.describe(`disabled Compare — ${s.name}`, () => {
    const huntId = process.env[s.envVar]?.trim() || "";
    test.skip(
      !huntId,
      `Set ${s.envVar} to a hunt id whose workspace is in the "${s.name}" state`,
    );

    test("desktop: renders disabled, accessible, inert; no verdict/keeper/ranking copy anywhere in DOM", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 1600 });
      await page.goto(`/pheno-hunts/${huntId}/workspace`, {
        waitUntil: "domcontentloaded",
      });

      await assertDisabledCompareInert(page, s.reason);
      // DOM-wide scan: catches forbidden copy in hidden tab panels /
      // collapsed accordions / mounted-but-hidden conclusion cards.
      await assertNoForbiddenComparisonCopy(page, `${s.name} (desktop)`);

      const action = page.getByTestId("pheno-workspace-compare-action");
      await action.screenshot({ path: `e2e/screenshots/${s.screenshot}` });
    });

    test("mobile: renders disabled, accessible, inert; region screenshot captured", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/pheno-hunts/${huntId}/workspace`, {
        waitUntil: "domcontentloaded",
      });

      await assertDisabledCompareInert(page, s.reason);
      await assertNoForbiddenComparisonCopy(page, `${s.name} (mobile)`);

      const action = page.getByTestId("pheno-workspace-compare-action");
      await action.scrollIntoViewIfNeeded();
      await action.screenshot({
        path: `e2e/screenshots/mobile-${s.screenshot}`,
      });
    });
  });
}
