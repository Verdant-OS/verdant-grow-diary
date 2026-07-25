// CI: chromium-mocked project. End-to-end browser proof that when the
// shared checkout-recovery plan-slug sanitizer falls back to
// "unknown_plan", it also emits a `checkout_recovery_plan_slug_fallback`
// funnel event whose payload contains ONLY `reason` and `length_bucket`
// (no plan slug, no raw input, no PII, no ambient identifiers).
//
// This complements the console.warn telemetry spec by asserting on the
// aggregated analytics event that ships alongside the throttled warn.
//
// SAFETY:
//  - No auth, no network egress, no Supabase/Paddle calls. The sanitizer
//    is driven directly through Vite's ESM module graph in the running
//    dev server — same code path production ships. All backend routes
//    are intercepted defensively so nothing escapes the sandbox.
//  - Invalid plan values are synthetic; no user data is used.

import { expect, test, type Page } from "@playwright/test";

const FUNNEL_EVENT = "checkout_recovery_plan_slug_fallback";
const ALLOWED_KEYS = ["length_bucket", "reason"] as const;

type SanitizerModule = {
  sanitizeCheckoutRecoveryPlanSlug: (value: unknown) => string;
  __resetCheckoutRecoveryPlanSlugTelemetryForTests: () => void;
};

type CapturedFunnelEvent = {
  name: string;
  props: Record<string, unknown> | null;
};

declare global {
  interface Window {
    __sanitizerModule?: SanitizerModule;
    __verdantAnalyticsEvents?: CapturedFunnelEvent[];
  }
}

async function neutralizeBackend(page: Page) {
  await page.route(/\/auth\/v1\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route(/\/rest\/v1\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route(/\/functions\/v1\//, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route(/cdn\.paddle\.com|google-analytics\.com|googletagmanager\.com/, (route) =>
    route.abort(),
  );
}

async function captureAnalyticsEvents(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __verdantAnalyticsEvents: CapturedFunnelEvent[] })
      .__verdantAnalyticsEvents = [];
    window.addEventListener("verdant:analytics", (event) => {
      const detail = (event as CustomEvent<{ name: string; props?: Record<string, unknown> }>)
        .detail;
      (window as unknown as { __verdantAnalyticsEvents: CapturedFunnelEvent[] })
        .__verdantAnalyticsEvents.push({
          name: detail?.name,
          props: detail?.props ?? null,
        });
    });
  });
}

async function readFallbackEvents(page: Page): Promise<CapturedFunnelEvent[]> {
  const all = await page.evaluate(
    () => window.__verdantAnalyticsEvents ?? [],
  );
  return all.filter((e) => e.name === FUNNEL_EVENT);
}

async function loadSanitizerModule(page: Page) {
  await page.goto("/pricing");
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    const mod = (await import("/src/lib/checkoutRecoveryPlanSlug.ts")) as SanitizerModule;
    window.__sanitizerModule = mod;
    mod.__resetCheckoutRecoveryPlanSlugTelemetryForTests();
  });
}

test.describe("checkoutRecoveryPlanSlug fallback funnel event (browser E2E)", () => {
  test.beforeEach(async ({ page }) => {
    await neutralizeBackend(page);
    await captureAnalyticsEvents(page);
  });

  test("invalid plan emits one fallback funnel event with only reason + length_bucket", async ({
    page,
  }) => {
    await loadSanitizerModule(page);

    const INVALID_PLAN = "totally_bogus_plan_slug_not_in_allowlist"; // length 42 -> "33+"

    const result = await page.evaluate((plan) =>
      window.__sanitizerModule!.sanitizeCheckoutRecoveryPlanSlug(plan),
    , INVALID_PLAN);
    expect(result).toBe("unknown_plan");

    // Give the analytics dispatch a tick to flush through window events.
    await page.waitForTimeout(50);

    const events = await readFallbackEvents(page);
    expect(
      events.length,
      `expected exactly one ${FUNNEL_EVENT} event, saw ${events.length}`,
    ).toBe(1);

    const props = events[0].props ?? {};
    expect(props.reason).toBe("not_in_allowlist");
    expect(props.length_bucket).toBe("33+");
    expect(Object.keys(props).sort()).toEqual([...ALLOWED_KEYS]);

    // The raw invalid plan value must never appear anywhere in the payload.
    const serialized = JSON.stringify(events[0]);
    expect(serialized).not.toContain(INVALID_PLAN);
    // Nor the sanitized fallback token itself — that would defeat the
    // "no plan slug in payload" contract.
    expect(serialized).not.toContain("unknown_plan");
  });

  test("each distinct invalid input emits its own fallback event with only allowed keys", async ({
    page,
  }) => {
    await loadSanitizerModule(page);

    await page.evaluate(() => {
      const s = window.__sanitizerModule!.sanitizeCheckoutRecoveryPlanSlug;
      s(undefined);
      s("");
      s({} as unknown);
      s("nope"); // length 4 -> "1-8"
    });

    await page.waitForTimeout(50);

    const events = await readFallbackEvents(page);
    expect(events.length).toBe(4);

    for (const evt of events) {
      const props = evt.props ?? {};
      expect(Object.keys(props).sort()).toEqual([...ALLOWED_KEYS]);
      expect(typeof props.reason).toBe("string");
      expect(typeof props.length_bucket).toBe("string");
    }

    const reasons = events
      .map((e) => (e.props as { reason: string }).reason)
      .sort();
    expect(reasons).toEqual([
      "empty_string",
      "missing",
      "not_in_allowlist",
      "wrong_type",
    ]);
  });

  test("allowlisted plan does not emit a fallback funnel event", async ({ page }) => {
    await loadSanitizerModule(page);

    const result = await page.evaluate(() =>
      window.__sanitizerModule!.sanitizeCheckoutRecoveryPlanSlug("pro_monthly"),
    );
    expect(result).toBe("pro_monthly");

    await page.waitForTimeout(50);

    const events = await readFallbackEvents(page);
    expect(events.length).toBe(0);
  });
});
