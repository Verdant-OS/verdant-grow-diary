// Browser regression proof for the post-Claude route/access closure.
//
// SAFETY:
// - Uses a clearly fake session.
// - Intercepts every Supabase auth, REST, and edge-function request.
// - Performs no real writes, AI calls, ingest, alerts, Action Queue changes,
//   or device control.
import { expect, test, type Page } from "@playwright/test";

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const FAKE_USER = {
  id: "post-claude-browser-user",
  aud: "authenticated",
  email: "post-claude@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};
const FAKE_TENT_ID = "11111111-1111-4111-8111-111111111111";
const FAKE_TENT = {
  id: FAKE_TENT_ID,
  grow_id: "22222222-2222-4222-8222-222222222222",
  name: "Browser Proof Tent",
  brand: "",
  size: "2x2",
  stage: "veg",
  light_on: true,
  light_schedule: "18/6",
  light_wattage: 100,
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

async function mockSignedInSupabase(
  page: Page,
  options: { operatorGranted: boolean; onOperatorAuditRead?: () => void },
) {
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
    const url = request.url();
    if (url.includes("/rpc/has_role")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(options.operatorGranted),
      });
      return;
    }
    const selectedColumns = new URL(url).searchParams.get("select") ?? "";
    if (new URL(url).pathname.endsWith("/rest/v1/tents")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([FAKE_TENT]),
      });
      return;
    }
    if (url.includes("sensor_ingest_audit_log") && selectedColumns.includes("tent_id")) {
      options.onOperatorAuditRead?.();
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
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

test.describe("post-Claude route and operator-access closure", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("/dashboard renders the authenticated Dashboard and preserves grow scope", async ({
    page,
  }) => {
    await seedFakeSession(page);
    await mockSignedInSupabase(page, { operatorGranted: false });

    await page.goto("/dashboard?growId=mock-grow");
    await acceptReconsentGateIfShown(page);

    await expect(page.getByTestId("dashboard-root")).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\?growId=mock-grow$/);
    await expect(page.getByText("Oops! Page not found")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("?operator=1 cannot reveal diagnostics or trigger audit reads for a grower", async ({
    page,
  }) => {
    let auditReads = 0;
    await seedFakeSession(page);
    await mockSignedInSupabase(page, {
      operatorGranted: false,
      onOperatorAuditRead: () => {
        auditReads += 1;
      },
    });

    await page.goto("/sensors?operator=1");
    await acceptReconsentGateIfShown(page);

    await expect(page.getByRole("heading", { name: "Sensor Data" })).toBeVisible();
    await page.getByRole("button", { name: FAKE_TENT.name }).click();
    await expect(page.getByTestId("sensors-operator-diagnostics")).toHaveCount(0);
    expect(auditReads).toBe(0);
  });

  test("verified operators retain diagnostics and the dedicated audit link", async ({ page }) => {
    let auditReads = 0;
    await seedFakeSession(page);
    await mockSignedInSupabase(page, {
      operatorGranted: true,
      onOperatorAuditRead: () => {
        auditReads += 1;
      },
    });

    await page.goto("/sensors?operator=1");
    await acceptReconsentGateIfShown(page);

    await page.getByRole("button", { name: FAKE_TENT.name }).click();
    await expect(page.getByTestId("sensors-operator-diagnostics")).toBeVisible();
    const auditLink = page.getByRole("link", { name: "EcoWitt Audit" });
    await expect(auditLink).toHaveAttribute(
      "href",
      "/sensors/ecowitt-audit",
    );
    await expect.poll(() => auditReads).toBeGreaterThan(0);

    await auditLink.click();
    await expect(page).toHaveURL(/\/sensors\/ecowitt-audit$/);
    await expect(page.getByTestId("ecowitt-audit-page")).toBeVisible();
    await expect(auditLink).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Sensors", exact: true })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
