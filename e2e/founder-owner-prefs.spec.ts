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
    // Default safety net — no /rest/v1/** or /functions/v1/** call can
    // escape the mocks and hit real Supabase.
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
    // /auth/v1/** requests (getSession, etc.) — sessionStorage carries the
    // synthetic session; block outbound token refresh from reaching prod.
    await page.route(/\/auth\/v1\//, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
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
    await page.route(/\/rest\/v1\/user_agreement_acceptances/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { agreement_type: "terms", version: "2026-07-13" },
          { agreement_type: "privacy", version: "2026-07-13" },
        ]),
      }),
    );
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

    // Fill in a valid custom-name profile.
    await page.locator("#founder-show-on-wall").click();
    await page.locator("#founder-display-name").fill("Jane Cultivator");
    await page.locator("#founder-optional-link").fill("https://example.com/jane");

    // https-only client validation: an http:// value must NOT invoke.
    await page.locator("#founder-optional-link").fill("http://insecure.example");
    await page.getByRole("button", { name: /Save Founder settings/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(invokeCount).toBe(0);

    // Fix and re-submit.
    await page.locator("#founder-optional-link").fill("https://example.com/jane");
    await page.getByRole("button", { name: /Save Founder settings/i }).click();

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

  test("status live region announces saving once and clears on completion", async ({ page }) => {
    await seedSession(page);
    // Pre-empt the AgreementReconsentGate modal so it can't intercept clicks.
    await page.route(/\/rest\/v1\/user_agreement_acceptances/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { document_key: "terms", accepted_at: new Date().toISOString() },
          { document_key: "privacy", accepted_at: new Date().toISOString() },
        ]),
      }),
    );
    await mockFoundersReadOnce(page, {
      founder_number: 21,
      display_name: null,
      display_style: "hidden",
      show_on_wall: false,
      optional_link: null,
      status: "confirmed",
    });

    // Gate the edge function so we can inspect the in-flight state.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      /\/functions\/v1\/save-founder-prefs/,
      async (route) => {
        await gate;
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

    const status = page.getByTestId("founder-prefs-status");

    // Idle: element exists, is a status live region, and holds no stale text.
    await expect(status).toHaveCount(1);
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveAttribute("aria-atomic", "true");
    await expect(status).toHaveText("");

    // Trigger the save via the form directly to bypass any stray overlay
    // that would intercept a raw click.
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>(
        "form:has(#founder-show-on-wall)",
      );
      form?.requestSubmit();
    });

    // In-flight: message announced exactly once (single node, single text).
    await expect(status).toHaveText("Saving Founder settings…");
    expect(await page.getByText("Saving Founder settings…").count()).toBe(1);

    // Complete the request and assert the live region clears — no stale
    // announcement lingers for assistive tech after success.
    release();
    await expect(status).toHaveText("", { timeout: 5_000 });
    await expect(
      page.getByRole("button", { name: /Save Founder settings/i }),
    ).toBeEnabled();
    expect(await page.getByText("Saving Founder settings…").count()).toBe(0);
  });

  test("focus returns to Save button after save completes without a focus trap", async ({ page }) => {
    await seedSession(page);
    await page.route(/\/rest\/v1\/user_agreement_acceptances/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { agreement_type: "terms", version: "2026-07-13" },
          { agreement_type: "privacy", version: "2026-07-13" },
        ]),
      }),
    );
    // Persistent read mock — refetch after save must still return the row,
    // otherwise the form unmounts and focus can never return to Save.
    await page.route(/\/rest\/v1\/founders(\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          founder_number: 33,
          display_name: null,
          display_style: "hidden",
          show_on_wall: false,
          optional_link: null,
          status: "confirmed",
        }),
      }),
    );

    // Gate save so we can inspect in-flight focus, then release for completion.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/functions\/v1\/save-founder-prefs/, async (route) => {
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/founder");
    await expect(
      page.getByRole("heading", { name: /Your Founder settings/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape").catch(() => {});

    // Submit via the form so we don't depend on click actionability while
    // any tail-end overlay is still animating out.
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>(
        "form:has(#founder-show-on-wall)",
      );
      form?.requestSubmit();
    });

    // In-flight: Save is disabled and no longer the active element, but
    // focus must remain somewhere in the document (not null / <body> only
    // if that indicates the page has lost focus entirely).
    await expect(page.getByRole("button", { name: /Saving…/i })).toBeDisabled();
    const inFlightTag = await page.evaluate(
      () => document.activeElement?.tagName ?? null,
    );
    expect(inFlightTag).not.toBeNull();

    // Complete the request — focus should return to the (now re-enabled)
    // Save button, proving no dialog/overlay trapped focus and keyboard
    // users are not stranded on a hidden disabled control.
    release();
    const restored = page.getByRole("button", { name: /Save Founder settings/i });
    await expect(restored).toBeEnabled();
    await expect(restored).toBeFocused({ timeout: 5_000 });

    // No focus trap: pressing Tab / Shift+Tab from the Save button must
    // move focus to another element (a real trap would keep focus pinned
    // to the same node).
    const beforeId = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.id ?? "",
    );
    await page.keyboard.press("Shift+Tab");
    const afterId = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.id ?? "",
    );
    expect(afterId).not.toBe(beforeId);
  });

  test("status live region clears after save and does not replay on rerenders or second save", async ({ page }) => {
    await seedSession(page);
    await page.route(/\/rest\/v1\/user_agreement_acceptances/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { agreement_type: "terms", version: "2026-07-13" },
          { agreement_type: "privacy", version: "2026-07-13" },
        ]),
      }),
    );
    // Persistent read mock so post-save refetch keeps the form mounted and
    // the status node identity is preserved across renders.
    await page.route(/\/rest\/v1\/founders(\?|$)/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          founder_number: 44,
          display_name: null,
          display_style: "hidden",
          show_on_wall: false,
          optional_link: null,
          status: "confirmed",
        }),
      }),
    );

    // Gate each save independently so we can inspect in-flight / cleared
    // transitions per invocation without cross-contamination.
    let currentRelease: (() => void) | null = null;
    const releasers: Array<() => void> = [];
    await page.route(/\/functions\/v1\/save-founder-prefs/, async (route) => {
      const gate = new Promise<void>((resolve) => {
        currentRelease = resolve;
        releasers.push(resolve);
      });
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/founder");
    await expect(
      page.getByRole("heading", { name: /Your Founder settings/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape").catch(() => {});

    const status = page.getByTestId("founder-prefs-status");
    await expect(status).toHaveText("");

    // Capture the underlying DOM node identity — a live region only stops
    // announcing stale text if it is mutated in place. If React remounts
    // it, assistive tech treats the new node as a fresh announcement.
    const initialNodeId = await status.evaluate((el) => {
      const w = window as unknown as { __statusNode?: Element };
      w.__statusNode = el;
      return true;
    });
    expect(initialNodeId).toBe(true);

    // --- First save -------------------------------------------------------
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>(
        "form:has(#founder-show-on-wall)",
      );
      form?.requestSubmit();
    });
    await expect(status).toHaveText("Saving Founder settings…");

    // Release and assert the region clears immediately after completion.
    releasers[0]?.();
    await expect(status).toHaveText("", { timeout: 5_000 });
    await expect(
      page.getByRole("button", { name: /Save Founder settings/i }),
    ).toBeEnabled();

    // Same DOM node — the "Saving…" text was mutated in place, then
    // cleared in place, so SR buffers do not carry a stale announcement.
    const sameNode = await status.evaluate((el) => {
      const w = window as unknown as { __statusNode?: Element };
      return w.__statusNode === el;
    });
    expect(sameNode).toBe(true);

    // --- Unrelated re-renders after completion ---------------------------
    // Typing must not cause the live region to re-emit the old "Saving…"
    // string (which would happen if state were reset back through the
    // saving branch or if a stale message were retained in DOM).
    await page.locator("#founder-display-name").fill("A");
    await page.locator("#founder-display-name").fill("Ab");
    await page.locator("#founder-display-name").fill("Abc");
    await expect(status).toHaveText("");
    expect(await page.getByText("Saving Founder settings…").count()).toBe(0);

    // --- Second save -----------------------------------------------------
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>(
        "form:has(#founder-show-on-wall)",
      );
      form?.requestSubmit();
    });
    await expect(status).toHaveText("Saving Founder settings…");
    // Exactly one active announcement — no duplicate stale copy left over.
    expect(await page.getByText("Saving Founder settings…").count()).toBe(1);

    releasers[1]?.();
    await expect(status).toHaveText("", { timeout: 5_000 });
    expect(await page.getByText("Saving Founder settings…").count()).toBe(0);

    // Still the same live-region node after two full save cycles.
    const stillSameNode = await status.evaluate((el) => {
      const w = window as unknown as { __statusNode?: Element };
      return w.__statusNode === el;
    });
    expect(stillSameNode).toBe(true);

    // Silence the unused-var lint on the placeholder release capture.
    void currentRelease;
  });
});


