import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/**
 * Pheno Tracker paid-user smoke — end-to-end coverage of the Free → Pro →
 * Pheno Hunt journey. Every scenario is env-gated: if its required session
 * file or hunt fixture id is missing, the scenario skips cleanly with a
 * reason. Nothing is faked, no service_role is used, no passwords / cookies
 * / hunt ids are logged.
 *
 * Session wiring:
 *   Playwright requires storageState to be resolved at module load. We read
 *   role env vars once here, validate that any file referenced actually
 *   exists (unreadable → describe is skipped, never silently ignored), then
 *   bind each describe block to its role's storageState via test.use().
 *
 * See docs/e2e-tests.md — "Pheno Tracker paid-user smoke" section — for the
 * full contract and how to seed local fixtures.
 */

const FORBIDDEN_COPY = [
  "winner",
  "winning candidate",
  "best candidate",
  "best pheno",
  "top candidate",
  "ranked candidate",
  "candidate ranking",
  "final ranking",
  "verdict",
  "final verdict",
  "comparison verdict",
  "recommended keeper",
  "keeper recommendation",
  "keeper selected",
  "keeper confirmed",
  "selection winner",
  "ai picked",
  "ai picks winners",
  "guaranteed keeper",
  "guaranteed yield",
  "automated breeding",
];

function sessionSnapshotPath(storageStatePath: string): string {
  return storageStatePath.replace(/\.json$/, ".session-storage.json");
}

function resolveSession(envName: string): { path?: string; skipReason?: string } {
  const raw = process.env[envName];
  if (!raw || raw.trim() === "") {
    return { skipReason: `SKIPPED: ${envName} not set. See docs/e2e-tests.md.` };
  }
  if (!fs.existsSync(raw)) {
    return { skipReason: `SKIPPED: ${envName} points to unreadable file.` };
  }
  // The app keeps its Supabase session in sessionStorage, which storageState
  // cannot carry — without the generator's sibling snapshot the role would
  // run ANONYMOUS and pass/fail vacuously. Treat a missing snapshot as an
  // unusable session, never a silent no-op.
  if (!fs.existsSync(sessionSnapshotPath(raw))) {
    return {
      skipReason: `SKIPPED: ${envName} has no sibling .session-storage.json — re-run test:pheno-paid-smoke:sessions.`,
    };
  }
  return { path: raw };
}

const FREE_SESSION = resolveSession("E2E_PHENO_FREE_SESSION_FILE");
const PRO_SESSION = resolveSession("E2E_PHENO_PRO_SESSION_FILE");
const FOUNDER_SESSION = resolveSession("E2E_PHENO_FOUNDER_SESSION_FILE");
const CANCELED_SESSION = resolveSession("E2E_PHENO_CANCELED_SESSION_FILE");

/**
 * Bind a role session to the current describe block.
 *
 * storageState restores only cookies + localStorage, but the app keeps its
 * Supabase session in **sessionStorage** (see e2e/lib/authedTest.ts) — so
 * test.use({ storageState }) alone leaves every page anonymous. The session
 * generator writes a sibling `<name>.session-storage.json` snapshot for each
 * role; inject it before any page script runs, scoped to the recorded origin.
 */
function bindRoleSession(session: { path?: string }) {
  if (!session.path) return;
  test.use({ storageState: session.path });
  const snapPath = sessionSnapshotPath(session.path);
  test.beforeEach(async ({ context }) => {
    if (!fs.existsSync(snapPath)) {
      // resolveSession already gates on the snapshot; if it vanished between
      // resolution and run, fail LOUDLY — a silent return here would run the
      // role anonymously and make every assertion vacuous.
      throw new Error(
        `role session snapshot disappeared: ${snapPath} — re-run test:pheno-paid-smoke:sessions.`,
      );
    }
    const saved = JSON.parse(fs.readFileSync(snapPath, "utf-8")) as {
      origin: string;
      entries: Record<string, string>;
    };
    await context.addInitScript(
      (arg: { entries: Record<string, string>; appOrigin: string }) => {
        if (window.location.origin === arg.appOrigin) {
          for (const [key, value] of Object.entries(arg.entries)) {
            window.sessionStorage.setItem(key, value);
          }
        }
      },
      { entries: saved.entries, appOrigin: saved.origin },
    );
  });
}

const MISSING_EVIDENCE_HUNT = process.env.E2E_PHENO_HUNT_ID_MISSING_EVIDENCE;
const COMPARISON_READY_HUNT = process.env.E2E_PHENO_HUNT_ID_COMPARISON_READY;

// Pick a Pro-capable session for the paid workspace scenarios: prefer Pro,
// fall back to Founder. Missing → scenarios in that block skip cleanly.
const PAID_SESSION = PRO_SESSION.path
  ? PRO_SESSION
  : FOUNDER_SESSION.path
    ? FOUNDER_SESSION
    : { skipReason: "SKIPPED: neither E2E_PHENO_PRO_SESSION_FILE nor E2E_PHENO_FOUNDER_SESSION_FILE is set." };

async function assertNoForbiddenCopy(page: Page) {
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const phrase of FORBIDDEN_COPY) {
    expect(body, `disabled/incomplete Compare surface must not contain "${phrase}"`).not.toContain(
      phrase,
    );
  }
}

// Exact disabled-reason copy pinned from the production readiness view model
// (src/lib/phenoComparisonActionState.ts + src/constants/phenoOnboardingCopy.ts),
// keyed by the compare-action section's data-readiness attribute. Asserting the
// mapped string for whichever incomplete state the fixture hunt is in detects
// wording regressions instead of merely proving the helper exists.
const DISABLED_REASON_BY_READINESS: Record<string, string> = {
  not_ready: "Add the missing evidence before comparing candidates.",
  missing_evidence: "Missing evidence",
  pending_until_harvest: "Pending until harvest",
  pending_until_cure: "Pending until cure",
};
const DISABLED_INTRO_COPY =
  "Compare candidates is disabled because this hunt is not comparison-ready yet.";
const COMPARE_EXECUTION_REQUEST =
  /compare-candidates|pheno-rank|keeper-recommendation|comparison-verdict/i;

// ─── A. Free user gate ────────────────────────────────────────────────────
test.describe("A. Free user gate", () => {
  test.skip(!FREE_SESSION.path, FREE_SESSION.skipReason ?? "SKIPPED: no Free session.");
  bindRoleSession(FREE_SESSION);

  test("Free user sees the upgrade gate on /pheno-hunts/new and the CTA returnTo round-trips to /pricing", async ({ page }) => {
    await page.goto("/pheno-hunts/new");
    // A valid Free session must land on the gated page. An /auth bounce means
    // the session is broken — that is a FAIL, never a silent pass.
    await expect(page).not.toHaveURL(/\/auth/);
    const gate = page.getByTestId("pheno-tracker-upgrade-gate");
    await expect(gate, "free user must see the upgrade gate").toBeVisible({ timeout: 20_000 });
    // The onboarding surface must not mount for a free user.
    await expect(page.getByTestId("pheno-hunt-onboarding")).toHaveCount(0);
    const cta = page.getByTestId("pheno-tracker-upgrade-gate-upgrade-link");
    await expect(cta, "upgrade CTA must exist on the gate").toBeVisible();
    // returnTo is the ONLY query param production adds (URLSearchParams).
    await expect(cta).toHaveAttribute("href", "/pricing?returnTo=%2Fpheno-hunts%2Fnew");
    const originBefore = new URL(page.url()).origin;
    await cta.click();
    await expect(page).toHaveURL(/\/pricing\?returnTo=%2Fpheno-hunts%2Fnew$/);
    expect(new URL(page.url()).origin, "CTA must never leave the app origin").toBe(originBefore);
    await expect(page).not.toHaveURL(/\/auth/);
    await expect(
      page.getByText(/pro/i).first(),
      "pricing page must render plan content",
    ).toBeVisible({ timeout: 20_000 });
  });
});

// ─── B. CheckoutSuccess sanitizer (anonymous is fine) ─────────────────────
test.describe("B. CheckoutSuccess sanitizer", () => {
  // Anonymous by design: explicit empty storage state so this describe never
  // depends on the chromium-authed project's default user.json file.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unsafe returnTo is rejected; safe returnTo does not auto-redirect anonymously", async ({ page }) => {
    await page.goto("/checkout/success?returnTo=https://evil.example/pwn");
    await expect(page.getByTestId("checkout-success-page")).toBeVisible();
    await page.waitForTimeout(400);
    // The malicious value stays inert in the query string; what matters is
    // that the browser never NAVIGATES to it — assert on origin + path, not
    // the full URL (which necessarily still contains the param we sent).
    const after = new URL(page.url());
    expect(after.hostname).not.toContain("evil.example");
    expect(after.pathname).toBe("/checkout/success");

    await page.goto("/checkout/success?returnTo=/pheno-hunts/new");
    await expect(page.getByTestId("checkout-success-page")).toBeVisible();
    await page.waitForTimeout(400);
    expect(page.url()).toContain("/checkout/success");
  });
});

// ─── C. Pro Monthly can reach paid workspace ──────────────────────────────
test.describe("C. Pro Monthly access", () => {
  test.skip(!PRO_SESSION.path, PRO_SESSION.skipReason ?? "SKIPPED: no Pro session.");
  bindRoleSession(PRO_SESSION);

  test("Pro user can load /pheno-hunts/new without auth wall", async ({ page }) => {
    await page.goto("/pheno-hunts/new");
    expect(page.url()).not.toContain("/auth");
    await assertNoForbiddenCopy(page);
  });
});

// ─── C2. Founder Lifetime can reach paid workspace ────────────────────────
test.describe("C2. Founder Lifetime access", () => {
  test.skip(!FOUNDER_SESSION.path, FOUNDER_SESSION.skipReason ?? "SKIPPED: no Founder session.");
  bindRoleSession(FOUNDER_SESSION);

  test("Founder user can load /pheno-hunts/new without auth wall", async ({ page }) => {
    await page.goto("/pheno-hunts/new");
    expect(page.url()).not.toContain("/auth");
    await assertNoForbiddenCopy(page);
  });
});

// ─── C3. Canceled/expired user is blocked ─────────────────────────────────
test.describe("C3. Canceled/expired blocked from paid pheno workspace", () => {
  test.skip(!CANCELED_SESSION.path, CANCELED_SESSION.skipReason ?? "SKIPPED: no Canceled session.");
  bindRoleSession(CANCELED_SESSION);

  test("Canceled user hitting /pheno-hunts/new sees gate, not the create form", async ({ page }) => {
    await page.goto("/pheno-hunts/new");
    // The gate must affirmatively render; the onboarding surface must not.
    // (The old absence check targeted a testid that never existed in the
    // product, so it could not fail.)
    await expect(page.getByTestId("pheno-tracker-upgrade-gate")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("pheno-hunt-onboarding")).toHaveCount(0);
    await assertNoForbiddenCopy(page);
  });
});

// ─── D–F. Missing-evidence hunt (requires paid session) ───────────────────
test.describe("D–F. Missing-evidence hunt", () => {
  test.skip(!PAID_SESSION.path, PAID_SESSION.skipReason ?? "SKIPPED: no paid session.");
  test.skip(
    !MISSING_EVIDENCE_HUNT,
    "SKIPPED: E2E_PHENO_HUNT_ID_MISSING_EVIDENCE not set. See docs/e2e-tests.md.",
  );
  bindRoleSession(PAID_SESSION);

  test("D+E. workspace shows disabled Compare with the exact not-ready reason", async ({ page }) => {
    await page.goto(`/pheno-hunts/${MISSING_EVIDENCE_HUNT}/workspace`);
    await expect(page).not.toHaveURL(/\/auth/);
    const action = page.getByTestId("pheno-workspace-compare-action");
    await expect(action, "compare action section must render").toBeVisible({ timeout: 20_000 });
    await expect(action).toHaveAttribute("data-enabled", "false");
    const disabledBtn = page.getByTestId("pheno-workspace-compare-action-disabled");
    await expect(disabledBtn, "Compare must render in the disabled state").toBeVisible();
    await expect(disabledBtn).toBeDisabled();
    // No live compare link may exist in the disabled state.
    await expect(page.getByTestId("pheno-workspace-compare-action-link")).toHaveCount(0);
    await expect(
      page.getByTestId("pheno-workspace-compare-action-helper"),
      "disabled helper must be visible",
    ).toBeVisible();
    await expect(page.getByTestId("pheno-workspace-compare-action-disabled-intro")).toHaveText(
      DISABLED_INTRO_COPY,
    );
    // Exact reason copy for whatever incomplete state the fixture is in —
    // an unmapped readiness (e.g. comparison_ready) fails loudly.
    const readiness = await action.getAttribute("data-readiness");
    const expectedReason = DISABLED_REASON_BY_READINESS[readiness ?? ""];
    expect(
      expectedReason,
      `readiness "${readiness}" is not an incomplete state with pinned reason copy`,
    ).toBeTruthy();
    await expect(page.getByTestId("pheno-workspace-compare-action-reason")).toHaveText(
      expectedReason,
    );
    await assertNoForbiddenCopy(page);
  });

  test("D+E. missing-evidence next-step anchor navigates within the workspace", async ({ page }) => {
    const compareRequests: string[] = [];
    page.on("request", (req) => {
      if (COMPARE_EXECUTION_REQUEST.test(req.url())) compareRequests.push(req.url());
    });
    await page.goto(`/pheno-hunts/${MISSING_EVIDENCE_HUNT}/workspace`);
    await expect(page).not.toHaveURL(/\/auth/);
    const action = page.getByTestId("pheno-workspace-compare-action");
    await expect(action).toBeVisible({ timeout: 20_000 });
    // Pre-click state: Compare must exist disabled with no live link.
    await expect(page.getByTestId("pheno-workspace-compare-action-disabled")).toBeDisabled();
    await expect(page.getByTestId("pheno-workspace-compare-action-link")).toHaveCount(0);
    const reasonBefore = await page
      .getByTestId("pheno-workspace-compare-action-reason")
      .innerText();

    const nextSteps = page.locator('a[data-testid^="pheno-workspace-compare-action-next-step-"]');
    await expect(
      nextSteps.first(),
      "an incomplete hunt must offer at least one missing-evidence next step",
    ).toBeVisible({ timeout: 20_000 });

    // Read the href and expected hash locally; never log either.
    const workspacePath = new URL(page.url()).pathname;
    const href = await nextSteps.first().getAttribute("href");
    expect(Boolean(href), "next-step link must carry an href").toBe(true);
    const target = new URL(href as string, page.url());
    expect(target.pathname === workspacePath, "next step must stay on the workspace route").toBe(
      true,
    );
    expect(target.hash.length > 1, "next step must carry a workspace anchor hash").toBe(true);
    expect(target.pathname.includes("/compare"), "next step must never point at /compare").toBe(
      false,
    );
    const expectedHash = target.hash;

    await nextSteps.first().click();
    await expect
      .poll(() => new URL(page.url()).hash, {
        message: "anchor click must update the URL to the workspace anchor hash",
      })
      .toBe(expectedHash);
    expect(
      new URL(page.url()).pathname === workspacePath,
      "anchor click must stay on the workspace route",
    ).toBe(true);
    // The matching target must exist. Four of the five workspace anchors are
    // intentionally zero-height placeholder divs (PhenoHuntWorkspace), so
    // Playwright visibility (non-empty bounding box) cannot be required —
    // attachment is the affirmative existence proof.
    await expect(
      page.locator(`[id="${expectedHash.slice(1)}"]`),
      "anchor target element must exist in the workspace DOM",
    ).toBeAttached();

    // Compare stays disabled and the reason copy is unchanged after navigation.
    await expect(action).toHaveAttribute("data-enabled", "false");
    await expect(page.getByTestId("pheno-workspace-compare-action-disabled")).toBeDisabled();
    await expect(page.getByTestId("pheno-workspace-compare-action-reason")).toHaveText(
      reasonBefore,
    );
    await assertNoForbiddenCopy(page);
    expect(
      compareRequests,
      "no comparison-execution requests may fire from anchor navigation",
    ).toEqual([]);
  });

  test("F. direct /compare on incomplete hunt shows not-ready warning and fires no compare requests", async ({ page }) => {
    const compareRequests: string[] = [];
    page.on("request", (req) => {
      if (COMPARE_EXECUTION_REQUEST.test(req.url())) compareRequests.push(req.url());
    });
    await page.goto(`/pheno-hunts/${MISSING_EVIDENCE_HUNT}/compare`);
    expect(page.url()).not.toContain("/auth");
    await expect(page.locator("body")).toContainText(/not comparison[- ]ready/i);
    await assertNoForbiddenCopy(page);
    expect(compareRequests, "no comparison-execution requests may fire on disabled state").toEqual([]);
  });
});

// ─── G. Comparison-ready hunt ─────────────────────────────────────────────
test.describe("G. Comparison-ready hunt", () => {
  test.skip(!PAID_SESSION.path, PAID_SESSION.skipReason ?? "SKIPPED: no paid session.");
  test.skip(
    !COMPARISON_READY_HUNT,
    "SKIPPED: E2E_PHENO_HUNT_ID_COMPARISON_READY not set. See docs/e2e-tests.md.",
  );
  bindRoleSession(PAID_SESSION);

  test("workspace enables Compare and /compare renders substantive read-only comparison", async ({ page }) => {
    await page.goto(`/pheno-hunts/${COMPARISON_READY_HUNT}/workspace`);
    await expect(page).not.toHaveURL(/\/auth/);
    const action = page.getByTestId("pheno-workspace-compare-action");
    await expect(action, "compare action section must render").toBeVisible({ timeout: 20_000 });
    await expect(action).toHaveAttribute("data-enabled", "true");
    const compareLink = page.getByTestId("pheno-workspace-compare-action-link");
    await expect(
      compareLink,
      "comparison-ready hunt must render the live Compare link",
    ).toBeVisible();
    await expect(page.getByTestId("pheno-workspace-compare-action-disabled")).toHaveCount(0);
    const linkHref = await compareLink.getAttribute("href");
    expect(
      linkHref === `/pheno-hunts/${COMPARISON_READY_HUNT}/compare`,
      "Compare link must target this hunt's compare route",
    ).toBe(true);

    await compareLink.click();
    await expect(page).toHaveURL(/\/compare$/);

    // Substantive read-only comparison content — not an empty shell.
    const main = page.getByTestId("pheno-comparison-page");
    await expect(main, "comparison page container must render").toBeVisible({ timeout: 20_000 });
    await expect(main).toHaveAttribute("data-mode", "live");
    await expect(main).toHaveAttribute("data-allow-conclusions", "true");
    await expect(page.getByTestId("pheno-hunt-compare-readiness-warning")).toHaveCount(0);
    await expect(page.getByTestId("pheno-comparison-error")).toHaveCount(0);
    const grid = page.getByTestId("pheno-comparison-grid");
    await expect(grid, "comparison grid must render").toBeVisible();
    const cards = grid.locator('> [data-testid^="pheno-candidate-"]');
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    expect(
      (await cards.count()) >= 2,
      "at least two candidate comparison surfaces must render",
    ).toBe(true);
    // Candidate labels: each card's aria heading must be visible and non-empty.
    const labels = grid.locator('[id^="pheno-candidate-"][id$="-heading"]');
    expect(
      (await labels.count()) >= 2,
      "every candidate card must expose a label heading",
    ).toBe(true);
    for (const label of [labels.nth(0), labels.nth(1)]) {
      await expect(label).toBeVisible();
      expect(
        ((await label.innerText()) ?? "").trim().length > 0,
        "candidate label must not be empty",
      ).toBe(true);
    }
    // At least one hydrated expression or evidence field for the ready fixture.
    const hydrated = main.locator(
      [
        '[data-testid$="-expression"]',
        '[data-testid^="expression-"]',
        '[data-testid^="quicklog-"]',
        '[data-testid^="timeline-"]',
        '[data-testid^="photo-"]',
        '[data-testid^="snapshot-"]',
      ].join(", "),
    );
    expect(
      (await hydrated.count()) > 0,
      "comparison-ready fixture must render hydrated expression/evidence content",
    ).toBe(true);
    // Read-only: badge visible, zero action controls inside the surface.
    await expect(page.getByTestId("pheno-comparison-read-only-badge")).toBeVisible();
    expect(
      await main.locator("button, form, input, textarea, select").count(),
      "comparison surface must be read-only",
    ).toBe(0);
    await assertNoForbiddenCopy(page);
  });
});

// ─── I. Regression: dashboard still resolves ──────────────────────────────
test.describe("I. Core one-tent regression", () => {
  // Anonymous by design (route-resolution check only).
  test.use({ storageState: { cookies: [], origins: [] } });

  test("dashboard route still resolves without a crash", async ({ page }) => {
    await page.goto("/dashboard");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);
    expect(bodyText).not.toMatch(/something went wrong/i);
  });
});
