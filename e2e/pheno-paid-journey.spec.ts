/**
 * pheno-paid-journey — the full paid-user Pheno Tracker smoke against the
 * DEPLOYED app.
 *
 * Path under proof:
 *   Free user → Upgrade returnTo → [operator grants Pro] → gate opens →
 *   Create Pheno Hunt (guided stepper) → Workspace progress card →
 *   Compare disabled until evidence → evidence recorded per the readiness
 *   ladder → Compare enabled only when comparison-ready.
 *
 * Two phases, selected by E2E_PHENO_PHASE (skipped entirely when unset so
 * the default quicklog smoke stays untouched):
 *   free — fixture account has NO Pro entitlement. Asserts the gate blocks
 *          /pheno-hunts/new and the upgrade CTA carries returnTo to the
 *          LIVE /pricing checkout page.
 *   paid — operator has seeded an active Pro billing row for the fixture
 *          (server-side; no real purchase) AND >=2 plants exist in the
 *          fixture grow. Asserts the gate opens and runs the create →
 *          workspace → evidence → compare-enabled ladder end to end.
 *
 * The spec never touches billing itself: entitlement flips are operator
 * seeds via service role, matching how CheckoutSuccess-confirmed users look
 * to the app. One-Tent Loop regression is covered by re-running the
 * standard quicklog smoke after this suite (see docs in the PR).
 */
import { test, expect, type Page } from "./lib/authedTest";

const PHASE = process.env.E2E_PHENO_PHASE ?? "";
const BASE_URL = process.env.E2E_BASE_URL ?? "";

test.skip(
  PHASE !== "free" && PHASE !== "paid",
  "E2E_PHENO_PHASE not set (free|paid) — pheno paid-journey smoke is opt-in",
);

test.describe.configure({ mode: "serial" });

async function discoverFixtureGrowId(page: Page): Promise<string> {
  await page.goto(`${BASE_URL}/grows`);
  const growLink = page.locator('a[href^="/grows/"]').first();
  await expect(growLink, "fixture account must have a grow").toBeVisible({
    timeout: 15_000,
  });
  const href = await growLink.getAttribute("href");
  const m = href?.match(/^\/grows\/([0-9a-f-]{36})$/i);
  expect(m, `grow link href must carry a uuid (got ${href})`).toBeTruthy();
  return m![1];
}

test.describe("Phase FREE — gate blocks and upgrade CTA round-trips", () => {
  test.skip(PHASE !== "free", "free phase only");

  test("free user hits the Pro gate on /pheno-hunts/new", async ({ page }) => {
    await page.goto(`${BASE_URL}/pheno-hunts/new`);
    const gate = page.getByTestId("pheno-tracker-upgrade-gate");
    await expect(gate, "free fixture must see the upgrade gate").toBeVisible({
      timeout: 15_000,
    });
    // The stepper must NOT mount for a free user.
    await expect(page.getByTestId("pheno-hunt-onboarding")).toHaveCount(0);
  });

  test("upgrade CTA targets live /pricing and carries returnTo", async ({ page }) => {
    await page.goto(`${BASE_URL}/pheno-hunts/new`);
    const upgrade = page.getByTestId("pheno-tracker-upgrade-gate-upgrade-link");
    await expect(upgrade).toBeVisible({ timeout: 15_000 });
    const href = await upgrade.getAttribute("href");
    expect(href, "CTA must point at live checkout, not the dead /upgrade").toMatch(
      /^\/pricing\?returnTo=%2Fpheno-hunts%2Fnew/,
    );
    await upgrade.click();
    await expect(page).toHaveURL(/\/pricing\?returnTo=/);
    // Live checkout surface renders (plan CTAs present, not a 404).
    await expect(
      page.getByText(/pro/i).first(),
      "pricing page must render plan content",
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Phase PAID — entitled fixture runs create → evidence → compare", () => {
  test.skip(PHASE !== "paid", "paid phase only");

  let growId = "";
  let huntId = "";
  const candidateIds: string[] = [];

  test("gate opens for the entitled fixture", async ({ page }) => {
    growId = await discoverFixtureGrowId(page);
    await page.goto(`${BASE_URL}/pheno-hunts/new?growId=${growId}`);
    await expect(
      page.getByTestId("pheno-hunt-onboarding"),
      "Pro entitlement must open the guided stepper",
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("pheno-tracker-upgrade-gate")).toHaveCount(0);
  });

  test("guided stepper creates a hunt with 2 candidates and goals", async ({ page }) => {
    expect(growId, "previous step must have discovered the grow").toBeTruthy();
    await page.goto(`${BASE_URL}/pheno-hunts/new?growId=${growId}`);
    await expect(page.getByTestId("pheno-step-basics")).toBeVisible({ timeout: 15_000 });

    // Basics: name is prefilled from the grow; add a note.
    await expect(page.getByTestId("ph-name-input")).not.toHaveValue("");
    await page
      .getByTestId("ph-notes-input")
      .fill("E2E paid-journey smoke — safe to delete");
    await page.getByTestId("pheno-step-next").click();

    // Candidates: needs >=2 plants (operator-seeded precondition).
    await expect(page.getByTestId("pheno-step-candidates")).toBeVisible();
    const toggles = page.locator('[data-testid^="ph-toggle-"]');
    const count = await toggles.count();
    expect(
      count,
      "fixture grow needs >=2 plants seeded for the compare ladder",
    ).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 2; i += 1) {
      const toggle = toggles.nth(i);
      const tid = await toggle.getAttribute("data-testid");
      candidateIds.push(tid!.replace("ph-toggle-", ""));
      await toggle.click();
    }
    await page.getByTestId("pheno-step-next").click();

    // Goals: defaults are non-empty; ensure at least one is selected.
    await expect(page.getByTestId("pheno-step-goals")).toBeVisible();
    const pressedGoals = page.locator(
      '[data-testid^="pheno-evidence-goals-toggle-"][aria-pressed="true"], [data-testid^="pheno-evidence-goals-toggle-"][data-state="on"], [data-testid^="pheno-evidence-goals-toggle-"]:checked',
    );
    if ((await pressedGoals.count()) === 0) {
      await page.locator('[data-testid^="pheno-evidence-goals-toggle-"]').first().click();
    }
    await page.getByTestId("pheno-step-next").click();

    // Packet preview: always shows Not-recorded cells pre-evidence.
    await expect(page.getByTestId("pheno-step-packet-preview")).toBeVisible();
    await page.getByTestId("pheno-step-next").click();

    // Checklist → confirmation.
    await expect(page.getByTestId("pheno-step-checklist")).toBeVisible();
    await page.getByTestId("pheno-step-next").click();
    await expect(page.getByTestId("pheno-step-confirmation")).toBeVisible();
    await page.getByTestId("pheno-setup-confirm-toggle").check();

    await page.getByTestId("ph-save-btn").click();
    await page.waitForURL(/\/pheno-hunts\/[0-9a-f-]{36}\/workspace/, {
      timeout: 20_000,
    });
    huntId = page.url().match(/\/pheno-hunts\/([0-9a-f-]{36})\/workspace/)![1];
  });

  test("workspace shows progress; Compare is disabled until evidence", async ({ page }) => {
    expect(huntId).toBeTruthy();
    await page.goto(`${BASE_URL}/pheno-hunts/${huntId}/workspace`);
    await expect(page.getByTestId("pheno-workspace")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("pheno-workspace-setup-progress")).toBeVisible();
    // Setup complete ≠ comparison-ready: the action must be the disabled
    // variant with helper text, never a live compare link.
    await expect(page.getByTestId("pheno-workspace-compare-action-disabled")).toBeVisible();
    await expect(page.getByTestId("pheno-workspace-compare-action-link")).toHaveCount(0);
    await expect(page.getByTestId("pheno-workspace-compare-action-helper")).toBeVisible();
  });

  test("recording the evidence ladder enables Compare only when ready", async ({ page }) => {
    expect(huntId).toBeTruthy();
    expect(candidateIds.length).toBe(2);
    await page.goto(`${BASE_URL}/pheno-hunts/${huntId}/workspace`);
    await expect(page.getByTestId("pheno-workspace")).toBeVisible({ timeout: 20_000 });

    // 1) Phenotype note for EVERY candidate (partial notes must not enable).
    for (const [i, id] of candidateIds.entries()) {
      await page
        .getByTestId(`workspace-note-${id}`)
        .fill(`E2E phenotype note candidate ${i + 1}`);
      await page.getByTestId(`workspace-save-${id}`).click();
      await expect(page.getByTestId(`workspace-saved-${id}`)).toBeVisible({
        timeout: 10_000,
      });
      // Still disabled after the first candidate's note — the ladder demands
      // notes on all candidates before harvest/cure evidence even counts.
      await expect(
        page.getByTestId("pheno-workspace-compare-action-disabled"),
      ).toBeVisible();
    }

    // 2) Post-harvest signal: a real keeper decision on one candidate.
    const decided = candidateIds[0];
    await page.getByTestId(`workspace-decision-${decided}`).selectOption("keep");
    await page.getByTestId(`workspace-save-${decided}`).click();
    await expect(page.getByTestId(`workspace-saved-${decided}`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByTestId("pheno-workspace-compare-action-disabled"),
      "harvest signal alone must not enable compare (post-cure still missing)",
    ).toBeVisible();

    // 3) Post-cure signal: smoke test verdict on one candidate.
    await page.getByTestId(`workspace-smoke-${decided}`).locator("summary").click();
    await page
      .getByTestId(`workspace-smoke-verdict-${decided}`)
      .fill("E2E smoke verdict — bright citrus");
    await page.getByTestId(`workspace-save-smoke-${decided}`).click();

    // Now — and only now — the compare action flips to the live link.
    const compareLink = page.getByTestId("pheno-workspace-compare-action-link");
    await expect(compareLink, "full evidence ladder must enable Compare").toBeVisible({
      timeout: 15_000,
    });
    const compareHref = await compareLink.locator("a").getAttribute("href");
    expect(compareHref).toBe(`/pheno-hunts/${huntId}/compare`);

    // 4) Compare page opens with real content (not the disabled state).
    await compareLink.locator("a").click();
    await page.waitForURL(new RegExp(`/pheno-hunts/${huntId}/compare`), {
      timeout: 20_000,
    });
    await expect(page.getByText(/not comparison-ready/i)).toHaveCount(0);
  });
});
