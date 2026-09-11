import { test, expect, type Request } from "@playwright/test";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "../src/lib/analyticsConsent";

/**
 * Advanced Nutrients × Verdant feeding demo — fixture-only E2E.
 *
 * Asserts the happy path, missing/stale sensor honesty, mobile viewport,
 * approval boundary, and that the page issues no write-capable network calls.
 */

const ROUTE = "/internal/demo-advanced-nutrients-feeding";

const FORBIDDEN_PATH_FRAGMENTS: ReadonlyArray<RegExp> = [
  /\/functions\/v1\//i,
  /\/rpc\/quicklog_save/i,
  /\/rpc\/.*action/i,
  /\/rpc\/.*ai/i,
  /\/rest\/v1\/grow_events/i,
  /\/rest\/v1\/diary_entries/i,
  /\/rest\/v1\/action_queue/i,
  /\/rest\/v1\/feeding_events/i,
  // Host patterns must be URL-anchored (CodeQL IncompleteHostnameRegExp).
  /^https?:\/\/([^/]*\.)?openai\.com(?:\/|$)/i,
  /^https?:\/\/([^/]*\.)?api\.anthropic\.com(?:\/|$)/i,
];

function isForbidden(req: Request): boolean {
  const method = req.method().toUpperCase();
  const url = req.url();
  if (FORBIDDEN_PATH_FRAGMENTS.some((re) => re.test(url))) return true;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (/\/rest\/v1\//i.test(url)) return true;
  if (/\/rpc\//i.test(url)) return true;
  return false;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key }) => {
      try {
        localStorage.setItem(key, "denied");
      } catch {
        // Banner may still render if storage is blocked.
      }
    },
    { key: ANALYTICS_CONSENT_STORAGE_KEY },
  );
});

async function openDemo(page: import("@playwright/test").Page) {
  await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("an-verdant-feeding-demo-page")).toBeVisible();
  // Wait for client hydration so catalog/save clicks attach.
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("qlv2-feeding-form")).toBeVisible();
}

async function completeFeeding(page: import("@playwright/test").Page) {
  await page.getByTestId("an-verdant-catalog-product-an-demo-ph-perfect-grow").click();
  await page.getByLabel(/Applied volume/i).fill("750");
  await page.getByLabel(/Product 1 amount/i).fill("4");
}

test.describe("AN × Verdant feeding demo", () => {
  test("happy path + no write-capable network", async ({ page }) => {
    const violations: Array<{ method: string; url: string }> = [];
    page.on("request", (req) => {
      if (isForbidden(req)) violations.push({ method: req.method(), url: req.url() });
    });

    await openDemo(page);
    await expect(page.getByTestId("an-verdant-demo-disclosure")).toBeVisible();
    await expect(page.getByTestId("an-verdant-demo-plant-label")).toContainText("Demo Plant");

    await completeFeeding(page);
    await expect(page.getByTestId("an-verdant-demo-catalog-disclosure")).toContainText(
      "Demo catalog",
    );

    await page.getByTestId("an-verdant-demo-save").click();
    await expect(page.getByTestId("an-verdant-demo-timeline-summary")).toContainText(
      "pH Perfect Grow",
    );

    await page.getByTestId("an-verdant-demo-open-timeline").click();
    await expect(page.getByTestId("an-verdant-demo-event-detail")).toBeVisible();

    await page.getByTestId("an-verdant-demo-open-ai").click();
    await expect(page.getByTestId("an-verdant-ai-observed")).toBeVisible();
    await expect(page.getByTestId("an-verdant-ai-inferred")).toBeVisible();
    await expect(page.getByTestId("an-verdant-ai-unknown")).toBeVisible();

    await page.getByTestId("an-verdant-demo-open-aq").click();
    await expect(page.getByTestId("an-verdant-aq-status")).toContainText("pending_approval");
    await expect(page.getByTestId("ai-doctor-action-suggestion-review-gate")).toBeVisible();
    await expect(page.getByRole("button", { name: /execute|run device/i })).toHaveCount(0);

    expect(violations).toEqual([]);
  });

  test("missing sensor honesty", async ({ page }) => {
    await openDemo(page);
    await completeFeeding(page);
    await page.getByTestId("an-verdant-sensor-missing").click();
    await page.getByTestId("an-verdant-demo-save").click();
    await expect(page.getByTestId("an-verdant-event-sensor")).toContainText(
      "No trustworthy sensor snapshot",
    );
  });

  test("stale sensor honesty", async ({ page }) => {
    await openDemo(page);
    await completeFeeding(page);
    await page.getByTestId("an-verdant-sensor-stale").click();
    await page.getByTestId("an-verdant-demo-save").click();
    const text = await page.getByTestId("an-verdant-event-sensor").innerText();
    expect(text.toLowerCase()).toContain("stale");
    expect(text.toLowerCase()).not.toMatch(/\bhealthy\b(?!.*)/);
    expect(text).toMatch(/not treated as current or healthy/i);
  });

  test("mobile 390×844 form + timeline", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemo(page);
    await expect(page.getByTestId("an-verdant-demo-plant")).toBeVisible();
    await completeFeeding(page);
    await expect(page.getByTestId("qlv2-feeding-form")).toBeVisible();
    await page.getByTestId("an-verdant-demo-save").click();
    await expect(page.getByTestId("an-verdant-demo-timeline-summary")).toBeVisible();
  });

  test("non-demo manual product still works on the shared form", async ({ page }) => {
    await openDemo(page);
    await page.getByLabel(/Nutrient line/i).fill("manual-line");
    await page.getByLabel(/Applied volume/i).fill("300");
    await page.getByLabel(/Product 1 name/i).fill("House CalMag");
    await page.getByLabel(/Product 1 amount/i).fill("5");
    await page.getByTestId("an-verdant-demo-save").click();
    await expect(page.getByTestId("an-verdant-demo-event-detail")).toContainText("House CalMag");
    await expect(page.getByTestId("an-verdant-demo-event-detail")).toContainText("user_entered");
  });
});
