import { test, expect } from "./lib/authedTest";
import { validateQuickLogFixturePage } from "./lib/fixtureSafety";
import { observeProductionQuickLogFixture } from "./lib/productionQuickLogFixtureProof";
import {
  readLivePerformanceIdentity,
  measureSignedInPerformance,
} from "./lib/signedInPerformanceProbe";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "../src/lib/analyticsConsent";
import { PERFORMANCE_ORIGIN, type PerformanceOperation } from "./lib/signedInPerformanceRules";

const enabled = process.env.E2E_MEASURE_SIGNED_IN_PERFORMANCE === "true";
test.use({ trace: "off", video: "off" });

// Opt-in measurement. Uses existing auth setup and positive owned-fixture proof.
// No clicks that save, no reconsent acceptance, no telemetry writes and no trace tokens.
test.describe("signed-in route performance evidence", () => {
  test.describe.configure({ retries: 0 });
  test.skip(
    !enabled,
    "Set E2E_MEASURE_SIGNED_IN_PERFORMANCE=true for the explicit measurement lane.",
  );

  for (const target of [
    {
      operation: "dashboard-ready",
      route: "/dashboard",
      control: "dashboard-daily-grow-check-entry",
    },
    { operation: "timeline-ready", route: "/timeline", control: "timeline-search-input" },
    { operation: "sensors-ready", route: "/sensors", control: "sensors-manual-reading-anchor" },
  ] as const) {
    test(target.operation, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "chromium-authed",
        "Requires the normal authenticated fixture.",
      );
      const proof = observeProductionQuickLogFixture(page);
      await page.addInitScript(
        (key) => localStorage.setItem(key, "denied"),
        ANALYTICS_CONSENT_STORAGE_KEY,
      );
      try {
        if (!process.env.E2E_GROW_1_PLANT_URL) throw new Error("owned_fixture_url_required");
        await page.goto(process.env.E2E_GROW_1_PLANT_URL);
        await validateQuickLogFixturePage(page, undefined, proof);
        const result = await measureSignedInPerformance(
          {
            operation: target.operation as PerformanceOperation,
            origin: new URL(page.url()).origin,
            expectedSha: process.env.E2E_EXPECTED_SHA ?? "",
            fixtureVerified: true,
          },
          {
            readIdentity: () => readLivePerformanceIdentity(page),
            run: async () => {
              await page.goto(PERFORMANCE_ORIGIN + target.route);
              await expect(page).toHaveURL(PERFORMANCE_ORIGIN + target.route);
              const control = page.getByTestId(target.control);
              await expect(control).toBeVisible();
              if (target.operation === "sensors-ready")
                await expect(control.locator("input").first()).toBeEnabled();
              else await expect(control).toBeEnabled();
            },
          },
        );
        await testInfo.attach(target.operation + "-performance", {
          body: Buffer.from(JSON.stringify(result.receipt, null, 2)),
          contentType: "application/json",
        });
        if (result.error) throw result.error;
        expect(result.receipt.status, result.receipt.reason).toBe("PASS");
      } finally {
        proof.dispose();
      }
    });
  }
});
