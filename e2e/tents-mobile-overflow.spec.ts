// Browser regression proof for authenticated Tents cards at narrow widths.
//
// SAFETY:
// - Uses a fake session and obviously synthetic, extra-long grow data.
// - Intercepts every Supabase auth, REST, and edge-function request.
// - Performs no real writes, AI calls, alerts, Action Queue changes, or device control.
import { expect, test, type Page } from "@playwright/test";

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const MOCKED_PROJECT = "chromium-mocked";
const FAKE_USER = {
  id: "tents-mobile-browser-user",
  aud: "authenticated",
  email: "tents-mobile@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};
const FAKE_GROW_ID = "11111111-1111-4111-8111-111111111111";
const FAKE_TENT_ID = "22222222-2222-4222-8222-222222222222";
const LONG_TOKEN = "UnbrokenTentName".repeat(18);
const FAKE_GROW = {
  id: FAKE_GROW_ID,
  name: "Mobile overflow proof grow",
  stage: "veg",
  is_archived: false,
  created_at: "2020-01-01T00:00:00.000Z",
};
const FAKE_TENT = {
  id: FAKE_TENT_ID,
  grow_id: FAKE_GROW_ID,
  name: LONG_TOKEN,
  brand: `Brand${LONG_TOKEN}`,
  size: "4x4",
  stage: "veg",
  light_on: true,
  light_schedule: "18/6",
  light_wattage: 400,
  is_archived: false,
  created_at: "2020-01-01T00:00:00.000Z",
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
      : pathname.endsWith("/rest/v1/grows")
        ? [FAKE_GROW]
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

test.describe("Tents mobile overflow closure", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `mobile overflow proof runs once, under the ${MOCKED_PROJECT} project`,
    );
  });

  test("contains an unbroken tent name at 320px, 360px, and 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedFakeSession(page);
    await mockSignedInSupabase(page);
    await page.goto(`/tents?growId=${FAKE_GROW_ID}`);
    await acceptReconsentGateIfShown(page);

    const root = page.getByTestId("tents-root");
    const card = page.getByTestId(`tents-card-${FAKE_TENT_ID}`);
    await expect(root).toBeVisible();
    await expect(card).toContainText(LONG_TOKEN);

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 740 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const metrics = await card.evaluate((cardElement) => {
        const rootElement = cardElement.closest<HTMLElement>("[data-testid='tents-root']");
        if (!rootElement) throw new Error("Tents overflow proof root missing");
        return {
          documentOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          rootOverflow: rootElement.scrollWidth - rootElement.clientWidth,
          cardOverflow: cardElement.scrollWidth - cardElement.clientWidth,
        };
      });

      expect(
        metrics.documentOverflow,
        `${viewport.width}px document horizontal overflow px`,
      ).toBeLessThanOrEqual(0);
      expect(
        metrics.rootOverflow,
        `${viewport.width}px Tents page horizontal overflow px`,
      ).toBeLessThanOrEqual(0);
      expect(
        metrics.cardOverflow,
        `${viewport.width}px tent card horizontal overflow px`,
      ).toBeLessThanOrEqual(0);
    }
  });
});
