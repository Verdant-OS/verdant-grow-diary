// Mocked Settings smoke: the owner badge shelf stays absent while its display
// flag is false. No real Supabase calls. This does not prove the SQL kill switch.
import { test, expect, type Page } from "@playwright/test";
import { CURRENT_AGREEMENT_LIST } from "../src/constants/agreements";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "../src/lib/analyticsConsent";

const SB_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SB_SESSION_KEY = `sb-${SB_PROJECT_REF}-auth-token`;

// AgreementReconsentGate opens a modal when user_agreement_acceptances is empty.
// That modal removes Settings from the accessibility tree. Return the current
// registry rows so the gate stays closed. Analytics consent is stored as denied
// so the banner does not cover the page.
const CURRENT_AGREEMENT_ROWS = CURRENT_AGREEMENT_LIST.map((agreement) => ({
  agreement_type: agreement.type,
  version: agreement.version,
}));

const FAKE_USER = {
  id: "test-user-id",
  aud: "authenticated",
  email: "x@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};

async function seedFakeSession(page: Page) {
  await page.addInitScript(
    ({ key, user, consentKey }) => {
      const fakeSession = {
        access_token: "FAKE-ACCESS-TOKEN-NOT-REAL",
        refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      };
      try {
        sessionStorage.setItem(key, JSON.stringify(fakeSession));
        localStorage.setItem(consentKey, "denied");
      } catch {
        /* ignore */
      }
    },
    { key: SB_SESSION_KEY, user: FAKE_USER, consentKey: ANALYTICS_CONSENT_STORAGE_KEY },
  );
}

test.describe("owner badge shelf stays hidden while the display flag is off", () => {
  test("Settings does not render the shelf", async ({ page }) => {
    await seedFakeSession(page);
    await page.route(/\/auth\/v1\//, async (route, req) => {
      if (/\/user/i.test(req.url())) {
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
      const body = pathname.endsWith("/user_agreement_acceptances")
        ? JSON.stringify(CURRENT_AGREEMENT_ROWS)
        : "[]";
      await route.fulfill({ status: 200, contentType: "application/json", body });
    });

    await page.goto("/settings");
    const gate = page.getByTestId("agreement-reconsent-gate");
    const gateShown = await gate
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (gateShown) {
      await gate.locator("#reconsent-accept").click();
      await gate.getByRole("button", { name: /accept and continue/i }).click();
      await gate.waitFor({ state: "hidden", timeout: 15_000 });
    }
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByTestId("owner-badge-shelf")).toHaveCount(0);
    await expect(page.getByText(FAKE_USER.email)).toBeVisible();
  });
});
