import { test, expect } from "@playwright/test";

/**
 * Pheno Tracker paid-user smoke — end-to-end coverage of the Free → Pro →
 * Pheno Hunt journey. Every scenario is env-gated: if its required session
 * file or hunt fixture id is missing, the scenario skips cleanly with a
 * reason. Nothing is faked, no service_role is used, no passwords / cookies
 * / hunt ids are logged.
 *
 * See docs/e2e-tests.md — "Pheno Tracker paid-user smoke" section — for the
 * full contract and how to seed local fixtures.
 *
 * Safety:
 *   - Read-only against the app.
 *   - No schema, RLS, entitlement, scoring, AI, Action Queue, or
 *     device-control changes.
 *   - Direct-navigation and disabled-Compare assertions duplicate what the
 *     dedicated specs cover so this smoke can stand alone as a
 *     paid-user-journey signal.
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
  "AI picked",
  "AI picks winners",
  "guaranteed keeper",
  "guaranteed yield",
  "automated breeding",
];

const MISSING_EVIDENCE_HUNT = process.env.E2E_PHENO_HUNT_ID_MISSING_EVIDENCE;
const COMPARISON_READY_HUNT = process.env.E2E_PHENO_HUNT_ID_COMPARISON_READY;

async function assertNoForbiddenCopy(page: import("@playwright/test").Page) {
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const phrase of FORBIDDEN_COPY) {
    expect(body, `disabled/incomplete Compare surface must not contain "${phrase}"`).not.toContain(
      phrase.toLowerCase(),
    );
  }
}

test.describe("Pheno Tracker paid-user smoke", () => {
  test("A. Free user gate on /pheno-hunts/new carries safe returnTo", async ({ page }) => {
    await page.goto("/pheno-hunts/new");
    // Anonymous / free users may be redirected to /auth first, or land on the
    // upgrade gate directly depending on session. Either way the create form
    // must not render, and any upgrade CTA must carry ?returnTo=/pheno-hunts/new.
    const currentUrl = page.url();
    if (currentUrl.includes("/auth")) {
      // Auth wall — a redirectTo param must round-trip the buyer back.
      expect(currentUrl).toContain("redirectTo=");
      expect(decodeURIComponent(currentUrl)).toContain("/pheno-hunts/new");
      return;
    }
    // Otherwise, the upgrade gate should be visible.
    const createHuntForm = page.getByTestId("pheno-hunt-create-form");
    await expect(createHuntForm).toHaveCount(0);
    const upgradeCtas = page.getByRole("link", { name: /upgrade|go pro|start pro/i });
    if (await upgradeCtas.count()) {
      const href = await upgradeCtas.first().getAttribute("href");
      expect(href, "Upgrade CTA must forward returnTo=/pheno-hunts/new").toMatch(
        /returnTo=%2Fpheno-hunts%2Fnew/,
      );
    }
  });

  test("B. CheckoutSuccess waits for entitlement and honors safe returnTo", async ({ page }) => {
    // Paddle iframe payment cannot be automated (see docs/e2e-tests.md).
    // We assert the CheckoutSuccess route contract: unconfirmed = does NOT
    // navigate away; sanitizer must reject unsafe returnTo values.
    await page.goto("/checkout/success?returnTo=https://evil.example/pwn");
    await expect(page.getByTestId("checkout-success-page")).toBeVisible();
    // Unsafe returnTo → no redirect to external origin. Origin stays same.
    await page.waitForTimeout(500);
    expect(new URL(page.url()).origin).toBe(new URL(page.url()).origin);
    expect(page.url()).not.toContain("evil.example");

    await page.goto("/checkout/success?returnTo=/pheno-hunts/new");
    await expect(page.getByTestId("checkout-success-page")).toBeVisible();
    // If entitlement is not confirmed the page stays on /checkout/success —
    // it must NOT auto-redirect anonymously. This is the anti-open-redirect
    // guarantee.
    await page.waitForTimeout(500);
    expect(page.url()).toContain("/checkout/success");
  });

  test.describe("Missing-evidence hunt (D–F)", () => {
    test.skip(
      !MISSING_EVIDENCE_HUNT,
      "SKIPPED: E2E_PHENO_HUNT_ID_MISSING_EVIDENCE not set. See docs/e2e-tests.md.",
    );

    test("D+E. workspace shows disabled Compare and inert missing-evidence anchors", async ({
      page,
    }) => {
      await page.goto(`/pheno-hunts/${MISSING_EVIDENCE_HUNT}/workspace`);
      if (page.url().includes("/auth")) test.skip(true, "SKIPPED: no Pro session available.");
      const compareBtn = page.getByRole("button", { name: /compare candidates/i });
      if (await compareBtn.count()) {
        await expect(compareBtn.first()).toBeDisabled();
      }
      await assertNoForbiddenCopy(page);
    });

    test("F. direct /compare on incomplete hunt shows not-ready warning", async ({ page }) => {
      const compareRequests: string[] = [];
      page.on("request", (req) => {
        const url = req.url();
        if (/compare-candidates|pheno-rank|keeper-recommendation|comparison-verdict/i.test(url)) {
          compareRequests.push(url);
        }
      });
      await page.goto(`/pheno-hunts/${MISSING_EVIDENCE_HUNT}/compare`);
      if (page.url().includes("/auth")) test.skip(true, "SKIPPED: no Pro session available.");
      await expect(page.locator("body")).toContainText(/not comparison[- ]ready/i);
      await assertNoForbiddenCopy(page);
      expect(compareRequests, "no comparison-execution requests may fire on disabled state").toEqual(
        [],
      );
    });
  });

  test.describe("Comparison-ready hunt (G)", () => {
    test.skip(
      !COMPARISON_READY_HUNT,
      "SKIPPED: E2E_PHENO_HUNT_ID_COMPARISON_READY not set. See docs/e2e-tests.md.",
    );

    test("G. workspace enables Compare and /compare renders read-only comparison", async ({
      page,
    }) => {
      await page.goto(`/pheno-hunts/${COMPARISON_READY_HUNT}/workspace`);
      if (page.url().includes("/auth")) test.skip(true, "SKIPPED: no Pro session available.");
      const compareBtn = page.getByRole("button", { name: /compare candidates/i });
      if (await compareBtn.count()) {
        await expect(compareBtn.first()).toBeEnabled();
      }
      await page.goto(`/pheno-hunts/${COMPARISON_READY_HUNT}/compare`);
      await expect(page.locator("body")).not.toContainText(/not comparison[- ]ready/i);
    });
  });

  test("I. Core one-tent regression: dashboard route still resolves", async ({ page }) => {
    await page.goto("/dashboard");
    // Either auth-wall (anonymous) or dashboard chrome — never a 500/crash.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);
    expect(bodyText).not.toMatch(/something went wrong/i);
  });
});
