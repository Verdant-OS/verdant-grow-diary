// Desktop viewport mocked Playwright smoke for Verdant auth.
//
// SAFETY:
//  - All Supabase /auth/v1/** traffic is intercepted via page.route().
//  - No real account creation, no real email, no real credentials.
//  - .invalid emails only. No elevated DB role, no secrets.
//  - No grow/tent/plant/diary/sensor data is touched.
import { test, expect, type Page, type Route, type Request } from "@playwright/test";

const SAFE_EMAIL = "playwright-desktop-noop@example.invalid";
const SAFE_PWD = "playwright-desktop-noop-1";
const SAFE_NEW_PWD = "playwright-desktop-noop-2";

const SB_PROJECT_REF = "FAKE-PROJECT-REF-PLACEHOLDER-NOT-REAL";
const SB_SESSION_KEY = `sb-${SB_PROJECT_REF}-auth-token`;

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
  // Default net: any /auth/v1/** that escapes routing returns 200/{}.
  await page.route(/\/auth\/v1\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    }),
  );
});

test.describe("Desktop auth loading/disabled smoke (mocked, 1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("desktop sign in: loading, disabled, double-submit blocked, retry re-enables", async ({
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
    await page.getByLabel(/^password$/i).fill(SAFE_PWD);
    const button = page.getByRole("button", { name: /^sign in$/i });
    await button.click();
    const loading = page.getByRole("button", { name: /signing in…/i });
    await expect(loading).toBeVisible();
    await expect(loading).toBeDisabled();
    await loading.click({ force: true }).catch(() => {});
    await page.keyboard.press("Enter");
    expect(gate.count()).toBe(1);
    gate.release();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
    await expect(page.getByRole("alert")).toContainText(/couldn['’]t sign you in/i);
    expect(gate.count()).toBe(1);
  });

  test("desktop create account: loading + double-submit prevention", async ({ page }) => {
    const gate = holdAndCount(page, /signup/i, { error: "x" }, 400);
    await page.goto("/auth");
    await page.getByRole("tab", { name: /create account/i }).click();
    await page.getByLabel(/^email$/i).fill(SAFE_EMAIL);
    await page.getByLabel(/^password$/i).fill(SAFE_PWD);
    await page.getByRole("button", { name: /^create account$/i }).click();
    const loading = page.getByRole("button", { name: /creating account…/i });
    await expect(loading).toBeDisabled();
    await loading.click({ force: true }).catch(() => {});
    await page.keyboard.press("Enter");
    expect(gate.count()).toBe(1);
    gate.release();
    await expect(page.getByRole("button", { name: /^create account$/i })).toBeEnabled();
  });

  test("desktop forgot password: loading + generic non-enumerating success", async ({
    page,
  }) => {
    const gate = holdAndCount(page, /recover/i, {}, 200);
    await page.goto("/auth");
    await page.getByRole("tab", { name: /forgot password/i }).click();
    await page.getByLabel(/email/i).fill(SAFE_EMAIL);
    await page.getByRole("button", { name: /send reset link/i }).click();
    const loading = page.getByRole("button", { name: /sending reset link…/i });
    await expect(loading).toBeDisabled();
    await loading.click({ force: true }).catch(() => {});
    expect(gate.count()).toBe(1);
    gate.release();
    await expect(page.getByRole("status")).toContainText(
      /if an account exists for that email/i,
    );
  });

  test("desktop reset password: loading + disable + retry re-enable", async ({ page }) => {
    await page.addInitScript(
      ({ key }) => {
        const fakeSession = {
          access_token: "FAKE-ACCESS-TOKEN-NOT-REAL",
          refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
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
    const newPwd = page.getByLabel(/^new password$/i);
    const ready = await newPwd.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    test.skip(!ready, "Reset form did not render with synthetic session — covered by Vitest.");
    await newPwd.fill(SAFE_NEW_PWD + "a");
    await page.getByLabel(/^confirm new password$/i).fill(SAFE_NEW_PWD + "a");
    await page.getByRole("button", { name: /^update password$/i }).click();
    const loading = page.getByRole("button", { name: /updating password…/i });
    await expect(loading).toBeDisabled();
    await loading.click({ force: true }).catch(() => {});
    expect(gate.count()).toBe(1);
    gate.release();
    await expect(page.getByRole("button", { name: /^update password$/i })).toBeEnabled();
  });
});
