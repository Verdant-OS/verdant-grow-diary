// Layout proof for #2740. Hermetic mocked session only. No production writes.
//
// package.json `e2e:mocked-closure` names this file. The Mocked E2E closure
// workflow runs that script. That job is not one of the 35 required checks.
import { expect, test, type Page } from "@playwright/test";
import { CURRENT_AGREEMENT_LIST } from "../src/constants/agreements";

const CURRENT_AGREEMENT_ROWS = CURRENT_AGREEMENT_LIST.map((agreement) => ({
  agreement_type: agreement.type,
  version: agreement.version,
}));

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const MOCKED_PROJECT = "chromium-mocked";
const WIDTHS = [320, 360, 393, 430] as const;
const FAKE_USER = {
  id: "dashboard-label-fab-browser-user",
  aud: "authenticated",
  email: "dashboard-label-fab@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};
const FAKE_GROW_ID = "11111111-1111-4111-8111-111111111111";
const FAKE_TENT_ID = "22222222-2222-4222-8222-222222222222";
const FAKE_TENT = {
  id: FAKE_TENT_ID,
  grow_id: FAKE_GROW_ID,
  name: "North wall proof tent with the long method line",
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
  plant_type: "unknown",
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
    const rows = pathname.endsWith("/rest/v1/user_agreement_acceptances")
      ? CURRENT_AGREEMENT_ROWS
      : pathname.endsWith("/rest/v1/tents")
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
  await page.route(
    /^https:\/\/(?:[^/]+\.)?(?:google-analytics\.com|googletagmanager\.com)\//,
    (route) => route.abort(),
  );
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

async function openShell(page: Page, viewport: { width: number; height: number }, path = "/") {
  await page.setViewportSize(viewport);
  await seedFakeSession(page);
  await mockSignedInSupabase(page);
  await page.goto(path);
  await acceptReconsentGateIfShown(page);
  await expect(page.getByTestId("mobile-quick-log-fab")).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page) {
  const fit = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth);
}

async function assertMethodLabelStacksAtPhoneWidth(page: Page) {
  const method = page.getByTestId("dashboard-daily-grow-check-panel-row-method").first();
  await expect(method).toBeVisible();
  const layout = await method.evaluate((element) => {
    const row = element.closest("[data-testid='dashboard-daily-grow-check-panel-row']");
    const nameEl = row?.querySelector(
      "[data-testid='dashboard-daily-grow-check-panel-plant-link']",
    );
    const actionsEl = row?.querySelector(
      "[data-testid='dashboard-daily-grow-check-panel-row-actions']",
    );
    if (!nameEl || !actionsEl) throw new Error("grow-check name or actions missing");
    const nameBox = nameEl.getBoundingClientRect();
    const methodBox = element.getBoundingClientRect();
    const actionsBox = actionsEl.getBoundingClientRect();
    return {
      methodScrollWidth: element.scrollWidth,
      methodClientWidth: element.clientWidth,
      methodTop: methodBox.top,
      methodBottom: methodBox.bottom,
      nameBottom: nameBox.bottom,
      actionsTop: actionsBox.top,
    };
  });
  expect(layout.methodTop).toBeGreaterThanOrEqual(layout.nameBottom - 1);
  // Column layout from max-[430px]:flex-col. Buttons beside the method sit
  // above its bottom edge, so this fails if that class is removed.
  expect(layout.actionsTop).toBeGreaterThanOrEqual(layout.methodBottom - 1);
  expect(layout.methodScrollWidth).toBeLessThanOrEqual(layout.methodClientWidth);
}

async function assertFabClearsLastContent(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const clearance = await page.evaluate(() => {
    const footer = document.querySelector("[data-testid='app-shell-legal-footer']");
    const fab = document.querySelector("[data-testid='mobile-quick-log-fab']");
    if (!footer || !fab) throw new Error("footer or FAB missing");
    return {
      footerBottom: footer.getBoundingClientRect().bottom,
      fabTop: fab.getBoundingClientRect().top,
    };
  });
  expect(clearance.footerBottom).toBeLessThanOrEqual(clearance.fabTop + 1);
}

test.describe("Dashboard mobile label and FAB clearance #2740", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `label and FAB proof runs once, under the ${MOCKED_PROJECT} project`,
    );
  });

  for (const width of WIDTHS) {
    test(`fits labels and clears the FAB at ${width}px`, async ({ page }) => {
      await openShell(page, { width, height: 852 });
      await expect(page.getByTestId("dashboard-root")).toBeVisible();
      await assertNoHorizontalOverflow(page);
      if (width === 393) await assertMethodLabelStacksAtPhoneWidth(page);

      const noteHeight = await page
        .getByTestId("dashboard-daily-grow-check-panel-row-action-note")
        .first()
        .evaluate((element) => element.getBoundingClientRect().height);
      expect(noteHeight).toBeGreaterThanOrEqual(44);

      const filter = page.getByTestId("dashboard-daily-grow-check-panel-filter");
      await filter.click();
      await page
        .getByTestId("dashboard-daily-grow-check-panel-filter-option-sensor-snapshot")
        .click();
      const filterFit = await filter.evaluate((element) => {
        const label = element.querySelector("span") ?? element;
        return {
          scrollWidth: label.scrollWidth,
          clientWidth: label.clientWidth,
          height: element.getBoundingClientRect().height,
        };
      });
      expect(filterFit.scrollWidth).toBeLessThanOrEqual(filterFit.clientWidth);
      expect(filterFit.height).toBeGreaterThanOrEqual(44);

      await assertFabClearsLastContent(page);
      await assertNoHorizontalOverflow(page);
    });
  }

  test("AppShell clearance holds on Alerts and Settings at 393px", async ({ page }) => {
    await openShell(page, { width: 393, height: 852 });
    for (const path of ["/alerts", "/settings"]) {
      await page.goto(path);
      await expect(page.getByTestId("mobile-quick-log-fab")).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertFabClearsLastContent(page);
    }
  });
});
