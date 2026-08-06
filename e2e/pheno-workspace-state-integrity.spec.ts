/**
 * pheno-workspace-state-integrity — regressions for three defects found by
 * manual browser testing against the DEPLOYED app on 2026-07-29 that the
 * existing pheno suite does not cover.
 *
 * Full evidence: e2e/results/pheno-hunt-e2e-report.md (findings F11, F13/A1, F14).
 *
 * FIX STATUS: the F11 and F14 product fixes land in the SAME commit as this
 * spec (F11: PhenoHuntSetupProgressCard re-validates setup-complete against
 * candidateCount; F14: usePhenoHuntWorkspace.saveSex skips the fabricated
 * first-save "unknown" append). The F11/F14 assertions below therefore
 * describe FIXED behavior and are expected to pass against a deployment that
 * includes this commit.
 *
 * WHY THIS IS AN AUTHED SPEC, NOT A MOCKED ONE
 * --------------------------------------------
 * The hunt workspace sits behind BOTH the auth wall and the `pheno_tracker`
 * Pro gate (`PhenoTrackerUpgradeGate`). The mocked pheno specs
 * (pheno-hunts-compare-deep-link, pheno-disabled-compare-*) fulfil
 * `/auth/v1/**` with `{}`, which the app reads as signed-out — fine for
 * `/pheno-comparison` and `/pheno-hunts/:id/compare`, but the workspace
 * redirects to `/welcome`. Faking a Supabase session in localStorage is not a
 * pattern this repo uses, so workspace coverage follows
 * `pheno-paid-journey.spec.ts`: a real authed fixture with an operator-seeded
 * Pro row.
 *
 * PRECONDITIONS (same as pheno-paid-journey `paid` phase)
 *   - E2E_PHENO_PHASE=paid
 *   - fixture account has an active Pro entitlement (operator seed, no real purchase)
 *   - fixture grow has >= 2 non-archived plants
 *   - E2E_BASE_URL points at the deployment under test
 *
 * SAFETY
 *   This spec CREATES a pheno hunt and DELETES it in cleanup. Point it at the
 *   disposable E2E fixture grow only — never a real grower grow. It performs no
 *   evidence/Quick Log saves beyond the single trait-score save F14 needs,
 *   because evidence entries are diary entries that SURVIVE hunt deletion
 *   (see F8) and would leave permanent residue. It never touches
 *   `workspace-assign-number-*`, which the UI labels "Becomes permanently
 *   fixed for this hunt."
 *
 *   ⚠️ FIXTURE RESIDUE (F11): the F11 test ARCHIVES the two candidate plants
 *   (`plants.is_archived = true`) to reach the 0-candidate state — the app has
 *   no unarchive UI, so the plants STAY archived after the run. Before a
 *   rerun (of this spec or pheno-paid-journey, both of which require >= 2
 *   non-archived plants), the operator must un-archive the fixture plants
 *   server-side or reseed the fixture grow.
 *
 * STATUS: NOT YET EXECUTED. Authored from empirically verified selectors and
 * copy on the deploy branch, but it needs the Pro-seeded fixture. Treat the
 * first run as part of review, not as a passing baseline.
 *   E2E_PHENO_PHASE=paid E2E_BASE_URL=... bunx playwright test \
 *     e2e/pheno-workspace-state-integrity.spec.ts --project=chromium-authed
 */
import type { Page } from "@playwright/test";
import { test, expect } from "./lib/authedTest";

const PHASE = process.env.E2E_PHENO_PHASE ?? "";
const BASE_URL = process.env.E2E_BASE_URL ?? "";

/** The ~45-65s remount guard is deliberately slow; opt in separately. */
const RUN_REMOUNT_GUARD = process.env.E2E_PHENO_REMOUNT_GUARD === "true";

test.skip(PHASE !== "paid", "E2E_PHENO_PHASE=paid required — opt-in");
test.describe.configure({ mode: "serial" });

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function discoverFixtureGrowId(page: Page): Promise<string> {
  await page.goto(`${BASE_URL}/grows`);
  const growLink = page.locator('a[href^="/grows/"]').first();
  await expect(growLink, "fixture account must have a grow").toBeVisible({ timeout: 15_000 });
  const href = await growLink.getAttribute("href");
  const m = href?.match(new RegExp(`^/grows/(${UUID_RE.source})$`, "i"));
  expect(m, `grow link href must carry a uuid (got ${href})`).toBeTruthy();
  return m![1];
}

/**
 * Drive the guided stepper to a saved hunt with `candidateCount` candidates.
 * Mirrors the wizard path pheno-paid-journey.spec.ts already proves on the
 * deploy branch (basics → candidates → goals → packet preview → checklist →
 * confirmation → save). Returns the hunt id parsed from the post-save
 * workspace URL plus the tagged candidate PLANT ids (needed by F11's archive
 * step).
 *
 * `confirmSetup` checks the wizard's confirmation toggle, which stamps
 * `setup_completed_at` at creation — i.e. while candidates exist, which is
 * exactly the stale-flag precondition F11 needs.
 *
 * NOTE ON TIMING (F13): type-then-save must happen in one burst. The workspace
 * subtree was observed to unmount/remount every ~45-65s and discard unsaved
 * input, so any long pause between filling a field and saving may silently
 * lose it (see the opt-in F13 guard below for post-migration status).
 */
async function createHuntWithCandidates(
  page: Page,
  growId: string,
  candidateCount: number,
  opts: { confirmSetup: boolean },
): Promise<{ huntId: string; candidatePlantIds: string[] }> {
  await page.goto(`${BASE_URL}/pheno-hunts/new?growId=${growId}`);

  const wizard = page.getByTestId("pheno-hunt-onboarding");
  await expect(wizard, "Pro fixture must reach the stepper, not the upgrade gate").toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("ph-name-input")).toHaveValue(/.+/);

  await page.getByTestId("pheno-step-next").click();
  await expect(page.getByTestId("pheno-step-candidates")).toBeVisible({ timeout: 15_000 });
  const toggles = page.locator('[data-testid^="ph-toggle-"]');
  await expect(toggles.first()).toBeVisible({ timeout: 15_000 });
  expect(
    await toggles.count(),
    `fixture grow needs >= ${candidateCount} non-archived plants`,
  ).toBeGreaterThanOrEqual(candidateCount);

  const candidatePlantIds: string[] = [];
  for (let i = 0; i < candidateCount; i++) {
    const toggle = toggles.nth(i);
    const tid = await toggle.getAttribute("data-testid");
    candidatePlantIds.push(tid!.replace("ph-toggle-", ""));
    await toggle.click();
  }
  await expect(page.getByTestId("pheno-candidate-status")).toContainText(/comparison-eligible/i);
  await page.getByTestId("pheno-step-next").click();

  // Goals: defaults are non-empty; ensure at least one is selected.
  await expect(page.getByTestId("pheno-step-goals")).toBeVisible({ timeout: 15_000 });
  const pressedGoals = page.locator(
    '[data-testid^="pheno-evidence-goals-toggle-"][aria-pressed="true"], [data-testid^="pheno-evidence-goals-toggle-"][data-state="on"], [data-testid^="pheno-evidence-goals-toggle-"]:checked',
  );
  if ((await pressedGoals.count()) === 0) {
    await page.locator('[data-testid^="pheno-evidence-goals-toggle-"]').first().click();
  }
  await page.getByTestId("pheno-step-next").click();

  await expect(page.getByTestId("pheno-step-packet-preview")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("pheno-step-next").click();
  await expect(page.getByTestId("pheno-step-checklist")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("pheno-step-next").click();
  await expect(page.getByTestId("pheno-step-confirmation")).toBeVisible({ timeout: 15_000 });
  if (opts.confirmSetup) {
    await page.getByTestId("pheno-setup-confirm-toggle").check();
  }

  const save = page.getByTestId("ph-save-btn");
  await expect(save).toBeEnabled();
  await save.click();

  await page.waitForURL(/\/pheno-hunts\/[0-9a-f-]{36}\/workspace/i, { timeout: 30_000 });
  const huntId = page.url().match(/\/pheno-hunts\/([0-9a-f-]{36})\/workspace/i)?.[1];
  expect(huntId, "post-save URL must expose the new hunt id").toBeTruthy();
  return { huntId: huntId!, candidatePlantIds };
}

/**
 * Archive one plant via Plant Detail's inline action row + confirm dialog
 * (`plants.is_archived = true`; logs and diary history are kept). This is the
 * only real way to reach candidateCount 0 on the deploy branch: the candidates
 * loader filters `plants.is_archived = false`, and NO single-candidate untag
 * control exists in the workspace (`workspace-select-*` is a comparison-
 * selection checkbox — see the F11 note below).
 */
async function archivePlant(page: Page, plantId: string) {
  await page.goto(`${BASE_URL}/plants/${plantId}`);
  const archiveBtn = page.getByTestId("plant-detail-archive-plant");
  await expect(archiveBtn, `plant ${plantId} must expose the archive action`).toBeVisible({
    timeout: 20_000,
  });
  await archiveBtn.click();
  const confirm = page.getByTestId("confirm-archive-plant");
  await expect(confirm).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("confirm-archive-plant-submit").click();
  await expect(confirm, "archive confirm dialog must close on success").toBeHidden({
    timeout: 15_000,
  });
}

/** Two-step delete from the grow-scoped Timeline. Idempotent-ish cleanup. */
async function deleteHuntViaTimeline(page: Page, growId: string) {
  await page.goto(`${BASE_URL}/timeline?growId=${growId}`);
  const section = page.getByTestId("pheno-hunt-timeline-section");
  if (!(await section.isVisible({ timeout: 20_000 }).catch(() => false))) return;
  await page.getByTestId("pheno-hunt-delete-btn").click();
  await expect(page.getByTestId("pheno-hunt-delete-confirm")).toBeVisible();
  await page.getByTestId("pheno-hunt-delete-confirm-btn").click();
  await expect(section).toHaveCount(0, { timeout: 20_000 });
}

test.describe("F11 — setup-complete must not contradict its own definition", () => {
  /**
   * Observed on the deployed app (hunt "Codex Pro E2E Pheno Hunt 2026-07-25"):
   *   setup-status      = "Setup complete: Yes"
   *   item-candidates   = "No candidates tagged yet"
   *   definition-setup  = "Setup complete means your hunt has candidates and evidence goals."
   *   count             = "3 of 4 steps done"
   *
   * "Setup complete: Yes" with zero candidates contradicts the definition the
   * same card states. Root cause (confirmed in source): a STALE FLAG — setup
   * was confirmed while candidates existed, they were later removed, and the
   * card rendered purely from `setup_completed_at`. Fixed in this commit:
   * PhenoHuntSetupProgressCard re-validates the derived status against
   * candidateCount.
   *
   * The original WIP unchecked `workspace-select-<PID>` believing it untags
   * candidates — verified FALSE on the deploy branch: that testid is a
   * comparison-selection checkbox, and no single-candidate untag control
   * exists. Candidates are tagged plants, and the candidates loader filters
   * `plants.is_archived = false`, so ARCHIVING the candidate plants is the
   * real user path to a 0-candidate hunt (see SAFETY: this leaves the fixture
   * plants archived).
   */
  test("a hunt whose candidates were all archived must not still claim setup complete", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const growId = await discoverFixtureGrowId(page);
    // confirmSetup stamps `setup_completed_at` while candidates exist — the
    // exact precondition for the stale-flag state.
    const { huntId, candidatePlantIds } = await createHuntWithCandidates(page, growId, 2, {
      confirmSetup: true,
    });

    try {
      // Sanity: with candidates present, the confirmed hunt reads "Yes".
      await page.goto(`${BASE_URL}/pheno-hunts/${huntId}/workspace`);
      await expect(page.getByTestId("pheno-workspace-setup-progress-setup-status")).toContainText(
        /Setup complete:\s*Yes/i,
        { timeout: 25_000 },
      );

      // Remove every candidate by archiving its plant, then re-read the card.
      for (const plantId of candidatePlantIds) {
        await archivePlant(page, plantId);
      }

      await page.goto(`${BASE_URL}/pheno-hunts/${huntId}/workspace`);
      const candidatesItem = page.getByTestId("pheno-workspace-setup-progress-item-candidates");
      await expect(candidatesItem).toBeVisible({ timeout: 25_000 });

      // PRECONDITION — asserted hard, on purpose. The stale-flag assertion that
      // follows is only meaningful once this hunt genuinely has zero candidates,
      // so if archiving did not take effect this test must FAIL rather than pass
      // vacuously. Do not soften this into a conditional.
      await expect(
        candidatesItem,
        "PRECONDITION NOT REACHED: candidates were not removed, so the stale-flag " +
          "assertion below would pass vacuously. Either fix the archive interaction, or " +
          "reach the 0-candidate state another way (seed the row) — do not relax this " +
          "into an `if`.",
      ).toContainText(/no candidates/i, { timeout: 25_000 });

      // The card's own stated rule: setup complete REQUIRES candidates.
      await expect(
        page.getByTestId("pheno-workspace-setup-progress-definition-setup"),
      ).toContainText(/has candidates/i);
      await expect(
        page.getByTestId("pheno-workspace-setup-progress-setup-status"),
        "setup-complete flag must be re-validated when candidates are removed",
      ).not.toContainText(/Setup complete:\s*Yes/i);
    } finally {
      await deleteHuntViaTimeline(page, growId);
    }
  });
});

test.describe("F14 — saving a candidate card must not fabricate a sex observation", () => {
  /**
   * Observed: clicking `workspace-save-<PID>` after editing ONLY a trait score
   * added a grow-Timeline PHENO ACTIVITY entry "#1 — Sex recorded: Unknown",
   * though `workspace-sex-<PID>` was never touched.
   *
   * Control: in an earlier pass the same Timeline section, same grow, same 2
   * candidates, ZERO card saves, contained no PHENO ACTIVITY block at all — so
   * the emission is attributable to the save, not to hunt creation or tagging.
   * Root cause (confirmed in source): the card's Save fires score + decision +
   * sex together, and saveSex's dirty-check only skipped when a PRIOR
   * observation row matched — the FIRST save always appended the "unknown"
   * default. Fixed in this commit: usePhenoHuntWorkspace.saveSex skips the
   * append when no prior observation exists and the value is the untouched
   * default.
   *
   * Caveat carried from the manual run: that capture was read truncated, so the
   * full emitted-event set is unknown. This test asserts only the specific
   * false claim.
   */
  test("editing a trait score and saving emits no 'Sex recorded' event", async ({ page }) => {
    test.setTimeout(180_000);
    const growId = await discoverFixtureGrowId(page);
    const { huntId } = await createHuntWithCandidates(page, growId, 2, { confirmSetup: false });

    try {
      await page.goto(`${BASE_URL}/pheno-hunts/${huntId}/workspace`);

      const trait = page.locator('[data-testid*="-nose_loudness"]').first();
      await expect(trait).toBeVisible({ timeout: 25_000 });
      const pid = (await trait.getAttribute("data-testid"))!
        .replace("workspace-trait-", "")
        .replace("-nose_loudness", "");

      // Sanity: we are not touching the sex control at all.
      const sex = page.getByTestId(`workspace-sex-${pid}`);
      const sexBefore = (await sex.count()) ? await sex.inputValue().catch(() => null) : null;

      // Fill + save in ONE burst — see F13. The save-landed wait uses the
      // card's own Saved indicator: the WIP waited on `workspace-objective-*`,
      // which only renders when a breeding objective has targetCount > 0 and
      // is therefore vacuous on a fresh hunt.
      await trait.fill("8");
      await page.getByTestId(`workspace-save-${pid}`).click();
      await expect(page.getByTestId(`workspace-saved-${pid}`)).toBeVisible({ timeout: 25_000 });

      if (sexBefore !== null) {
        expect(await sex.inputValue().catch(() => null), "save must not alter sex").toBe(sexBefore);
      }

      await page.goto(`${BASE_URL}/timeline?growId=${growId}`);
      const section = page.getByTestId("pheno-hunt-timeline-section");
      await expect(section).toBeVisible({ timeout: 25_000 });
      // Read the whole timeline, untruncated — the manual run's capture was cut short.
      const timelineText = await page.locator("main").innerText();
      expect(
        timelineText,
        "saving a trait score must not record a sex observation the grower never made",
      ).not.toMatch(/Sex recorded/i);
    } finally {
      await deleteHuntViaTimeline(page, growId);
    }
  });
});

test.describe("F13 / A1 — unsaved input must survive an idle dwell", () => {
  test.skip(!RUN_REMOUNT_GUARD, "E2E_PHENO_REMOUNT_GUARD=true required — deliberately slow");

  /**
   * Observed on the deployed app on 2026-07-29: the wizard/workspace subtree
   * UNMOUNTED and remounted while idle, discarding unsaved input and resetting
   * the stepper to step 1. Two independent measurements:
   *
   *   workspace threshold input: value present at 0s; element GONE from the DOM
   *                              at 79.3s; back, empty, at 79.8s (repeated at 80.3s)
   *   wizard on step 2:          step "candidates" at 0s; NOT MOUNTED at 43.0s;
   *                              "basics" at 43.5s; again NOT MOUNTED at 106.8s;
   *                              "basics" at 107.0s
   *
   * Recurring, but not on a fixed period (~43s then ~64s later; ~80s in the
   * other run) — likely an auth-token refresh or query invalidation remounting
   * the subtree rather than a plain timer. This also explains why the original
   * sighting resisted reproduction: those attempts dwelled only 51.7s and 25s.
   *
   * NOT_MEASURED POST-MIGRATION: those measurements predate the TanStack
   * Start SSR migration of the deploy branch (2026-08-02). Whether the
   * remount still occurs after the migration has not been measured — this
   * guard stays opt-in until a post-migration run establishes it either way.
   *
   * 150s covers two observed (pre-migration) cycles with margin.
   */
  test("wizard keeps its step and typed values while idle for 150s", async ({ page }) => {
    test.setTimeout(300_000);
    const growId = await discoverFixtureGrowId(page);

    await page.goto(`${BASE_URL}/pheno-hunts/new?growId=${growId}`);
    await expect(page.getByTestId("pheno-hunt-onboarding")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("ph-notes-input").fill("F13 remount guard — must survive idle");
    await page.getByTestId("pheno-step-next").click();
    await expect(page.getByTestId("pheno-step-candidates")).toBeVisible({ timeout: 15_000 });

    // Idle. No clicks, no navigation, no reload.
    await page.waitForTimeout(150_000);

    await expect(
      page.getByTestId("pheno-step-candidates"),
      "stepper must not silently reset to step 1 while idle",
    ).toBeVisible();
    await expect(page.getByTestId("pheno-step-basics")).toHaveCount(0);
    await expect(
      page.getByTestId("ph-notes-input"),
      "typed notes must not be discarded by a background remount",
    ).toHaveValue(/F13 remount guard/);
  });
});
