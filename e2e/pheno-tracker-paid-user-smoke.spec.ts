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

function resolveSession(envName: string): { path?: string; skipReason?: string } {
  const raw = process.env[envName];
  if (!raw || raw.trim() === "") {
    return { skipReason: `SKIPPED: ${envName} not set. See docs/e2e-tests.md.` };
  }
  if (!fs.existsSync(raw)) {
    return { skipReason: `SKIPPED: ${envName} points to unreadable file.` };
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
  const snapPath = session.path.replace(/\.json$/, ".session-storage.json");
  test.beforeEach(async ({ context }) => {
    if (!fs.existsSync(snapPath)) return;
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

// ─── A. Free user gate ────────────────────────────────────────────────────
test.describe("A. Free user gate", () => {
  bindRoleSession(FREE_SESSION);

  test("Free user cannot reach /pheno-hunts/new; upgrade CTA preserves returnTo", async ({ page }) => {
    await page.goto("/pheno-hunts/new");
    const currentUrl = page.url();
    if (currentUrl.includes("/auth")) {
      expect(currentUrl).toContain("redirectTo=");
      expect(decodeURIComponent(currentUrl)).toContain("/pheno-hunts/new");
      return;
    }
    await expect(page.getByTestId("pheno-hunt-create-form")).toHaveCount(0);
    const upgradeCtas = page.getByRole("link", { name: /upgrade|go pro|start pro/i });
    if (await upgradeCtas.count()) {
      const href = await upgradeCtas.first().getAttribute("href");
      expect(href, "Upgrade CTA must forward returnTo=/pheno-hunts/new").toMatch(
        /returnTo=%2Fpheno-hunts%2Fnew/,
      );
    }
  });
});

// ─── B. CheckoutSuccess sanitizer (anonymous is fine) ─────────────────────
test.describe("B. CheckoutSuccess sanitizer", () => {
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
    await expect(page.getByTestId("pheno-hunt-create-form")).toHaveCount(0);
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

  test("D+E. workspace shows disabled Compare and inert missing-evidence anchors", async ({ page }) => {
    await page.goto(`/pheno-hunts/${MISSING_EVIDENCE_HUNT}/workspace`);
    expect(page.url(), "paid session should not bounce to /auth").not.toContain("/auth");
    const compareBtn = page.getByRole("button", { name: /compare candidates/i });
    if (await compareBtn.count()) {
      await expect(compareBtn.first()).toBeDisabled();
    }
    await assertNoForbiddenCopy(page);
  });

  test("F. direct /compare on incomplete hunt shows not-ready warning and fires no compare requests", async ({ page }) => {
    const compareRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (/compare-candidates|pheno-rank|keeper-recommendation|comparison-verdict/i.test(url)) {
        compareRequests.push(url);
      }
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

  test("workspace enables Compare and /compare renders read-only comparison", async ({ page }) => {
    await page.goto(`/pheno-hunts/${COMPARISON_READY_HUNT}/workspace`);
    expect(page.url()).not.toContain("/auth");
    const compareBtn = page.getByRole("button", { name: /compare candidates/i });
    if (await compareBtn.count()) {
      await expect(compareBtn.first()).toBeEnabled();
    }
    await page.goto(`/pheno-hunts/${COMPARISON_READY_HUNT}/compare`);
    await expect(page.locator("body")).not.toContainText(/not comparison[- ]ready/i);
    await assertNoForbiddenCopy(page);
  });
});

// ─── I. Regression: dashboard still resolves ──────────────────────────────
test.describe("I. Core one-tent regression", () => {
  test("dashboard route still resolves without a crash", async ({ page }) => {
    await page.goto("/dashboard");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);
    expect(bodyText).not.toMatch(/something went wrong/i);
  });
});
