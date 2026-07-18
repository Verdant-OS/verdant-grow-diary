import { test, expect } from "@playwright/test";

/**
 * /pheno-hunts/:id/compare invalid / unknown id regression (LIVE page).
 *
 * The live PhenoHuntCompare page reads the grower's own hunt via an
 * RLS-scoped Supabase SELECT. With an unknown id (mocked to return no hunt),
 * it must render a clear read-only error state and NOT:
 *  - crash the page
 *  - log console errors
 *  - reach AI / Action Queue / device-control hosts
 *  - expose any write controls
 *
 * Supabase REST IS expected (the page reads the hunt); it is intercepted here
 * to return "no hunt", so the spec is hermetic. AI/Action Queue/device hosts
 * remain forbidden.
 */

const INVALID_ROUTE = "/pheno-hunts/not-a-real-id/compare";

const FORBIDDEN_HOST_RE = /(openai|anthropic|action-queue|device-control)/i;

test(`invalid deep-link ${INVALID_ROUTE} renders a safe read-only error state`, async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const forbiddenRequests: string[] = [];
  const unexpectedRestRequests: string[] = [];
  const restMutationRequests: string[] = [];

  page.on("console", (msg) => msg.type() === "error" && consoleErrors.push(msg.text()));
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("requestfailed", (req) =>
    failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText ?? ""}`),
  );
  page.on("request", (req) => {
    if (FORBIDDEN_HOST_RE.test(req.url())) forbiddenRequests.push(`${req.method()} ${req.url()}`);
  });

  // Unknown hunt → maybeSingle returns no row. A catch-all owns the REST
  // boundary so a future read cannot silently escape to the real project.
  await page.route(/\/rest\/v1\//i, async (route) => {
    const request = route.request();
    const requestLabel = `${request.method()} ${request.url()}`;
    const table = new URL(request.url()).pathname.match(/\/rest\/v1\/([^/]+)/i)?.[1] ?? "";

    if (request.method() !== "GET") {
      restMutationRequests.push(requestLabel);
      await route.abort("blockedbyclient");
      return;
    }
    if (table !== "pheno_hunts") {
      unexpectedRestRequests.push(requestLabel);
      await route.abort("blockedbyclient");
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
  });
  await page.route(/\/auth\/v1\//i, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );

  await page.goto(INVALID_ROUTE, { waitUntil: "domcontentloaded" });

  // A clear read-only error/empty state is shown (never a crash, never fixtures).
  await expect(page.getByTestId("pheno-hunt-compare-error")).toBeVisible();

  // Retry is an explicit read-only refetch control. There are no data-entry
  // controls, forms, or any additional buttons that could imply a write.
  expect(await page.locator("form, input, textarea, select").count()).toBe(0);
  const buttons = page.getByRole("button");
  await expect(buttons).toHaveCount(1);
  await expect(page.getByTestId("pheno-hunt-compare-error-retry")).toHaveAttribute(
    "type",
    "button",
  );

  expect(consoleErrors, "console errors on invalid deep-link").toEqual([]);
  // Ignore favicon/sourcemap dev noise and third-party analytics (GA).
  expect(
    failedRequests.filter(
      (r) => !/favicon|\.map($|\?)|google-analytics|googletagmanager|doubleclick/i.test(r),
    ),
    "failed requests on invalid deep-link",
  ).toEqual([]);
  expect(
    forbiddenRequests,
    "invalid deep-link must not call AI / Action Queue / device hosts",
  ).toEqual([]);
  expect(unexpectedRestRequests, "unexpected Supabase REST reads must be blocked").toEqual([]);
  expect(restMutationRequests, "invalid deep-link must not mutate Supabase REST").toEqual([]);
});
