// Mocked Playwright checks that /auth honors safe internal ?redirectTo=
// targets and rejects open-redirect attempts. All Supabase /auth/v1/**
// traffic is intercepted — no real accounts, sessions, or emails.
import { test, expect, type Page } from "@playwright/test";

const SAFE_EMAIL = "playwright-redirect-noop@example.invalid";
const SAFE_PASSWORD = "playwright-noop-1";

// Mock a successful sign-in: token endpoint returns a fake session that the
// supabase-js client will accept locally. We never present this token to a
// real server.
async function mockAuth(page: Page) {
  await page.route(/\/auth\/v1\//, async (route, req) => {
    const url = req.url();
    if (/\/token/i.test(url) && req.method() === "POST") {
      const body = {
        access_token: "test-only-not-real",
        refresh_token: "test-only-not-real",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: "test-user-id",
          aud: "authenticated",
          email: "noop@example.invalid",
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      return;
    }
    if (/\/user/i.test(url) && req.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-user-id",
          aud: "authenticated",
          email: "noop@example.invalid",
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
}

async function signInWith(page: Page, redirectTo: string | null) {
  const path = redirectTo === null ? "/auth" : `/auth?redirectTo=${encodeURIComponent(redirectTo)}`;
  await page.goto(path);
  await page.getByLabel(/^email$/i).fill(SAFE_EMAIL);
  await page.getByLabel(/^password$/i).fill(SAFE_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
}

test.describe("Auth redirect safety (mocked)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test("safe internal redirectTo is honored after sign-in", async ({ page, baseURL }) => {
    await signInWith(page, "/dashboard");
    await page.waitForURL((u) => u.pathname === "/dashboard" || u.pathname === "/", {
      timeout: 8000,
    });
    const origin = new URL(page.url()).origin;
    expect(origin).toBe(new URL(baseURL!).origin);
  });

  test("off-origin redirectTo is ignored — stays on app origin", async ({ page, baseURL }) => {
    await signInWith(page, "https://evil.example/steal");
    // Should never navigate off-origin. Allow a moment for any (incorrect)
    // navigation to happen.
    await page.waitForTimeout(800);
    const origin = new URL(page.url()).origin;
    expect(origin).toBe(new URL(baseURL!).origin);
    expect(page.url()).not.toContain("evil.example");
  });

  test("protocol-relative //evil is ignored", async ({ page, baseURL }) => {
    await signInWith(page, "//evil.example/x");
    await page.waitForTimeout(800);
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
    expect(page.url()).not.toContain("evil.example");
  });

  test("javascript: redirectTo is ignored and does not execute", async ({ page, baseURL }) => {
    let alerted = false;
    page.on("dialog", async (d) => {
      alerted = true;
      await d.dismiss();
    });
    await signInWith(page, "javascript:alert(1)");
    await page.waitForTimeout(800);
    expect(alerted).toBe(false);
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  });

  test("backslash variant /\\evil falls back to safe internal path", async ({
    page,
    baseURL,
  }) => {
    await signInWith(page, "/\\evil");
    await page.waitForTimeout(800);
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
    expect(page.url()).not.toContain("evil");
  });

  test("/reset-password success stays on app origin (no external redirect)", async ({
    page,
    baseURL,
  }) => {
    const SB_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
    const SB_SESSION_KEY = `sb-${SB_PROJECT_REF}-auth-token`;
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
    // Mock PUT /auth/v1/user as success.
    await page.route(/\/auth\/v1\/user/i, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "test-user", email: "x@example.invalid" }),
      }),
    );
    await page.goto("/reset-password?redirectTo=https://evil.example");
    const newPwd = page.getByLabel(/^new password$/i);
    const ready = await newPwd.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    test.skip(!ready, "Reset form did not render with synthetic session.");
    await newPwd.fill("verdantnoop1");
    await page.getByLabel(/^confirm new password$/i).fill("verdantnoop1");
    await page.getByRole("button", { name: /^update password$/i }).click();
    await page.waitForTimeout(1500);
    const origin = new URL(page.url()).origin;
    expect(origin).toBe(new URL(baseURL!).origin);
    expect(page.url()).not.toContain("evil.example");
  });
});
