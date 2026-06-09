// Non-destructive Playwright smoke for auth loading labels + disabled buttons.
//
// SAFETY:
//  - No real account creation.
//  - No real reset email.
//  - No real Supabase auth calls — all auth endpoints are intercepted via
//    page.route() and fulfilled with safe mocked responses.
//  - No service_role, no auth bypass, no token logging.
//
// Coverage:
//  - Sign in button: "Signing in…" + disabled while pending, then resolves.
//  - Create account button: "Creating account…" + disabled while pending.
//  - Forgot password button: "Sending reset link…" + disabled while pending.
//  - Reset password loading state is covered by Vitest because /reset-password
//    requires a real recovery hash exchange to enter the form state; mocking
//    that safely through Playwright would require token injection. See
//    src/test/auth-a11y.test.tsx and src/test/auth-message-announcements.test.tsx.
import { test, expect, type Route } from "@playwright/test";

const SAFE_EMAIL = "playwright-e2e-noop@example.invalid";
const SAFE_PASSWORD = "playwright-noop-1";

/**
 * Hold a Supabase auth POST open until we release it, then fulfill with a
 * benign response. Returns a `release` function.
 */
function holdSupabaseAuth(
  page: import("@playwright/test").Page,
  pathFragment: RegExp,
  responseBody: unknown,
  status = 200,
) {
  let release: () => void = () => {};
  const gate = new Promise<void>((res) => {
    release = res;
  });
  page.route(/\/auth\/v1\//, async (route: Route) => {
    const req = route.request();
    if (req.method() === "POST" && pathFragment.test(req.url())) {
      await gate;
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(responseBody),
      });
      return;
    }
    // Pass everything else through unchanged.
    await route.fallback();
  });
  return release;
}

test.beforeEach(async ({ page }) => {
  // Block all outbound auth traffic by default so a stray click can never
  // hit real Supabase. Each test re-installs a scoped route for its case.
  await page.route(/\/auth\/v1\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    }),
  );
});

test.describe("Auth loading/disabled smoke (mocked)", () => {
  test("Sign in shows loading label and disables while pending", async ({ page }) => {
    const release = holdSupabaseAuth(
      page,
      /token\?grant_type=password|\/token/i,
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
    // Double-submit guard: clicking again while disabled is a no-op.
    await loading.click({ force: true }).catch(() => {});
    await expect(loading).toBeDisabled();
    release();
    await expect(page.getByRole("alert")).toContainText(/couldn['’]t sign you in/i);
  });

  test("Create account shows loading label and disables while pending", async ({
    page,
  }) => {
    const release = holdSupabaseAuth(
      page,
      /signup/i,
      { error: "signup_disabled", error_description: "Test" },
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
    release();
  });

  test("Forgot password shows loading label and disables while pending", async ({
    page,
  }) => {
    const release = holdSupabaseAuth(
      page,
      /recover/i,
      {},
      200,
    );
    await page.goto("/auth");
    await page.getByRole("tab", { name: /forgot password/i }).click();
    await page.getByLabel(/email/i).fill(SAFE_EMAIL);
    const button = page.getByRole("button", { name: /send reset link/i });
    await button.click();
    const loading = page.getByRole("button", { name: /sending reset link…/i });
    await expect(loading).toBeVisible();
    await expect(loading).toBeDisabled();
    release();
    await expect(page.getByText(/if an account exists for that email/i)).toBeVisible();
  });
});
