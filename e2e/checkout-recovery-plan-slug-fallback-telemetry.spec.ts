// CI: chromium-mocked project. End-to-end browser proof that the shared
// checkout-recovery plan-slug sanitizer, when handed an invalid plan value,
// (a) collapses to the stable "unknown_plan" token, (b) increments the
// in-memory fallback counter, and (c) emits the throttled, PII-free
// console.warn telemetry line.
//
// SAFETY:
//  - No auth, no network egress, no Supabase/Paddle calls. The spec drives
//    the sanitizer directly through Vite's ESM module graph in the running
//    dev server — the same code path production ships. All /auth/v1/**,
//    /rest/v1/**, and /functions/v1/** are intercepted defensively so a
//    stray request from unrelated app boot cannot escape the sandbox.
//  - The invalid plan value is a synthetic string; no real user data is used.

import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

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

type SanitizerModule = {
  sanitizeCheckoutRecoveryPlanSlug: (value: unknown) => string;
  getUnknownPlanSlugFallbackCount: () => number;
  __resetCheckoutRecoveryPlanSlugTelemetryForTests: () => void;
  CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG: string;
};

declare global {
  interface Window {
    __sanitizerModule?: SanitizerModule;
  }
}

async function loadSanitizerModule(page: Page) {
  // Land on any lightweight route so Vite is warm and module resolution
  // (via the /@fs and /src graph) is available. The public /pricing route
  // is a safe, no-auth surface for this.
  await page.goto("/pricing");
  await page.waitForLoadState("domcontentloaded");

  await page.evaluate(async () => {
    const mod = (await import("/src/lib/checkoutRecoveryPlanSlug.ts")) as SanitizerModule;
    window.__sanitizerModule = mod;
    mod.__resetCheckoutRecoveryPlanSlugTelemetryForTests();
  });
}

test.describe("checkoutRecoveryPlanSlug fallback telemetry (browser E2E)", () => {
  test.beforeEach(async ({ page }) => {
    await neutralizeBackend(page);
  });

  test("invalid plan collapses to unknown_plan, bumps counter, and warns once per type-class", async ({
    page,
  }) => {
    // Capture every console.warn line the sanitizer emits, in order.
    const warnings: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "warning") warnings.push(msg.text());
    });

    await loadSanitizerModule(page);

    const INVALID_PLAN = "totally_bogus_plan_slug_not_in_allowlist";

    // Baseline: counter starts at 0 after the test-only reset.
    const before = await page.evaluate(() =>
      window.__sanitizerModule!.getUnknownPlanSlugFallbackCount(),
    );
    expect(before).toBe(0);

    // First call with an invalid plan.
    const firstResult = await page.evaluate((plan) => {
      return window.__sanitizerModule!.sanitizeCheckoutRecoveryPlanSlug(plan);
    }, INVALID_PLAN);
    expect(firstResult).toBe("unknown_plan");

    const afterFirst = await page.evaluate(() =>
      window.__sanitizerModule!.getUnknownPlanSlugFallbackCount(),
    );
    expect(afterFirst).toBe(1);

    // Second call with the same invalid plan — counter must still increment,
    // warn must be throttled (same reason+bucket key).
    const secondResult = await page.evaluate((plan) => {
      return window.__sanitizerModule!.sanitizeCheckoutRecoveryPlanSlug(plan);
    }, INVALID_PLAN);
    expect(secondResult).toBe("unknown_plan");

    const afterSecond = await page.evaluate(() =>
      window.__sanitizerModule!.getUnknownPlanSlugFallbackCount(),
    );
    expect(afterSecond).toBe(2);

    // Give the console event loop a tick to flush.
    await page.waitForTimeout(50);

    // Exactly ONE warn line for this reason+bucket combination.
    const fallbackWarnings = warnings.filter((line) =>
      line.includes('"event":"checkout_recovery_plan_slug_fallback"'),
    );
    expect(
      fallbackWarnings.length,
      `expected exactly one throttled fallback warn line, saw ${fallbackWarnings.length}: ${warnings.join(" | ")}`,
    ).toBe(1);

    // Contract: warn payload is single-line JSON with only non-sensitive keys.
    const parsed = JSON.parse(fallbackWarnings[0]) as Record<string, unknown>;
    expect(parsed.event).toBe("checkout_recovery_plan_slug_fallback");
    expect(parsed.reason).toBe("not_in_allowlist");
    // length 42 => "33+" bucket.
    expect(parsed.length_bucket).toBe("33+");
    expect(Object.keys(parsed).sort()).toEqual(["event", "length_bucket", "reason"]);

    // The raw invalid plan value must never appear in the warn line.
    expect(fallbackWarnings[0]).not.toContain(INVALID_PLAN);
  });

  test("distinct invalid inputs classify into distinct reason buckets and each warns once", async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "warning") warnings.push(msg.text());
    });

    await loadSanitizerModule(page);

    // undefined -> missing/0, "" -> empty_string/0, {} -> wrong_type/0,
    // "nope" -> not_in_allowlist/1-8
    const results = await page.evaluate(() => {
      const s = window.__sanitizerModule!.sanitizeCheckoutRecoveryPlanSlug;
      return [s(undefined), s(""), s({} as unknown), s("nope")];
    });
    expect(results).toEqual(["unknown_plan", "unknown_plan", "unknown_plan", "unknown_plan"]);

    const count = await page.evaluate(() =>
      window.__sanitizerModule!.getUnknownPlanSlugFallbackCount(),
    );
    expect(count).toBe(4);

    await page.waitForTimeout(50);

    const fallbackWarnings = warnings.filter((line) =>
      line.includes('"event":"checkout_recovery_plan_slug_fallback"'),
    );
    // Four distinct (reason,bucket) tuples => four warn lines.
    expect(fallbackWarnings.length).toBe(4);

    const reasons = fallbackWarnings
      .map((line) => JSON.parse(line) as { reason: string })
      .map((p) => p.reason)
      .sort();
    expect(reasons).toEqual(["empty_string", "missing", "not_in_allowlist", "wrong_type"]);
  });

  test("allowlisted plan passes through and does not touch the fallback counter", async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "warning") warnings.push(msg.text());
    });

    await loadSanitizerModule(page);

    const result = await page.evaluate(() =>
      window.__sanitizerModule!.sanitizeCheckoutRecoveryPlanSlug("pro_monthly"),
    );
    expect(result).toBe("pro_monthly");

    const count = await page.evaluate(() =>
      window.__sanitizerModule!.getUnknownPlanSlugFallbackCount(),
    );
    expect(count).toBe(0);

    await page.waitForTimeout(50);
    const fallbackWarnings = warnings.filter((line) =>
      line.includes('"event":"checkout_recovery_plan_slug_fallback"'),
    );
    expect(fallbackWarnings.length).toBe(0);
  });
});
