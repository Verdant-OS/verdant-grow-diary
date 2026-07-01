import { test, expect } from "@playwright/test";

/**
 * /pheno-hunts/:id/compare invalid-id deep-link regression.
 *
 * Confirms that deep-linking with a non-UUID / non-existent id does NOT:
 *  - crash the page
 *  - log console errors
 *  - trigger failed network requests to Supabase/AI/Action Queue/devices
 *  - expose any write controls
 *
 * The route is mounted OUTSIDE the AppShell auth wall and uses fixture-
 * only data, so no auth bypass or credentials are needed. The page
 * either renders the fixture-safe fallback or a clear read-only empty
 * state — both are acceptable and asserted below.
 */

const INVALID_ROUTE = "/pheno-hunts/not-a-real-id/compare";

const FORBIDDEN_NETWORK_HOST_RE =
  /(supabase\.co|supabase\.in|openai|anthropic|action-queue|device-control)/i;

test(`invalid deep-link ${INVALID_ROUTE} renders safe fallback`, async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const forbiddenRequests: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });
  page.on("requestfailed", (req) => {
    failedRequests.push(
      `${req.method()} ${req.url()} :: ${req.failure()?.errorText ?? ""}`,
    );
  });
  page.on("request", (req) => {
    if (FORBIDDEN_NETWORK_HOST_RE.test(req.url())) {
      forbiddenRequests.push(`${req.method()} ${req.url()}`);
    }
  });

  await page.goto(INVALID_ROUTE, { waitUntil: "domcontentloaded" });

  // Page mounts safely — the fixture-only route always renders the shell.
  const shell = page.getByTestId("pheno-comparison-page");
  await expect(shell).toBeVisible();

  // Either candidate panels render (fixture-safe fallback) OR a clear
  // empty state / read-only surface is shown. Both are safe outcomes.
  const grid = page.getByTestId("pheno-comparison-grid");
  const errorState = page.getByTestId("pheno-comparison-error");
  const gridVisible = await grid.isVisible().catch(() => false);
  const errorVisible = await errorState.isVisible().catch(() => false);
  expect(
    gridVisible || errorVisible,
    "expected either fixture-safe grid OR a clear empty state",
  ).toBe(true);

  // Read-only / demo / not-live framing always available on this route.
  await expect(
    page.getByTestId("pheno-comparison-read-only-badge"),
  ).toBeVisible();
  await expect(
    page.getByTestId("pheno-comparison-demo-banner"),
  ).toContainText(/not live/i);

  // Six-source legend still renders on the shell.
  await expect(
    page.getByTestId("pheno-comparison-source-legend"),
  ).toBeVisible();

  // Absolutely no write controls — presenter is read-only by construction.
  expect(await page.locator("button").count()).toBe(0);
  expect(await page.locator("form").count()).toBe(0);
  expect(await page.locator("input").count()).toBe(0);
  expect(await page.locator("textarea").count()).toBe(0);
  expect(await page.locator("select").count()).toBe(0);

  expect(consoleErrors, "console errors on invalid deep-link").toEqual([]);
  const relevantFailures = failedRequests.filter(
    (r) => !/favicon|\.map($|\?)/i.test(r),
  );
  expect(relevantFailures, "failed requests on invalid deep-link").toEqual([]);
  expect(
    forbiddenRequests,
    "invalid deep-link must not call Supabase/AI/Action Queue/device hosts",
  ).toEqual([]);
});
