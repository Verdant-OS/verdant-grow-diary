// Non-destructive Playwright smoke for auth loading labels, disabled buttons,
// double-submit prevention, and re-enable timing.
//
// SAFETY:
//  - No real account creation.
//  - No real reset email.
//  - No real credentials.
//  - All Supabase /auth/v1/** and /rest/v1/** traffic is intercepted via page.route().
//  - Default handlers return benign empty responses so a stray request can
//    never hit production Supabase.
//  - The reset-password flow seeds a synthetic session into sessionStorage
//    via page.addInitScript so the UI can render the form WITHOUT a real
//    recovery token exchange. The mocked PUT /auth/v1/user request is what
//    we actually drive in the test.
//  - No elevated DB role, no token logging, no auth bypass in the app.
import { test, expect, type Page, type Route, type Request } from "@playwright/test";

const SAFE_EMAIL = "playwright-e2e-noop@example.invalid";
const SAFE_PWD = "playwright-noop-1";
const SAFE_NEW_PWD = "playwright-noop-2";

// Public project ref used only to compute Supabase's sessionStorage key for
// the synthetic /reset-password session. A project ref is not a credential.
const SB_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SB_SESSION_KEY = `sb-${SB_PROJECT_REF}-auth-token`;

/**
 * Block all outbound auth traffic by default and start counting requests
 * matching the given path fragment. Returns { release, count() } where:
 *   - release(): fulfill the held request
 *   - count(): how many POST/PUT/PATCH requests matched the fragment
 */
function holdAndCount(page: Page, pathFragment: RegExp, responseBody: unknown, status = 200) {
  let release: () => void = () => {};
  let count = 0;
  const gate = new Promise<void>((res) => {
    release = res;
  });
  page.route(/\/auth\/v1\//, async (route: Route, req: Request) => {
    const matches = ["POST", "PUT", "PATCH"].includes(req.method()) && pathFragment.test(req.url());
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
  // Default safety net: any Supabase auth or data request that escapes
  // test-specific routing is fulfilled locally — never reaches Supabase.
  await page.route(/\/auth\/v1\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    }),
  );
  await page.route(/\/rest\/v1\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
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
    await page.getByLabel(/^password$/i).fill(SAFE_PWD);

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
    await page.getByLabel(/^password$/i).fill(SAFE_PWD);
    // Signup is consent-gated: without accepting the ToS/Privacy checkbox the
    // submit early-returns and the loading state never appears.
    await page.getByRole("checkbox", { name: /terms of service/i }).click();

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
    await expect(page.getByRole("status")).toContainText(/if an account exists for that email/i);
    expect(gate.count()).toBe(1);
  });

  test("Reset password: loading label, disable, double-submit blocked, re-enable on error", async ({
    page,
  }) => {
    const growRefreshErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("GrowsProvider.refresh error:")) {
        growRefreshErrors.push(message.text());
      }
    });

    // Seed a SYNTHETIC session into sessionStorage before any app code runs.
    // The session is local-only test fiction; we never present it to a real
    // Supabase endpoint (the Auth and REST calls are intercepted below).
    await page.addInitScript(
      ({ key }) => {
        const encodeSegment = (value: object) =>
          btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
        const expiresAt = Math.floor(Date.now() / 1000) + 3600;
        const fakeAccessToken = [
          encodeSegment({ alg: "HS256", typ: "JWT" }),
          encodeSegment({
            aud: "authenticated",
            exp: expiresAt,
            role: "authenticated",
            sub: "test-user",
          }),
          "FAKE-SIGNATURE-NOT-REAL",
        ].join(".");
        const fakeSession = {
          access_token: fakeAccessToken,
          refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
          expires_in: 3600,
          expires_at: expiresAt,
          token_type: "bearer",
          user: { id: "test-user", aud: "authenticated", email: "x@example.invalid" },
        };
        try {
          sessionStorage.setItem(key, JSON.stringify(fakeSession));
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
    await expect(newPwd).toBeVisible();

    await newPwd.fill(SAFE_NEW_PWD + "a");
    await page.getByLabel(/^confirm new password$/i).fill(SAFE_NEW_PWD + "a");
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
    // Let the synthetic session's provider refresh settle before asserting it
    // did not surface an unrelated grow-read error.
    await page.waitForTimeout(300);
    expect(growRefreshErrors).toEqual([]);
  });
});

// Mobile viewport coverage — same mocked, non-destructive contract, but at
// a phone size to catch tap-target / focus-order regressions on small
// screens. Uses the iPhone 13 viewport explicitly; no real device frames.
test.describe("Mobile auth loading/disabled smoke (mocked)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("mobile sign in: loading label, disable, double-tap blocked, re-enable on error", async ({
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
    await button.tap();
    const loading = page.getByRole("button", { name: /signing in…/i });
    await expect(loading).toBeVisible();
    await expect(loading).toBeDisabled();

    await loading.tap({ force: true, timeout: 1000 }).catch(() => {});
    await loading.tap({ force: true, timeout: 1000 }).catch(() => {});
    expect(gate.count()).toBe(1);

    gate.release();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
    await expect(page.getByRole("alert")).toContainText(/couldn['’]t sign you in/i);
    expect(gate.count()).toBe(1);
  });

  test("mobile create account: loading + double-tap prevention", async ({ page }) => {
    const gate = holdAndCount(page, /signup/i, { error: "x" }, 400);
    await page.goto("/auth");
    await page.getByRole("tab", { name: /create account/i }).tap();
    await page.getByLabel(/^email$/i).fill(SAFE_EMAIL);
    await page.getByLabel(/^password$/i).fill(SAFE_PWD);
    await page.getByRole("checkbox", { name: /terms of service/i }).tap();
    await page.getByRole("button", { name: /^create account$/i }).tap();
    const loading = page.getByRole("button", { name: /creating account…/i });
    await expect(loading).toBeDisabled();
    await loading.tap({ force: true, timeout: 1000 }).catch(() => {});
    expect(gate.count()).toBe(1);
    gate.release();
    await expect(page.getByRole("button", { name: /^create account$/i })).toBeEnabled();
  });

  test("mobile forgot password: loading + generic success copy in role=status", async ({
    page,
  }) => {
    const gate = holdAndCount(page, /recover/i, {}, 200);
    await page.goto("/auth");
    await page.getByRole("tab", { name: /forgot password/i }).tap();
    await page.getByLabel(/email/i).fill(SAFE_EMAIL);
    await page.getByRole("button", { name: /send reset link/i }).tap();
    const loading = page.getByRole("button", { name: /sending reset link…/i });
    await expect(loading).toBeDisabled();
    await loading.tap({ force: true, timeout: 1000 }).catch(() => {});
    expect(gate.count()).toBe(1);
    gate.release();
    await expect(page.getByRole("status")).toContainText(/if an account exists for that email/i);
  });

  test("mobile tab/focus order on /auth is usable: back-to-home, tabs, email, password, show, submit", async ({
    page,
  }) => {
    await page.goto("/auth");
    // The sign-in form is client-rendered after hydration (the server renders
    // the loading state); wait until it is on screen so the walk measures
    // focus order, not hydration timing.
    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    // Walk focus from the top using keyboard Tab. Don't assert exact order
    // (browser/OS focus quirks); assert every key control is reachable.
    const reachable: string[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return a
          ? a.getAttribute("aria-label") ||
              a.id ||
              a.textContent?.trim().slice(0, 30) ||
              a.tagName.toLowerCase()
          : "";
      });
      if (tag) reachable.push(tag);
    }
    const joined = reachable.join("|").toLowerCase();
    expect(joined).toMatch(/back to home/);
    expect(joined).toMatch(/sign in/);
    expect(joined).toMatch(/signin-email|email/);
    expect(joined).toMatch(/signin-password|password/);
    expect(joined).toMatch(/show password|hide password/);
  });
});
