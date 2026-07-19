/**
 * founder-owner-prefs — mocked, non-destructive Playwright coverage for the
 * signed-in Founder owner-preferences form on /founder.
 *
 * SAFETY
 *  - No real login. Synthetic Supabase session seeded into sessionStorage,
 *    mirroring the pattern in auth-loading.spec.ts.
 *  - All /rest/v1/founders* reads and /functions/v1/save-founder-prefs
 *    invocations are intercepted via page.route(). No production data is
 *    touched. No service_role. No secrets in fixtures.
 *  - Default safety net fulfils any escaping /rest/v1/** or /functions/v1/**
 *    request with an empty 200 so a stray click can never hit the backend.
 *
 * Coverage
 *  1. Signed-out: form is not rendered on /founder.
 *  2. Signed-in confirmed founder: form renders, valid submit invokes the
 *     save-founder-prefs edge function with the parsed body, https-only
 *     validation blocks a bad link before invocation.
 *  3. Refunded seat: refund notice visible, all form controls including
 *     Save are disabled.
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const SB_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SB_SESSION_KEY = `sb-${SB_PROJECT_REF}-auth-token`;
const FIXTURE_USER_ID = "00000000-0000-4000-8000-00000000f001";

function syntheticSession() {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    access_token: "fake.access.token-not-a-real-jwt",
    refresh_token: "fake-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: nowSec + 3600,
    user: {
      id: FIXTURE_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "founder-prefs-e2e@example.invalid",
      app_metadata: { provider: "email" },
      user_metadata: {},
      created_at: new Date(nowSec * 1000).toISOString(),
    },
  };
}

async function seedSession(page: Page) {
  await page.addInitScript(
    ({ key, session }) => {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(session));
      } catch {
        // sessionStorage is per-origin; if it's not yet available (about:blank
        // init) the follow-up goto init pass will still succeed.
      }
    },
    { key: SB_SESSION_KEY, session: syntheticSession() },
  );
}

function mockFoundersReadOnce(
  page: Page,
  row: Record<string, unknown> | null,
) {
  return page.route(/\/rest\/v1\/founders(\?|$)/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(row),
    });
  });
}

test.describe("Founder owner preferences (mocked)", () => {
  test.beforeEach(async ({ page }) => {
    // Default safety net FIRST — Playwright matches routes in reverse
    // registration order (last-added wins), so more specific patterns must
    // be registered AFTER the catch-all to take precedence.
    await page.route(/\/rest\/v1\//, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      }),
    );
    await page.route(/\/functions\/v1\//, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      }),
    );
    await page.route(/\/auth\/v1\//, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      }),
    );
    // The AgreementReconsentGate reads user_agreement_acceptances on every
    // signed-in page. Without accepted rows at the current versions it mounts
    // a modal Dialog that intercepts pointer events across the viewport and
    // blocks the form beneath. Registered LAST so it wins over the catch-all.
    await page.route(
      /\/rest\/v1\/user_agreement_acceptances/,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            { agreement_type: "terms", version: "2026-07-13" },
            { agreement_type: "privacy", version: "2026-07-13" },
          ]),
        }),
    );
  });

  test("signed-out visitor does not see the owner prefs form", async ({ page }) => {
    await page.goto("/founder");
    // Public surface still renders.
    await expect(
      page.getByRole("heading", { name: /Founder settings/i }),
    ).toHaveCount(0);
    await expect(page.locator("#founder-show-on-wall")).toHaveCount(0);
    await expect(page.locator("#founder-display-name")).toHaveCount(0);
  });

  test("signed-in confirmed founder can save valid prefs", async ({ page }) => {
    await seedSession(page);
    await mockFoundersReadOnce(page, {
      founder_number: 7,
      display_name: null,
      display_style: "hidden",
      show_on_wall: false,
      optional_link: null,
      status: "confirmed",
    });

    // Capture the save-founder-prefs invocation payload.
    let savedBody: Record<string, unknown> | null = null;
    let invokeCount = 0;
    await page.route(
      /\/functions\/v1\/save-founder-prefs/,
      async (route, req) => {
        invokeCount += 1;
        try {
          savedBody = JSON.parse(req.postData() ?? "{}");
        } catch {
          savedBody = null;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      },
    );

    await page.goto("/founder");

    const heading = page.getByRole("heading", { name: /Your Founder settings/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Founder #7/i)).toBeVisible();

    // Some /founder surfaces (share card, portals) mount overlays that
    // intercept pointer events regardless of z-order. Drop any full-screen
    // overlay before driving the form.
    async function clearOverlays() {
      await page.evaluate(() => {
        document
          .querySelectorAll<HTMLElement>('div.fixed.inset-0.z-50')
          .forEach((el) => el.remove());
      });
    }
    await page.keyboard.press("Escape");
    await clearOverlays();
    await heading.scrollIntoViewIfNeeded();

    // Fill in a valid custom-name profile.
    await page.locator("#founder-show-on-wall").click({ force: true });
    await page.locator("#founder-display-name").fill("Jane Cultivator");
    await page.locator("#founder-optional-link").fill("https://example.com/jane");
    await clearOverlays();

    // Programmatic form.requestSubmit() so the real submit event fires even
    // if a portalled overlay would otherwise steal the click.
    async function submitForm() {
      await page.locator("form:has(#founder-show-on-wall)").evaluate((f) => {
        (f as HTMLFormElement).requestSubmit();
      });
    }

    // https-only client validation: an http:// value must NOT invoke.
    await page.locator("#founder-optional-link").fill("http://insecure.example");
    await submitForm();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(invokeCount).toBe(0);

    // Fix and re-submit.
    await page.locator("#founder-optional-link").fill("https://example.com/jane");
    await submitForm();

    await expect
      .poll(() => invokeCount, { timeout: 5_000 })
      .toBe(1);
    expect(savedBody).toMatchObject({
      display_name: "Jane Cultivator",
      show_on_wall: true,
      optional_link: "https://example.com/jane",
    });
  });

  test("refunded seat locks the form and disables submit", async ({ page }) => {
    await seedSession(page);
    await mockFoundersReadOnce(page, {
      founder_number: 12,
      display_name: "Prior Name",
      display_style: "custom_name",
      show_on_wall: true,
      optional_link: null,
      status: "refunded",
    });

    let invokeCount = 0;
    await page.route(
      /\/functions\/v1\/save-founder-prefs/,
      async (route) => {
        invokeCount += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      },
    );

    await page.goto("/founder");

    await expect(
      page.getByRole("heading", { name: /Your Founder settings/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Founder seat has been refunded/i),
    ).toBeVisible();

    await expect(page.locator("#founder-show-on-wall")).toBeDisabled();
    await expect(page.locator("#founder-display-name")).toBeDisabled();
    await expect(page.locator("#founder-optional-link")).toBeDisabled();
    const save = page.getByRole("button", { name: /Save Founder settings/i });
    await expect(save).toBeDisabled();

    // Force-clicking a disabled button must not trigger the edge function.
    await save.click({ force: true }).catch(() => {});
    expect(invokeCount).toBe(0);
  });

  test("edge function 500 surfaces inline error and does NOT refetch", async ({ page }) => {
    await seedSession(page);

    // Count founders reads so we can assert no refetch after a failed save.
    let foundersReadCount = 0;
    await page.route(/\/rest\/v1\/founders(\?|$)/, async (route: Route) => {
      foundersReadCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          founder_number: 9,
          display_name: null,
          display_style: "hidden",
          show_on_wall: false,
          optional_link: null,
          status: "confirmed",
        }),
      });
    });

    // save-founder-prefs returns a 500 edge failure.
    let invokeCount = 0;
    await page.route(
      /\/functions\/v1\/save-founder-prefs/,
      async (route) => {
        invokeCount += 1;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "internal edge failure" }),
        });
      },
    );

    await page.goto("/founder");

    const heading = page.getByRole("heading", { name: /Your Founder settings/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Snapshot the mount-time read count before the failing submit.
    const readsBeforeSubmit = foundersReadCount;
    expect(readsBeforeSubmit).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      document
        .querySelectorAll<HTMLElement>('div.fixed.inset-0.z-50')
        .forEach((el) => el.remove());
    });
    await heading.scrollIntoViewIfNeeded();

    // Valid client-side payload so the edge function is actually invoked.
    await page.locator("#founder-show-on-wall").click({ force: true });
    await page.locator("#founder-display-name").fill("Jane Cultivator");

    await page.locator("form:has(#founder-show-on-wall)").evaluate((f) => {
      (f as HTMLFormElement).requestSubmit();
    });

    // Edge function was called exactly once and returned 500.
    await expect.poll(() => invokeCount, { timeout: 5_000 }).toBe(1);

    // Inline error alert is visible with a message from the failure path.
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/internal edge failure|Could not save|Edge Function/i);

    // Destructive toast surfaced (title appears in both toast body and
    // the aria-live announcer, so scope to the first match).
    await expect(
      page.getByText(/Could not save Founder settings/i).first(),
    ).toBeVisible();

    // Give any stray refetch a chance to fire, then assert none did.
    await page.waitForTimeout(500);
    expect(foundersReadCount).toBe(readsBeforeSubmit);

    // Save button is re-enabled (saving flag cleared) so the user can retry.
    await expect(
      page.getByRole("button", { name: /Save Founder settings/i }),
    ).toBeEnabled();
  });
});
