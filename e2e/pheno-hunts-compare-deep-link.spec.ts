import { test, expect, type Page } from "@playwright/test";
import { denyAnalyticsConsent } from "./utils/analyticsConsent";

/**
 * Third-party font CSS is not part of the app's own network surface; fulfilling
 * it with empty CSS keeps the spec hermetic in offline/proxied environments
 * where fonts.googleapis.com is unreachable (a reset there is a console error).
 */
async function mockThirdPartyFonts(page: Page) {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//i, (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
}

/**
 * Pheno Comparison deep-link browser regression.
 *
 * Two surfaces now exist:
 *  - /pheno-comparison        → PhenoComparison: fixture-only, ZERO network,
 *    outside AppShell, public. (unchanged safety posture)
 *  - /pheno-hunts/:id/compare → PhenoHuntCompare: LIVE, reads the grower's own
 *    hunt via an RLS-scoped Supabase SELECT. Still read-only: no writes, no AI,
 *    no Action Queue, no device control. All /rest/v1 traffic is intercepted
 *    here so the spec is hermetic (no real project calls).
 */

const SOURCES = ["live", "manual", "csv", "demo", "stale", "invalid"] as const;

// The live page must never reach AI / Action Queue / device-control hosts.
// Supabase REST IS allowed for the live route (it reads the hunt), so it is
// intentionally absent from this denylist.
const FORBIDDEN_HOST_RE = /(openai|anthropic|action-queue|device-control)/i;

const HUNT_ID = "11111111-1111-1111-1111-111111111111";

interface RestBoundaryCapture {
  unexpected: string[];
  mutations: string[];
}

const LIVE_REST_READS: Readonly<Record<string, unknown>> = {
  pheno_hunts: {
    id: HUNT_ID,
    name: "Blue Dream Hunt",
    grow_id: "g1",
    tent_id: "t1",
  },
  plants: [
    {
      id: "p1",
      name: "BD #1",
      candidate_label: "BD #1",
      strain: "Blue Dream",
      stage: "flower",
      grow_id: "g1",
      tent_id: "t1",
      photo_url: null,
      is_archived: false,
    },
    {
      id: "p2",
      name: "BD #2",
      candidate_label: "BD #2",
      strain: "Blue Dream",
      stage: "flower",
      grow_id: "g1",
      tent_id: "t1",
      photo_url: null,
      is_archived: false,
    },
  ],
  grows: [{ id: "g1", name: "Summer Grow" }],
  tents: [{ id: "t1", name: "Flower Tent" }],
  pheno_candidate_scores: [],
  pheno_smoke_tests: [],
  pheno_lab_results: [],
  diary_entries: [],
};

async function mockLiveHunt(page: Page, capture: RestBoundaryCapture) {
  // One catch-all owns the entire Supabase REST boundary. Expected read-only
  // tables receive deterministic fixtures; every other REST request is
  // blocked before it can reach the real project and is asserted below.
  await page.route(/\/rest\/v1\//i, async (route) => {
    const request = route.request();
    const requestLabel = `${request.method()} ${request.url()}`;
    const table = new URL(request.url()).pathname.match(/\/rest\/v1\/([^/]+)/i)?.[1] ?? "";

    // The tent-context enrichment calls the read-only snapshot RPC. PostgREST
    // invokes RPCs over POST — and ONLY POST — so each exception requires it:
    // a PUT/PATCH/DELETE to the same path must still fall through to the
    // mutation fence below instead of being silently fulfilled.
    if (
      request.method() === "POST" &&
      /\/rpc\/get_latest_tent_sensor_snapshot$/i.test(new URL(request.url()).pathname)
    ) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
      return;
    }

    // Diary evidence rides the read-only top-N-per-plant RPC (same POST-only
    // transport rule); an empty set matches the diary_entries fixture.
    if (
      request.method() === "POST" &&
      /\/rpc\/pheno_candidate_diary_entries_top_n$/i.test(new URL(request.url()).pathname)
    ) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    if (request.method() !== "GET") {
      capture.mutations.push(requestLabel);
      await route.abort("blockedbyclient");
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(LIVE_REST_READS, table)) {
      capture.unexpected.push(requestLabel);
      await route.abort("blockedbyclient");
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(LIVE_REST_READS[table]),
    });
  });
  await page.route(/\/auth\/v1\//i, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
}

test("fixture route /pheno-comparison renders demo panels + legend, zero network", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("requestfailed", (r) =>
    failedRequests.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? ""}`),
  );

  // The consent banner is not this spec's subject; a stored refusal keeps the
  // no-write-controls contract deterministic (and no analytics ever loads).
  await denyAnalyticsConsent(page);
  await mockThirdPartyFonts(page);
  await page.goto("/pheno-comparison", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("pheno-comparison-page")).toHaveAttribute("data-mode", "demo");
  await expect(page.getByTestId("pheno-comparison-demo-banner")).toContainText(/not live/i);
  const legend = page.getByTestId("pheno-comparison-source-legend");
  for (const src of SOURCES) await expect(legend.getByTestId(`legend-${src}`)).toBeVisible();
  const cards = page
    .getByTestId("pheno-comparison-grid")
    .locator('[data-testid^="pheno-candidate-"]');
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  // Fixture page has no write controls.
  expect(await page.locator("button, form, input, textarea, select").count()).toBe(0);
  expect(consoleErrors, "console errors").toEqual([]);
  // Ignore favicon/sourcemap dev noise and third-party analytics (GA) that the
  // app fires on page load — neither is part of the app's own network surface.
  expect(
    failedRequests.filter(
      (r) => !/favicon|\.map($|\?)|google-analytics|googletagmanager|doubleclick/i.test(r),
    ),
    "failed requests",
  ).toEqual([]);
});

test("live route /pheno-hunts/:id/compare renders a real hunt's candidates (mocked)", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const forbidden: string[] = [];
  const restBoundary: RestBoundaryCapture = { unexpected: [], mutations: [] };
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  // Match on the hostname only: in dev, the app's own route modules are
  // served as /src/routes/_app/action-queue.tsx from the same origin, and a
  // full-URL match would misread that module load as an Action Queue call.
  page.on(
    "request",
    (r) =>
      FORBIDDEN_HOST_RE.test(new URL(r.url()).hostname) &&
      forbidden.push(`${r.method()} ${r.url()}`),
  );

  await denyAnalyticsConsent(page);
  await mockThirdPartyFonts(page);
  await mockLiveHunt(page, restBoundary);
  await page.goto(`/pheno-hunts/${HUNT_ID}/compare`, { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("pheno-comparison-page")).toHaveAttribute("data-mode", "live");
  await expect(page.getByTestId("pheno-comparison-live-hunt")).toContainText(/Blue Dream Hunt/);
  // No demo banner on the live surface.
  await expect(page.getByTestId("pheno-comparison-demo-banner")).toHaveCount(0);
  const legend = page.getByTestId("pheno-comparison-source-legend");
  for (const src of SOURCES) await expect(legend.getByTestId(`legend-${src}`)).toBeVisible();
  const cards = page
    .getByTestId("pheno-comparison-grid")
    .locator('[data-testid^="pheno-candidate-"]');
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  // Read-only: the live comparison surface renders no write controls.
  expect(await page.locator("button, form, input, textarea, select").count()).toBe(0);

  expect(consoleErrors, "console errors on live route").toEqual([]);
  expect(restBoundary.unexpected, "unexpected Supabase REST reads must be blocked").toEqual([]);
  expect(restBoundary.mutations, "live comparison must not mutate Supabase REST").toEqual([]);
  expect(forbidden, "live route must not call AI/Action Queue/device hosts").toEqual([]);
});
