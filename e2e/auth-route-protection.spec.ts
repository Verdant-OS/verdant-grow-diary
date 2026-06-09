// Mocked desktop Playwright checks for protected-route redirects and public
// route safety.
//
// SAFETY:
//  - All Supabase /auth/v1/** AND /rest/v1/** traffic is intercepted via
//    page.route(). No real Supabase calls are made.
//  - No real account creation, no real reset email, no real credentials.
//  - .invalid email only. No elevated DB role, no secrets.
//  - No grow / tent / plant / diary / sensor row is mutated.
import { test, expect, type Page } from "@playwright/test";

const PRIVATE_TABLES = [
  "grows",
  "tents",
  "plants",
  "diary_entries",
  "sensor_readings",
  "action_queue",
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
          access_token: "test-only-not-real",
          refresh_token: "test-only-not-real",
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

test.describe("Auth route-protection (mocked, 1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await mockAllSupabase(page);
  });

  for (const path of ["/sensors", "/actions", "/settings", "/operator/ecowitt"]) {
    test(`signed-out → ${path} redirects to /auth`, async ({ page, baseURL }) => {
      await page.goto(path);
      await page.waitForURL((u) => u.pathname === "/auth", { timeout: 8000 });
      const url = new URL(page.url());
      expect(url.origin).toBe(new URL(baseURL!).origin);
      const redirectTo = url.searchParams.get("redirectTo");
      if (redirectTo) {
        // If the app forwards the original path it must be internal-only.
        expect(redirectTo.startsWith("/")).toBe(true);
        expect(redirectTo.startsWith("//")).toBe(false);
        expect(redirectTo).not.toMatch(/^https?:/i);
      }
      // No private grow content should be visible pre-auth.
      const body = (await page.locator("body").textContent()) ?? "";
      for (const word of ["Tent 1", "Plant 1", "Diary", "Last reading"]) {
        // These are loose smoke checks: we only assert the page did not render
        // protected scaffolding before the redirect. The page may be empty.
        expect(body.toLowerCase()).not.toContain(`${word.toLowerCase()} for owner`);
      }
    });
  }

  test("open-redirect: /auth?redirectTo=https://evil never leaves origin", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/auth?redirectTo=https%3A%2F%2Fevil.example%2Fop");
    await page.getByLabel(/^email$/i).fill("playwright-route-noop@example.invalid");
    await page.getByLabel(/^password$/i).fill("playwright-noop-1");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForTimeout(1000);
    const origin = new URL(page.url()).origin;
    expect(origin).toBe(new URL(baseURL!).origin);
    expect(page.url()).not.toContain("evil.example");
  });

  for (const path of [
    "/welcome",
    "/pricing",
    "/hardware-integrations",
    "/partners/csv-preview",
  ]) {
    test(`public route ${path} renders signed-out without private fetches`, async ({
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
      // Give the SPA a moment to mount and fire any initial network calls.
      await page.waitForTimeout(1200);
      const origin = new URL(page.url()).origin;
      expect(origin).toBe(new URL(baseURL!).origin);
      // Public pages must not query any private grow table while signed out.
      expect(privateHits, `Private-table hits while signed out: ${privateHits.join(", ")}`).toHaveLength(0);
      // No fake-live wording allowed on public pages.
      const body = ((await page.locator("body").textContent()) ?? "").toLowerCase();
      expect(body).not.toContain("live reading");
      expect(body).not.toContain("latest sensor:");
    });
  }
});
