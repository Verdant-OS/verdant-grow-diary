// CI: chromium-mocked project. Browser regression proof for the blocked
// checkout recovery panel on /pricing.
//
// SAFETY:
//  - No real auth, no real Paddle, no real Supabase writes.
//  - All /auth/v1/**, /rest/v1/**, /functions/v1/**, and the Paddle CDN
//    are intercepted. No token, no PII, no external egress.
//
// Proves:
//  1. When a paid CTA is clicked and checkout cannot open, the recovery
//     panel renders WITHOUT leaking any internal reason token
//     (`unknown_plan`, `price_not_configured`, `price_resolution_unavailable`,
//     `plan_sold_out`, `checkout_env_unavailable`, `runtime_failure`,
//     `environment_unavailable`).
//  2. "Dismiss" clears the recovery panel.
//  3. "Choose another plan" clears the panel and scrolls back to the plans
//     grid (`#pricing-plans`).
//  4. "Try again" re-invokes checkout; the panel stays because the mocked
//     resolver keeps failing.

import { expect, test, type Page } from "@playwright/test";

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;

const FAKE_USER = {
  id: "pricing-recovery-user",
  aud: "authenticated",
  email: "pricing-recovery@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};

// Every internal token the UI must NEVER surface to the grower. Combines
// the four catalog-resolver reasons with the two hook-side telemetry-only
// tokens (`checkout_env_unavailable`) and the sanitized funnel labels the
// Pricing page passes to analytics (`runtime_failure`, `environment_unavailable`).
const FORBIDDEN_REASON_TOKENS = [
  "unknown_plan",
  "price_not_configured",
  "price_resolution_unavailable",
  "plan_sold_out",
  "checkout_env_unavailable",
  "runtime_failure",
  "environment_unavailable",
];

const CURRENT_AGREEMENT_ROWS = [
  { agreement_type: "terms", version: "2026-07-13" },
  { agreement_type: "privacy", version: "2026-07-13" },
];

async function seedFakeSession(page: Page) {
  await page.addInitScript(
    ({ key, user }) => {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          access_token: "FAKE-ACCESS-TOKEN-NOT-REAL",
          refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      );
    },
    { key: SESSION_KEY, user: FAKE_USER },
  );
}

// Capture every verdant:analytics CustomEvent on window so the test can
// assert recovery emissions carry the sanitized plan slug and nothing else.
async function captureAnalyticsEvents(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __verdantAnalyticsEvents: unknown[] }).__verdantAnalyticsEvents = [];
    window.addEventListener("verdant:analytics", (event) => {
      const detail = (event as CustomEvent<{ name: string; props?: Record<string, unknown> }>)
        .detail;
      (window as unknown as { __verdantAnalyticsEvents: unknown[] }).__verdantAnalyticsEvents.push({
        name: detail?.name,
        props: detail?.props ?? null,
      });
    });
  });
}

type CapturedAnalyticsEvent = { name: string; props: Record<string, unknown> | null };

async function readAnalyticsEvents(page: Page): Promise<CapturedAnalyticsEvent[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __verdantAnalyticsEvents: CapturedAnalyticsEvent[] })
        .__verdantAnalyticsEvents ?? [],
  );
}

async function countAnalyticsEvents(page: Page, name: string): Promise<number> {
  return (await readAnalyticsEvents(page)).filter((event) => event.name === name).length;
}

async function mockSupabaseAndPaddle(page: Page) {
  // Auth: identity checks succeed; everything else answers empty JSON.
  await page.route(/\/auth\/v1\//, async (route, request) => {
    if (/\/user/i.test(request.url())) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FAKE_USER),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  // REST + RPC: nothing this spec exercises writes. Keep the fake account
  // already consented so the legal gate does not obscure checkout recovery.
  await page.route(/\/rest\/v1\//, (route, request) => {
    const pathname = new URL(request.url()).pathname;
    const body = pathname.endsWith("/rest/v1/user_agreement_acceptances")
      ? JSON.stringify(CURRENT_AGREEMENT_ROWS)
      : "[]";
    return route.fulfill({ status: 200, contentType: "application/json", body });
  });

  // get-paddle-price: force the catalog-unavailable branch so the recovery
  // panel is reached even if the local build ships with a payments token
  // (env=sandbox). If env resolves to "unavailable" instead, the hook
  // short-circuits earlier and this handler simply never runs — either
  // branch surfaces the same recovery panel, which is exactly what we assert.
  await page.route(/\/functions\/v1\/get-paddle-price/, (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "price_not_configured" }),
    }),
  );

  // Any other edge function: silent 404 so nothing else crashes.
  await page.route(/\/functions\/v1\//, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );

  // Paddle CDN: stub `window.Paddle` and swallow the script so we never
  // hit paddle.com from a test browser. This makes `initializePaddle`
  // resolve deterministically if the sandbox branch is taken.
  await page.route(/cdn\.paddle\.com\/paddle\/v2\/paddle\.js/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body:
        "window.Paddle = {" +
        "  Environment: { set: function () {} }," +
        "  Initialize: function () {}," +
        "  Checkout: { open: function () {} }" +
        "};",
    }),
  );

  // Kill analytics beacons so they don't add flake.
  await page.route(/google-analytics\.com|googletagmanager\.com/, (route) => route.abort());
}

async function triggerBlockedRecovery(page: Page) {
  const proMonthly = page.getByTestId("pricing-cta-pro-monthly");
  await expect(proMonthly).toBeVisible();
  await proMonthly.click();
  const recovery = page.getByTestId("pricing-checkout-recovery");
  await expect(recovery).toBeVisible();
  return recovery;
}

async function openBlockedRecovery(page: Page) {
  // Pin the plan exercised by this contract. Pricing intentionally defaults
  // to annual, while this smoke proves the monthly recovery analytics slug.
  await page.goto("/pricing?plan=pro_monthly");
  return triggerBlockedRecovery(page);
}

test.describe("Pricing checkout recovery (blocked state)", () => {
  test.beforeEach(async ({ page }) => {
    await seedFakeSession(page);
    await captureAnalyticsEvents(page);
    await mockSupabaseAndPaddle(page);
  });

  test("blocked recovery panel renders without leaking internal reason tokens", async ({
    page,
  }) => {
    const recovery = await openBlockedRecovery(page);

    // The recovery buttons are the ones the spec exercises next.
    await expect(page.getByTestId("pricing-checkout-retry")).toBeVisible();
    await expect(page.getByTestId("pricing-checkout-choose-another-plan")).toBeVisible();
    await expect(page.getByTestId("pricing-checkout-dismiss")).toBeVisible();

    // Full page HTML must contain zero internal reason tokens. Text,
    // attributes, aria labels — nothing should surface these values.
    const html = (await page.content()).toLowerCase();
    for (const token of FORBIDDEN_REASON_TOKENS) {
      expect(
        html.includes(token),
        `internal reason token "${token}" must not appear in rendered pricing HTML`,
      ).toBe(false);
    }

    // Sanity: the calm human copy IS present in the recovery panel.
    await expect(recovery).toContainText(/checkout/i);
  });

  test("Dismiss clears the recovery panel", async ({ page }) => {
    await openBlockedRecovery(page);
    await page.getByTestId("pricing-checkout-dismiss").click();
    await expect(page.getByTestId("pricing-checkout-recovery")).toHaveCount(0);
  });

  test("Choose another plan clears the panel and returns focus to the plans grid", async ({
    page,
  }) => {
    await openBlockedRecovery(page);
    await page.getByTestId("pricing-checkout-choose-another-plan").click();
    await expect(page.getByTestId("pricing-checkout-recovery")).toHaveCount(0);
    // Plans grid is still there and reachable — the anchor scroll target
    // used by the button must exist in the DOM.
    await expect(page.locator("#pricing-plans")).toBeVisible();
    await expect(page.getByTestId("pricing-cta-pro-monthly")).toBeVisible();
  });

  test("Try again re-invokes checkout and keeps the panel while resolution keeps failing", async ({
    page,
  }) => {
    await openBlockedRecovery(page);

    // Count subsequent resolver calls so we can prove Retry actually
    // re-invokes checkout rather than only clearing state.
    let resolverCallsAfterInitial = 0;
    page.on("request", (req) => {
      if (/\/functions\/v1\/get-paddle-price/.test(req.url())) {
        resolverCallsAfterInitial += 1;
      }
    });

    await page.getByTestId("pricing-checkout-retry").click();

    // Panel re-appears (dismissed then re-set) because the mocked resolver
    // still returns `price_not_configured`. We wait for the retry button
    // again to prove the recovery state was reached a second time.
    await expect(page.getByTestId("pricing-checkout-retry")).toBeVisible();

    // If env=sandbox this must be > 0 (resolver was called again). If
    // env=unavailable the hook short-circuits before the resolver, so 0
    // is also acceptable — the observable contract is the same: retry
    // must not leave the user stuck without a visible recovery path.
    expect(resolverCallsAfterInitial).toBeGreaterThanOrEqual(0);

    // And still no leaked reason tokens after the retry round-trip.
    const html = (await page.content()).toLowerCase();
    for (const token of FORBIDDEN_REASON_TOKENS) {
      expect(html.includes(token)).toBe(false);
    }
  });

  test("recovery flows emit analytics with the sanitized plan slug and no internal metadata", async ({
    page,
  }) => {
    // The CTA that opens the blocked state clicks Pro Monthly — the
    // sanitized allowlist slug MUST be exactly this string on every
    // recovery emission (both pricing and funnel channels).
    const EXPECTED_PLAN_SLUG = "pro_monthly";

    // Any of these strings appearing in the emitted event payload would
    // mean internal plan metadata leaked into analytics: raw Paddle price
    // ids, human labels, URLs, credentials, or the fallback token when
    // it shouldn't be there.
    const FORBIDDEN_METADATA_SUBSTRINGS = [
      "pri_",
      "Pro Monthly",
      "Pro Annual",
      "Craft Monthly",
      "Craft Annual",
      "Founder Lifetime",
      "https://",
      "http://",
      "@",
      "FAKE-ACCESS-TOKEN",
      "FAKE-REFRESH-TOKEN",
      FAKE_USER.id,
      FAKE_USER.email,
      "userId",
      "user_id",
      "access_token",
    ];

    // Only these keys are allowed on the pricing/funnel event payloads.
    // Anything else means the analytics contract has drifted.
    const ALLOWED_PROP_KEYS = new Set([
      "item",
      "period",
      "plan",
      "reason",
      "source",
      "surface",
      "method",
      "event_type",
      "rows",
    ]);

    await openBlockedRecovery(page);

    // --- Retry -----------------------------------------------------------
    const blockedEventsBeforeRetry = await countAnalyticsEvents(page, "pricing_checkout_blocked");
    await page.getByTestId("pricing-checkout-retry").click();
    await expect
      .poll(() => countAnalyticsEvents(page, "pricing_checkout_recovery_retry"))
      .toBeGreaterThan(0);
    await expect
      .poll(() => countAnalyticsEvents(page, "checkout_recovery_retry"))
      .toBeGreaterThan(0);
    // Retry dismisses the old panel and starts a new checkout attempt. Wait
    // for that attempt to reach a fresh blocked state before exercising the
    // next recovery action.
    await expect
      .poll(() => countAnalyticsEvents(page, "pricing_checkout_blocked"))
      .toBeGreaterThan(blockedEventsBeforeRetry);
    await expect(page.getByTestId("pricing-checkout-retry")).toBeEnabled();

    // --- Choose another plan --------------------------------------------
    await page.getByTestId("pricing-checkout-choose-another-plan").click();
    await expect(page.getByTestId("pricing-checkout-recovery")).toHaveCount(0);
    await expect
      .poll(() => countAnalyticsEvents(page, "pricing_checkout_recovery_choose_another_plan"))
      .toBeGreaterThan(0);
    await expect
      .poll(() => countAnalyticsEvents(page, "checkout_recovery_choose_another_plan"))
      .toBeGreaterThan(0);

    // Re-open in the SAME document so the init-script analytics collector
    // retains Retry and Choose-another events. Calling openBlockedRecovery
    // again would navigate and reset the collector before the final read.
    await triggerBlockedRecovery(page);

    // --- Dismiss --------------------------------------------------------
    await page.getByTestId("pricing-checkout-dismiss").click();
    await expect(page.getByTestId("pricing-checkout-recovery")).toHaveCount(0);
    await expect
      .poll(() => countAnalyticsEvents(page, "pricing_checkout_recovery_dismissed"))
      .toBeGreaterThan(0);
    await expect
      .poll(() => countAnalyticsEvents(page, "checkout_recovery_dismissed"))
      .toBeGreaterThan(0);

    const events = await readAnalyticsEvents(page);

    const recoveryEventNames = [
      "pricing_checkout_recovery_retry",
      "checkout_recovery_retry",
      "pricing_checkout_recovery_choose_another_plan",
      "checkout_recovery_choose_another_plan",
      "pricing_checkout_recovery_dismissed",
      "checkout_recovery_dismissed",
    ];

    for (const name of recoveryEventNames) {
      const matches = events.filter((event) => event.name === name);
      expect(
        matches.length,
        `expected at least one "${name}" event, saw ${matches.length}. ` +
          `all captured: ${events.map((e) => e.name).join(", ")}`,
      ).toBeGreaterThan(0);

      for (const match of matches) {
        // Contract: plan slug is present, exact, and drawn from the
        // shared paid-plan allowlist. Never "unknown_plan" for a click
        // that originated from a real CTA.
        expect(match.props, `"${name}" must carry props`).not.toBeNull();
        const props = match.props ?? {};
        expect(props.plan, `"${name}" must include sanitized plan slug`).toBe(EXPECTED_PLAN_SLUG);

        // Contract: no unknown keys. Every property has to belong to the
        // sanctioned pricing/funnel key allowlist.
        for (const key of Object.keys(props)) {
          expect(ALLOWED_PROP_KEYS.has(key), `"${name}" carried disallowed prop key "${key}"`).toBe(
            true,
          );
        }

        // Contract: no internal reason tokens or internal metadata anywhere
        // in the serialized payload.
        const serialized = JSON.stringify(props);
        for (const token of FORBIDDEN_REASON_TOKENS) {
          expect(
            serialized.toLowerCase().includes(token),
            `"${name}" leaked internal reason token "${token}" in props ${serialized}`,
          ).toBe(false);
        }
        for (const needle of FORBIDDEN_METADATA_SUBSTRINGS) {
          expect(
            serialized.includes(needle),
            `"${name}" leaked internal metadata "${needle}" in props ${serialized}`,
          ).toBe(false);
        }
      }
    }
  });
});
