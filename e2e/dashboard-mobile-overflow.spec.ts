// Browser regression proof for the authenticated Dashboard at mobile width.
//
// SAFETY:
// - Uses a clearly fake session.
// - Intercepts every Supabase auth, REST, and edge-function request.
// - Performs no real writes, AI calls, ingest, alerts, Action Queue changes,
//   or device control.
import { expect, test, type Page } from "@playwright/test";

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const MOCKED_PROJECT = "chromium-mocked";
const FAKE_USER = {
  id: "dashboard-mobile-browser-user",
  aud: "authenticated",
  email: "dashboard-mobile@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};
const FAKE_GROW_ID = "11111111-1111-4111-8111-111111111111";
const FAKE_TENT_ID = "22222222-2222-4222-8222-222222222222";
const FAKE_TENT = {
  id: FAKE_TENT_ID,
  grow_id: FAKE_GROW_ID,
  name: "Mobile Proof Tent",
  brand: "",
  size: "2x2",
  stage: "veg",
  light_on: true,
  light_schedule: "18/6",
  light_wattage: 100,
  is_archived: false,
  created_at: "2020-01-01T00:00:00.000Z",
};
const FAKE_PLANT = {
  id: "33333333-3333-4333-8333-333333333333",
  grow_id: FAKE_GROW_ID,
  tent_id: FAKE_TENT_ID,
  name: "Mobile Proof Plant",
  strain: "Browser fixture",
  stage: "veg",
  started_at: "2020-01-01T00:00:00.000Z",
  health: "healthy",
  photo_url: null,
  last_note: null,
  is_archived: false,
  medium: "soil",
  pot_size: "3 gal",
};

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

async function mockSignedInSupabase(page: Page) {
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
  await page.route(/\/rest\/v1\//, async (route, request) => {
    const pathname = new URL(request.url()).pathname;
    const rows = pathname.endsWith("/rest/v1/tents")
      ? [FAKE_TENT]
      : pathname.endsWith("/rest/v1/plants")
        ? [FAKE_PLANT]
        : pathname.endsWith("/rest/v1/grows")
          ? [
              {
                id: FAKE_GROW_ID,
                name: "Mobile Proof Grow",
                stage: "veg",
                is_archived: false,
                created_at: "2020-01-01T00:00:00.000Z",
              },
            ]
          : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(rows),
    });
  });
  await page.route(/\/functions\/v1\//, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route(/google-analytics\.com|googletagmanager\.com/, (route) => route.abort());
}

async function acceptReconsentGateIfShown(page: Page) {
  const gate = page.getByTestId("agreement-reconsent-gate");
  const shown = await gate
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;
  await gate.locator("#reconsent-accept").click();
  await gate.getByRole("button", { name: /accept and continue/i }).click();
  await gate.waitFor({ state: "hidden", timeout: 15_000 });
}

async function openDashboard(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await seedFakeSession(page);
  await mockSignedInSupabase(page);

  await page.goto("/");
  await acceptReconsentGateIfShown(page);

  const dashboard = page.getByTestId("dashboard-root");
  await expect(dashboard).toBeVisible();
  await expect(page.getByRole("link", { name: "Quick Log", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open tents", exact: true })).toBeVisible();
  return dashboard;
}

async function readOverflowMetrics(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-testid='dashboard-root']");
    const row = document.querySelector<HTMLElement>(
      "[data-testid='dashboard-daily-grow-check-panel-row']",
    );
    const actions = document.querySelector<HTMLElement>(
      "[data-testid='dashboard-daily-grow-check-panel-row-actions']",
    );
    if (!root || !row || !actions) throw new Error("Dashboard overflow proof surfaces missing");
    return {
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      dashboard: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth },
      row: { clientWidth: row.clientWidth, scrollWidth: row.scrollWidth },
      actions: { clientWidth: actions.clientWidth, scrollWidth: actions.scrollWidth },
    };
  });
}

function expectNoOverflow(metrics: Awaited<ReturnType<typeof readOverflowMetrics>>) {
  for (const surface of Object.values(metrics)) {
    expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth);
  }
}

test.describe("Dashboard mobile overflow closure", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `mobile overflow proof runs once, under the ${MOCKED_PROJECT} project`,
    );
  });

  test("keeps the Dashboard inside a 390px viewport without changing the action row", async ({
    page,
  }) => {
    await openDashboard(page, { width: 390, height: 844 });
    const actions = page.getByTestId("dashboard-daily-grow-check-panel-row-actions").first();
    await expect(actions).toBeVisible();

    expectNoOverflow(await readOverflowMetrics(page));

    const noteTop = await page
      .getByTestId("dashboard-daily-grow-check-panel-row-action-note")
      .first()
      .evaluate((element) => element.getBoundingClientRect().top);
    const sensorTop = await page
      .getByTestId("dashboard-daily-grow-check-panel-row-action-sensor")
      .first()
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(sensorTop).toBe(noteTop);
  });

  test("stacks Daily Grow Check rows inside a 320px viewport", async ({ page }) => {
    await openDashboard(page, { width: 320, height: 568 });
    await expect(page.getByTestId("dashboard-daily-grow-check-panel-row-actions").first()).toBeVisible();

    expectNoOverflow(await readOverflowMetrics(page));
  });
});
