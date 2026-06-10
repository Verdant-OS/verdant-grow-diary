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

// Representative protected/operator/internal mobile coverage. Kept in sync
// with src/lib/appRouteManifest.ts via src/test/operator-route-mobile-coverage.test.ts.
// IMPORTANT: every operator + internal route in APP_ROUTES must be listed here.
const PROTECTED_MOBILE_ROUTES: string[] = [
  // operator
  "/diagnostics",
  "/imports/representative-csv",
  "/ingest-inspector",
  "/operator/ecowitt",
  "/operator/one-tent-proof-record",
  "/pi-ingest-status",
  "/sensors/csv-preview",
  "/sensors/ecowitt-audit",
  "/sensors/ingest-normalizer",
  // internal
  "/admin/leads",
  "/grow-lineage",
  "/leads",
  // representative auth-gated surfaces
  "/",
  "/actions",
  "/sensors",
  "/settings",
];

const PUBLIC_MOBILE_ROUTES: string[] = [
  "/welcome",
  "/pricing",
  "/hardware-integrations",
  "/partners/csv-preview",
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
  test.beforeEach(async ({ page }) => {
    await mockAllSupabase(page);
  });

  for (const path of PROTECTED_MOBILE_ROUTES) {
    test(`mobile signed-out → ${path} redirects to /auth and makes no private REST hits`, async ({
      page,
      baseURL,
    }) => {
      const privateHits: string[] = [];
      await page.route(/\/rest\/v1\//, (route, req) => {
        const u = req.url();
        if (PRIVATE_TABLES.some((t) => u.includes(`/rest/v1/${t}`))) {
          privateHits.push(u);
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      });
      await page.goto(path);
      await page.waitForURL((u) => u.pathname === "/auth", { timeout: 8000 });
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
      await page.goto(path);
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
});
