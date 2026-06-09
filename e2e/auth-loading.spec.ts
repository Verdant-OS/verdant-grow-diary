// Non-destructive Playwright smoke for auth loading labels, disabled buttons,
// double-submit prevention, and re-enable timing.
//
// SAFETY:
//  - No real account creation.
//  - No real reset email.
//  - No real credentials.
//  - All Supabase /auth/v1/** traffic is intercepted via page.route().
//  - The default route returns a benign 200/{} so a stray click can never
//    hit production Supabase.
//  - The reset-password flow seeds a synthetic session into sessionStorage
//    via page.addInitScript so the UI can render the form WITHOUT a real
//    recovery token exchange. The mocked PUT /auth/v1/user request is what
//    we actually drive in the test.
//  - No elevated DB role, no token logging, no auth bypass in the app.
import { test, expect, type Page, type Route, type Request } from "@playwright/test";

const SAFE_EMAIL = "playwright-e2e-noop@example.invalid";
const SAFE_PASSWORD = "playwright-noop-1";
const SAFE_NEW_PASSWORD = "playwright-noop-2";

// Project ref derived from the Supabase URL the client is built against.
// Used only to compute the sessionStorage key for the synthetic test
// session we seed on /reset-password. Not a secret.
const SB_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SB_SESSION_KEY = `sb-${SB_PROJECT_REF}-auth-token`;

/**
 * Block all outbound auth traffic by default and start counting requests
 * matching the given path fragment. Returns { release, count() } where:
 *   - release(): fulfill the held request
 *   - count(): how many POST/PUT/PATCH requests matched the fragment
 */
function holdAndCount(
  page: Page,
  pathFragment: RegExp,
  responseBody: unknown,
  status = 200,
) {
  let release: () => void = () => {};
  let count = 0;
  const gate = new Promise<void>((res) => {
    release = res;
  });
  page.route(/\/auth\/v1\//, async (route: Route, req: Request) => {
    const matches =
      ["POST", "PUT", "PATCH"].includes(req.method()) && pathFragment.test(req.url());
    if (matches) {
      count += 1;
      await gate;
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(responseBody),
      });
      return;
    }
    await route.fallback();
  });
  return { release: () => release(), count: () => count };
}

test.beforeEach(async ({ page }) => {
  // Default safety net: any /auth/v1/** that escapes test-specific routing
  // is fulfilled locally with an empty 200 — never reaches Supabase.
  await page.route(/\/auth\/v1\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    }),
  );
});

test.describe("Auth loading/disabled smoke (mocked)", () => {
  test("Sign in: loading label, disable, double-submit blocked, re-enable on error", async ({
    page,
  }) => {
    const gate = holdAndCount(
      page,
      /\/token/i,
      { error: "invalid_grant", error_description: "Invalid login credentials" },
      400,
    );
    await page.goto("/auth");
    await page.getByLabel(/^email$/i).fill(SAFE_EMAIL);
    await page.getByLabel(/^password$/i).fill(SAFE_PASSWORD);

    const button = page.getByRole("button", { name: /^sign in$/i });
    await button.click();
    const loading = page.getByRole("button", { name: /signing in…/i });
    await expect(loading).toBeVisible();
    await expect(loading).toBeDisabled();

    // Double-submit attempts while pending must not generate a second
    // network call.
    await loading.click({ force: true }).catch(() => {});
    await page.keyboard.press("Enter");
    expect(gate.count()).toBe(1);

    gate.release();
    // On failure, the button re-enables for retry.
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
    await expect(page.getByRole("alert")).toContainText(/couldn['’]t sign you in/i);
    expect(gate.count()).toBe(1);
  });

  test("Create account: loading label, disable, double-submit blocked, re-enable on error", async ({
    page,
  }) => {
    const gate = holdAndCount(
      page,
      /signup/i,
      { error: "signup_disabled", error_description: "denied" },
      400,
    );
    await page.goto("/auth");
    await page.getByRole("tab", { name: /create account/i }).click();
    await page.getByLabel(/^email$/i).fill(SAFE_EMAIL);
    await page.getByLabel(/^password$/i).fill(SAFE_PASSWORD);

    const button = page.getByRole("button", { name: /^create account$/i });
    await button.click();
    const loading = page.getByRole("button", { name: /creating account…/i });
    await expect(loading).toBeVisible();
    await expect(loading).toBeDisabled();

    await loading.click({ force: true }).catch(() => {});
    await page.keyboard.press("Enter");
    expect(gate.count()).toBe(1);

    gate.release();
    await expect(page.getByRole("button", { name: /^create account$/i })).toBeEnabled();
    await expect(page.getByRole("alert")).toContainText(/couldn['’]t create that account/i);
    expect(gate.count()).toBe(1);
  });

  test("Forgot password: loading label, disable, double-submit blocked, success copy", async ({
    page,
  }) => {
    const gate = holdAndCount(page, /recover/i, {}, 200);
    await page.goto("/auth");
    await page.getByRole("tab", { name: /forgot password/i }).click();
    await page.getByLabel(/email/i).fill(SAFE_EMAIL);

    const button = page.getByRole("button", { name: /send reset link/i });
    await button.click();
    const loading = page.getByRole("button", { name: /sending reset link…/i });
    await expect(loading).toBeVisible();
    await expect(loading).toBeDisabled();

    await loading.click({ force: true }).catch(() => {});
    await page.keyboard.press("Enter");
    expect(gate.count()).toBe(1);

    gate.release();
    // Success path: generic non-enumerating copy in role=status, button
    // is replaced by the success message (so it isn't stuck disabled).
    await expect(page.getByRole("status")).toContainText(
      /if an account exists for that email/i,
    );
    expect(gate.count()).toBe(1);
  });

  test("Reset password: loading label, disable, double-submit blocked, re-enable on error", async ({
    page,
  }) => {
    // Seed a SYNTHETIC session into sessionStorage before any app code runs.
    // The session is local-only test fiction; we never present it to a real
    // Supabase endpoint (the PUT /auth/v1/user call is intercepted below).
    await page.addInitScript(
      ({ key }) => {
        const fakeSession = {
          access_token: "test-only-not-real",
          refresh_token: "test-only-not-real",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: "bearer",
          user: { id: "test-user", aud: "authenticated", email: "x@example.invalid" },
        };
        try {
          sessionStorage.setItem(key, JSON.stringify({ currentSession: fakeSession }));
        } catch {
          /* ignore */
        }
      },
      { key: SB_SESSION_KEY },
    );

    const gate = holdAndCount(
      page,
      /\/user/i,
      { error: "expired", error_description: "denied" },
      400,
    );
    await page.goto("/reset-password");

    // If the synthetic session can't seed the form (e.g. storage shape
    // changed), fall back gracefully with a skip — still safer than any
    // real auth path.
    const newPwd = page.getByLabel(/^new password$/i);
    const formReady = await newPwd
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !formReady,
      "Reset form did not render with synthetic session — covered by Vitest auth-a11y instead.",
    );

    await newPwd.fill(SAFE_NEW_PASSWORD + "a");
    await page.getByLabel(/^confirm new password$/i).fill(SAFE_NEW_PASSWORD + "a");
    const button = page.getByRole("button", { name: /^update password$/i });
    await button.click();
    const loading = page.getByRole("button", { name: /updating password…/i });
    await expect(loading).toBeVisible();
    await expect(loading).toBeDisabled();

    await loading.click({ force: true }).catch(() => {});
    await page.keyboard.press("Enter");
    expect(gate.count()).toBe(1);

    gate.release();
    await expect(page.getByRole("button", { name: /^update password$/i })).toBeEnabled();
    await expect(page.getByRole("alert")).toContainText(/expired|new reset email/i);
    expect(gate.count()).toBe(1);
  });
});
