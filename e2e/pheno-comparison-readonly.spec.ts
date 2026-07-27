import { test, expect, type Page, type Request } from "@playwright/test";

/**
 * /pheno-comparison read-only + reload + responsive smoke — selection-grade
 * surface.
 *
 * Verifies (mobile/tablet/desktop):
 *  - The read-only preview renders its demo disclaimer, six-source legend,
 *    comparability verdict, and candidate cards.
 *  - A full browser reload re-renders the same surface.
 *  - Zero interactive write controls (no button/form/input/select/textarea).
 *  - No requests to Supabase / AI / Action-Queue / device-control hosts.
 *
 * NOTE: we do NOT assert "zero failed requests" — the app's analytics
 * (AnalyticsShell, from the committed public `.env`) fires Google-Analytics
 * beacons that abort in headless CI; those are benign and host-allowlisted
 * below. Forbidden-host and write-surface assertions are the real gates.
 *
 * Safety: read-only route mounted outside AppShell + providers (fixture-only).
 * No auth, no Supabase, no writes, no clicks.
 */

// External data-plane hosts/paths this read-only surface must never touch.
// Only EXTERNAL requests are inspected — the Vite dev server serves the app's
// own source modules from localhost (e.g. /src/pages/ActionQueue.tsx because
// App.tsx statically imports every page), which are not data-plane calls.
const FORBIDDEN_REQUEST_RE =
  /(?:supabase\.(?:co|in|net)|\/rest\/v1\/|\/auth\/v1\/|\/functions\/v1\/|openai\.com|anthropic\.com|api\.groq|shelly\.cloud|ecowitt\.net)/i;

function isLocalhost(url: string): boolean {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(url);
}

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1024", width: 1024, height: 800 },
];

const SOURCE_KEYS = ["live", "manual", "csv", "demo", "stale", "invalid"] as const;

async function assertReadOnlySurface(page: Page) {
  const region = page.getByTestId("pheno-comparison-page");
  await expect(region).toBeVisible();
  await expect(page.getByTestId("pheno-comparison-read-only-badge")).toContainText(
    /read-only preview/i,
  );
  await expect(page.getByTestId("pheno-comparison-demo-banner")).toContainText(
    /demo comparison data.*not live sensor data/i,
  );
  await expect(page.getByTestId("pheno-comparison-comparability-verdict")).not.toBeEmpty();

  const legend = page.getByTestId("pheno-comparison-source-legend");
  await expect(legend).toBeVisible();
  for (const source of SOURCE_KEYS) {
    await expect(legend.getByTestId(`legend-${source}`)).toBeVisible();
  }

  expect(
    await region.locator("section[data-testid^='pheno-candidate-']").count(),
    "demo candidate sections render",
  ).toBeGreaterThanOrEqual(2);
}

async function assertNoWriteControls(page: Page) {
  const region = page.getByTestId("pheno-comparison-page");
  for (const tag of ["button", "form", "input", "select", "textarea"]) {
    expect(await region.locator(tag).count(), `read-only surface must have no <${tag}>`).toBe(0);
  }
  expect(await region.locator("[role='button']").count()).toBe(0);
}

for (const vp of VIEWPORTS) {
  test(`/pheno-comparison is read-only + reloadable @ ${vp.name}`, async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    const forbidden: string[] = [];
    const pageErrors: string[] = [];
    page.on("request", (r: Request) => {
      const url = r.url();
      if (isLocalhost(url)) return; // Vite dev-server module requests, not data-plane
      if (FORBIDDEN_REQUEST_RE.test(url)) forbidden.push(`${r.method()} ${url}`);
    });
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/pheno-comparison", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: /pheno comparison/i })).toBeVisible();
    await assertReadOnlySurface(page);
    await assertNoWriteControls(page);

    // Full reload re-renders the same surface.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: /pheno comparison/i })).toBeVisible();
    await assertReadOnlySurface(page);
    await assertNoWriteControls(page);

    expect(pageErrors, "uncaught page errors on /pheno-comparison").toEqual([]);
    expect(
      forbidden,
      "read-only surface must not call Supabase/AI/Action-Queue/device hosts",
    ).toEqual([]);
  });
}
