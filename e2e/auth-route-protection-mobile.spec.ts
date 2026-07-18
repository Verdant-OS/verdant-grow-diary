// Mocked MOBILE Playwright checks for protected-route redirects and public
// route safety. Mirrors e2e/auth-route-protection.spec.ts at 390x844 with
// isMobile + hasTouch to catch mobile-only regressions in the auth gate.
//
// SAFETY:
//  - All Supabase /auth/v1/** AND /rest/v1/** traffic is intercepted via
//    page.route(). No real Supabase calls are made.
//  - No real account creation, no real reset email, no real credentials.
//  - .invalid email only. No elevated DB role, no secrets.
//  - No grow / tent / plant / diary / sensor row is mutated.
import { test, expect, type Page, devices } from "@playwright/test";

const PRIVATE_TABLES = [
  "grows",
  "tents",
  "plants",
  "diary_entries",
  "sensor_readings",
  "action_queue",
];

const PROTECTED_TABLES = [...PRIVATE_TABLES, "pheno_hunts", "pheno_keepers"];

// Representative protected/operator/internal mobile coverage. Kept in sync
// with src/lib/appRouteManifest.ts via src/test/operator-route-mobile-coverage.test.ts.
// IMPORTANT: every operator + internal route in APP_ROUTES must be listed here.
const PROTECTED_MOBILE_ROUTES: string[] = [
  // operator
  "/diagnostics",
  "/ingest-inspector",
  "/operator/ai-doctor-phase1",
  "/operator/billing-entitlement-resolution",
  "/operator/billing-subscription-updates",
  "/operator/ecowitt",
  "/operator/ecowitt-bridge-status",
  "/operator/ecowitt-bridge-debug",
  "/operator/ecowitt-live-bringup",
  "/operator/ecowitt-tent-preview",
  "/operator/ggs-real-payload-ingest",
  "/demo/one-tent-live-proof",
  "/operator/one-tent-live-proof",
  "/operator/one-tent-loop-smoke-test",
  "/operator/one-tent-proof-record",
  "/operator/paddle-processing-audit",
  "/operator/post-grow-reflection-dry-run",
  "/operator/release-readiness",
  "/operator/subscriber-growth",
  "/operator/demo-preview",

  "/pi-ingest-status",
  "/sensors/ecowitt-audit",
  "/sensors/ingest-normalizer",
  // internal
  "/admin/leads",
  "/grow-lineage",
  "/internal/ai-doctor-confidence-audit",
  "/internal/ai-doctor-phase1-preview",
  "/internal/one-tent-loop-proof",
  "/internal/sensor-truth-audit",
  "/leads",
  "/one-tent-loop-proof",
  // representative auth-gated surfaces
  "/actions",
  "/sensors",
  "/settings",
  // write-capable pheno hunt surfaces — moved behind the auth gate
  "/pheno-hunts",
  "/pheno-hunts/new",
  "/pheno-hunts/:id/workspace",
  "/pheno-hunts/:id/keepers",
];

const PUBLIC_MOBILE_ROUTES: string[] = [
  "/",
  "/welcome",
  "/pricing",
  "/hardware-integrations",
  "/guides",
  "/guides/:slug",
  "/guides/grow-stage-care-guide",
  "/cultivars",
  // Template entry satisfies the manifest coverage guard; ":slug" resolves
  // to the unknown-slug redirect, so also exercise a real detail page.
  "/cultivars/:slug",
  "/cultivars/oreoz",
  "/ai-doctor-readiness-check",
  "/founder",
  "/how-ai-doctor-works",
  "/partners/csv-preview",
  "/customer/:shareId",
  "/customer/:shareId/cannabis-care",
  // Read-only Pheno Comparison preview: public, fixture-only, mounted outside
  // AuthProvider/GrowsProvider/AppShell — must render signed-out on mobile with
  // zero private-table fetches.
  "/pheno-comparison",
  "/pheno-hunts/:id/compare",
  "/.lovable/oauth/consent",
  "/breeder-beta",
  "/creator-beta",
  "/glossary",
  "/pheno-expression-showcase",
  "/upgrade",
  "/checkout/success",
  "/checkout/cancel",
  "/terms",
  "/privacy",
  "/refund",
  "/tools/vpd-calculator",
  // Public 30-second Quick Log starter: local draft only, mounted outside
  // AppShell — must render signed-out with zero private-table fetches.
  "/quick-log",
];

// Internal fixture-only demo surfaces DELIBERATELY mounted OUTSIDE AppShell
// (see App.tsx comments): they render signed-out by design so the read-only
// E2E guards can exercise them without a session. Their safety contract is
// not "redirects to /auth" but "renders fixture content with ZERO private
// REST hits". Do NOT add real operator/internal pages here — the vitest
// coverage guardrail pins this list to exactly these two routes.
const UNAUTH_FIXTURE_ROUTES: string[] = [
  "/internal/contextual-pheno-comparison-demo",
  "/internal/demo-proof-walkthrough",
];

async function mockAllSupabase(page: Page, opts: { signedIn?: boolean } = {}) {
  await page.route(/\/auth\/v1\//, async (route, req) => {
    const url = req.url();
    if (/\/user/i.test(url) && req.method() === "GET") {
      if (opts.signedIn) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "test-user-id",
            aud: "authenticated",
            email: "x@example.invalid",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "unauthorized" }),
      });
      return;
    }
    if (/\/token/i.test(url) && req.method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "FAKE-ACCESS-TOKEN-NOT-REAL",
          refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: "test-user-id",
            aud: "authenticated",
            email: "x@example.invalid",
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
  await page.route(/\/rest\/v1\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    }),
  );
}

// Mobile emulation is worker-scoped (devices["Pixel 5"] sets
// defaultBrowserType), so it must be configured at the top level of the file
// rather than inside a describe group.
test.use({
  ...devices["Pixel 5"],
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test.describe("Auth route-protection MOBILE (mocked, 390x844)", () => {
  test.beforeAll(async ({ browser, baseURL }, testInfo) => {
    // Vite's first browser-driven module graph compile can exceed the normal
    // assertion budget on a cold Windows checkout. Warm the mocked app once;
    // every actual route test keeps the standard 60-second timeout.
    testInfo.setTimeout(120_000);
    const page = await browser.newPage({ baseURL });
    try {
      await mockAllSupabase(page);
      await page.goto("/welcome", { waitUntil: "domcontentloaded", timeout: 110_000 });
    } finally {
      await page.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    await mockAllSupabase(page);
  });

  for (const path of PROTECTED_MOBILE_ROUTES) {
    test(`mobile signed-out → ${path} redirects to /welcome and makes no private REST hits`, async ({
      page,
      baseURL,
    }) => {
      const privateHits: string[] = [];
      await page.route(/\/rest\/v1\//, (route, req) => {
        const u = req.url();
        if (PROTECTED_TABLES.some((t) => u.includes(`/rest/v1/${t}`))) {
          privateHits.push(u);
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      });
      // Reliability v1: avoid waiting on full network idle (mobile cold-boot
      // for 40+ protected routes is too tight at 8s and causes repo-wide
      // flake). Use domcontentloaded for the navigation and a polling URL
      // assertion for the auth-gate redirect with a generous timeout.
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/welcome(\?|$)/, { timeout: 20_000 });
      const url = new URL(page.url());
      expect(url.origin).toBe(new URL(baseURL!).origin);
      const redirectTo = url.searchParams.get("redirectTo");
      if (redirectTo) {
        expect(redirectTo.startsWith("/")).toBe(true);
        expect(redirectTo.startsWith("//")).toBe(false);
        expect(redirectTo).not.toMatch(/^https?:/i);
      }
      expect(
        privateHits,
        `Private-table hits while signed out (mobile, ${path}): ${privateHits.join(", ")}`,
      ).toHaveLength(0);
      const body = ((await page.locator("body").textContent()) ?? "").toLowerCase();
      expect(body).not.toContain("live reading");
      expect(body).not.toContain("latest sensor:");
      for (const word of ["Tent 1", "Plant 1", "Diary"]) {
        expect(body).not.toContain(`${word.toLowerCase()} for owner`);
      }
    });
  }

  test("mobile open-redirect: /auth?redirectTo=https://evil never leaves origin", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/auth?redirectTo=https%3A%2F%2Fevil.example%2Foperator");
    await page.getByLabel(/^email$/i).fill("playwright-mobile-noop@example.invalid");
    await page.getByLabel(/^password$/i).fill("playwright-noop-1");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForTimeout(1000);
    const origin = new URL(page.url()).origin;
    expect(origin).toBe(new URL(baseURL!).origin);
    expect(page.url()).not.toContain("evil.example");
  });

  for (const path of PUBLIC_MOBILE_ROUTES) {
    test(`mobile public ${path} renders signed-out without private fetches`, async ({
      page,
      baseURL,
    }) => {
      const privateHits: string[] = [];
      await page.route(/\/rest\/v1\//, (route, req) => {
        const url = req.url();
        if (PRIVATE_TABLES.some((t) => url.includes(`/rest/v1/${t}`))) {
          privateHits.push(url);
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const origin = new URL(page.url()).origin;
      expect(origin).toBe(new URL(baseURL!).origin);
      expect(
        privateHits,
        `Private-table hits while signed out (mobile public ${path}): ${privateHits.join(", ")}`,
      ).toHaveLength(0);
      const body = ((await page.locator("body").textContent()) ?? "").toLowerCase();
      expect(body).not.toContain("live reading");
      expect(body).not.toContain("latest sensor:");
    });
  }

  for (const path of UNAUTH_FIXTURE_ROUTES) {
    test(`mobile fixture-only ${path} renders signed-out with zero private REST hits`, async ({
      page,
      baseURL,
    }) => {
      const privateHits: string[] = [];
      await page.route(/\/rest\/v1\//, (route, req) => {
        const url = req.url();
        if (PRIVATE_TABLES.some((t) => url.includes(`/rest/v1/${t}`))) {
          privateHits.push(url);
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      // Deliberately unauthenticated: the page must stay on-origin and on
      // its own path (no crash-redirect), render fixture content only, and
      // touch zero private tables.
      const url = new URL(page.url());
      expect(url.origin).toBe(new URL(baseURL!).origin);
      expect(url.pathname).toBe(path);
      expect(
        privateHits,
        `Private-table hits while signed out (mobile fixture ${path}): ${privateHits.join(", ")}`,
      ).toHaveLength(0);
      const body = ((await page.locator("body").textContent()) ?? "").toLowerCase();
      expect(body).not.toContain("live reading");
      expect(body).not.toContain("latest sensor:");
    });
  }
});
