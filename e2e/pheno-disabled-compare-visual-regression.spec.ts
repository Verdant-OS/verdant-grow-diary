/**
 * pheno-disabled-compare-visual-regression — one visual/E2E scenario per
 * disabled "Compare candidates" reason. Proves each disabled state stays
 * visually stable, accessible, inert, and never leaks verdict/keeper/
 * ranking copy.
 *
 * SAFETY / SCOPE:
 *  - Read-only. No writes. No schema/RLS/entitlement changes.
 *  - Env-gated per fixture. Missing fixtures skip cleanly with a clear
 *    reason. We never fake a pass.
 *  - Screenshots are captured as artifacts to e2e/screenshots/. This spec
 *    does NOT rely on toHaveScreenshot() pixel baselines — repo has no
 *    committed baselines. Copy/structure assertions are the real guard.
 *
 * Fixture env vars (each independent — set only what you have):
 *   E2E_PHENO_HUNT_ID_MISSING_EVIDENCE
 *   E2E_PHENO_HUNT_ID_PENDING_HARVEST
 *   E2E_PHENO_HUNT_ID_PENDING_CURE
 *   E2E_PHENO_HUNT_ID_REPLICATION_PENDING
 */
import { test, expect } from "./lib/authedTest";
import type { Page } from "@playwright/test";

// Canonical reason copy — must match src/constants/phenoOnboardingCopy.ts
// (PHENO_STATUS_LABELS). Kept as literals here so a copy drift is caught by
// this spec rather than silently sliding out from under it.
const REASON_MISSING_EVIDENCE = "Missing evidence";
const REASON_PENDING_HARVEST = "Pending until harvest";
const REASON_PENDING_CURE = "Pending until cure";
const REASON_GENERIC_HELP = "Add the missing evidence before comparing candidates.";

// Copy that must NEVER appear in any disabled Compare surface.
const FORBIDDEN: RegExp[] = [
  /\bwinner\b/i,
  /winning candidate/i,
  /best candidate/i,
  /best pheno/i,
  /top candidate/i,
  /ranked candidate/i,
  /candidate ranking/i,
  /final ranking/i,
  /\bverdict\b/i,
  /final verdict/i,
  /comparison verdict/i,
  /recommended keeper/i,
  /keeper recommendation/i,
  /keeper selected/i,
  /keeper confirmed/i,
  /selection winner/i,
  /ai picked/i,
  /ai picks winners/i,
  /guaranteed keeper/i,
  /guaranteed yield/i,
  /automated breeding/i,
];

function assertNoForbiddenCopy(text: string, scope: string) {
  for (const pat of FORBIDDEN) {
    expect(pat.test(text), `${scope} contains forbidden copy ${pat}`).toBe(
      false,
    );
  }
}

async function assertDisabledCompareInert(page: Page, expectedReason: string) {
  const action = page.getByTestId("pheno-workspace-compare-action");
  await expect(action).toBeVisible();

  // Exactly one Compare action rendered — no duplicate cards/panels.
  expect(await page.getByTestId("pheno-workspace-compare-action").count()).toBe(1);

  // Enabled=false attribute confirms the pure state, not just the button.
  await expect(action).toHaveAttribute("data-enabled", "false");

  const disabledBtn = page.getByTestId(
    "pheno-workspace-compare-action-disabled",
  );
  await expect(disabledBtn).toBeVisible();
  await expect(disabledBtn).toBeDisabled();
  await expect(disabledBtn).toHaveAttribute("aria-disabled", "true");

  // Helper text is real and referenced via aria-describedby.
  const describedBy = await disabledBtn.getAttribute("aria-describedby");
  expect(describedBy, "aria-describedby must be set on disabled button").toBeTruthy();
  const helper = page.locator(`#${describedBy}`);
  await expect(helper).toBeVisible();
  await expect(helper).toHaveText(
    /Compare candidates is disabled because this hunt is not comparison-ready yet\./,
  );

  // Reason copy is visible in either the reason span or the missing list.
  const combined = ((await helper.textContent()) ?? "").trim();
  expect(
    combined.includes(expectedReason) || combined.includes(REASON_GENERIC_HELP),
    `helper should surface expected reason "${expectedReason}"`,
  ).toBe(true);

  // No /compare link anywhere in the action card.
  const compareLinks = action.locator('a[href*="/compare"]');
  expect(await compareLinks.count()).toBe(0);

  // No verdict/keeper/ranking copy anywhere in the action region.
  const regionText = (await action.textContent()) ?? "";
  assertNoForbiddenCopy(regionText, "disabled Compare action region");
}

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
    // Replication readiness uses the generic help copy today (see
    // buildPhenoComparisonActionState — readiness resolves to "not_ready").
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

    test(`renders disabled, accessible, inert; no verdict/keeper/ranking copy`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 1600 });
      await page.goto(`/pheno-hunts/${huntId}/workspace`, {
        waitUntil: "domcontentloaded",
      });

      await assertDisabledCompareInert(page, s.reason);

      const action = page.getByTestId("pheno-workspace-compare-action");
      await action.screenshot({ path: `e2e/screenshots/${s.screenshot}` });
    });
  });
}

/**
 * Persistence across workspace navigation. Compare must stay disabled and
 * the helper reason must stay unchanged after navigating anchors/sections —
 * only real evidence changes may flip readiness.
 */
test.describe("disabled Compare persists across workspace navigation", () => {
  const candidates: readonly { envVar: string; reason: string }[] = [
    {
      envVar: "E2E_PHENO_HUNT_ID_MISSING_EVIDENCE",
      reason: REASON_MISSING_EVIDENCE,
    },
    {
      envVar: "E2E_PHENO_HUNT_ID_PENDING_CURE",
      reason: REASON_PENDING_CURE,
    },
    {
      envVar: "E2E_PHENO_HUNT_ID_PENDING_HARVEST",
      reason: REASON_PENDING_HARVEST,
    },
  ];

  for (const c of candidates) {
    const huntId = process.env[c.envVar]?.trim() || "";
    test.describe(c.envVar, () => {
      test.skip(!huntId, `Set ${c.envVar} to run this persistence scenario`);
      test("nav around workspace, Compare stays disabled and reason unchanged", async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1280, height: 1600 });
        const workspaceUrl = `/pheno-hunts/${huntId}/workspace`;
        await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });
        await assertDisabledCompareInert(page, c.reason);

        const disabledBtn = page.getByTestId(
          "pheno-workspace-compare-action-disabled",
        );
        const helperId = await disabledBtn.getAttribute("aria-describedby");
        const helper = page.locator(`#${helperId}`);
        const helperTextBefore = ((await helper.textContent()) ?? "").trim();

        // Click each anchor target that exists (guard: workspace may not
        // render every section for every fixture).
        const anchors = [
          "candidate-labels",
          "evidence-goals",
          "phenotype-notes",
          "post-harvest-notes",
          "post-cure-notes",
        ];
        for (const anchor of anchors) {
          const el = page.locator(`#${anchor}`);
          if ((await el.count()) === 0) continue;
          await page.goto(`${workspaceUrl}#${anchor}`, {
            waitUntil: "domcontentloaded",
          });
        }

        // Return to workspace root.
        await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });

        // Compare still disabled; same reason; still no /compare link.
        await assertDisabledCompareInert(page, c.reason);
        const helperIdAfter = await page
          .getByTestId("pheno-workspace-compare-action-disabled")
          .getAttribute("aria-describedby");
        expect(helperIdAfter).toBeTruthy();
        const helperAfter = page.locator(`#${helperIdAfter}`);
        const helperTextAfter = ((await helperAfter.textContent()) ?? "").trim();
        expect(helperTextAfter).toBe(helperTextBefore);
      });
    });
  }
});
