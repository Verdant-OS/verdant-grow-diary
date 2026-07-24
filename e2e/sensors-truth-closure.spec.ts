// Browser regression proof for authenticated Sensors truth handling.
//
// SAFETY:
// - Uses a clearly fake session and fabricated fixtures.
// - Intercepts every Supabase auth, REST, and edge-function request.
// - Performs no real writes, ingest, AI calls, alerts, Action Queue changes,
//   token minting, automation, or device control.
import { expect, test, type Page } from "@playwright/test";

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const MOCKED_PROJECT = "chromium-mocked";
const FAKE_USER = {
  id: "sensor-truth-browser-user",
  aud: "authenticated",
  email: "sensor-truth@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};
const GROW_ID = "33333333-3333-4333-8333-333333333333";
const TENT_A_ID = "11111111-1111-4111-8111-111111111111";
const TENT_B_ID = "22222222-2222-4222-8222-222222222222";

function tent(id: string, name: string) {
  return {
    id,
    grow_id: GROW_ID,
    name,
    brand: "",
    size: "2x2",
    stage: "veg",
    light_on: true,
    light_schedule: "18/6",
    light_wattage: 100,
    is_archived: false,
    created_at: "2020-01-01T00:00:00.000Z",
  };
}

function sensorRow(
  id: string,
  tentId: string,
  ts: string,
  metric: string,
  value: number,
) {
  return {
    id,
    tent_id: tentId,
    metric,
    value,
    quality: "ok",
    source: "csv",
    ts,
    captured_at: ts,
    created_at: ts,
    raw_payload: null,
  };
}

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
  options: {
    tents: Array<ReturnType<typeof tent>>;
    sensorRows: Array<ReturnType<typeof sensorRow>>;
    onTentScopedSensorRead?: (tentId: string) => void;
  },
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
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname.endsWith("/rest/v1/rpc/has_role")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "false" });
      return;
    }

    if (pathname.endsWith("/rest/v1/tents")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(options.tents),
      });
      return;
    }

    if (pathname.endsWith("/rest/v1/sensor_readings")) {
      const rawTentScope = url.searchParams.get("tent_id");
      const scopedTentId = rawTentScope?.startsWith("eq.") ? rawTentScope.slice(3) : null;
      if (scopedTentId) options.onTentScopedSensorRead?.(scopedTentId);
      const rows = scopedTentId
        ? options.sensorRows.filter((row) => row.tent_id === scopedTentId)
        : options.sensorRows;
      if (request.method() === "HEAD") {
        await route.fulfill({ status: 200, headers: { "content-range": `0-0/${rows.length}` } });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rows),
      });
      return;
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

test.describe("Sensors truth closure", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `sensor truth proof runs once, under the ${MOCKED_PROJECT} project`,
    );
  });

  test("selects a persisted tent and renders the newest CSV evidence", async ({ page }) => {
    const now = Date.now();
    const oldest = new Date(now - 60 * 60_000).toISOString();
    const newestSoil = new Date(now - 5 * 60_000).toISOString();
    const newestAir = new Date(now - 60_000).toISOString();
    const otherTent = new Date(now - 60_000).toISOString();
    const rows = [
      sensorRow("a-old-temp", TENT_A_ID, oldest, "temperature_c", 20),
      sensorRow("a-old-rh", TENT_A_ID, oldest, "humidity_pct", 50),
      sensorRow("a-old-soil", TENT_A_ID, oldest, "soil_moisture_pct", 11),
      sensorRow("a-new-soil", TENT_A_ID, newestSoil, "soil_moisture_pct", 61),
      // The newest overall snapshot is intentionally sparse. Its compatibility
      // soil=0 must not erase the latest actual soil observation above.
      sensorRow("a-new-temp", TENT_A_ID, newestAir, "temperature_c", 25),
      sensorRow("a-new-rh", TENT_A_ID, newestAir, "humidity_pct", 60),
      sensorRow("b-soil", TENT_B_ID, otherTent, "soil_moisture_pct", 88),
    ];

    await seedFakeSession(page);
    await mockSignedInSupabase(page, {
      // Deliberately return B before A; the pure selector must remain stable.
      tents: [tent(TENT_B_ID, "Beta Real Tent"), tent(TENT_A_ID, "Alpha Real Tent")],
      // Deliberately return oldest-first; presenter selection must not trust position.
      sensorRows: rows,
    });

    await page.goto("/sensors");
    await acceptReconsentGateIfShown(page);

    await expect(page.getByRole("heading", { name: "Sensor Data" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Alpha Real Tent" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Beta Real Tent" })).toBeVisible();
    await expect(page.getByText("Soil moisture: 61% raw", { exact: true })).toBeVisible();
    await expect(page.getByText("Soil moisture: 11% raw", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Soil moisture: 88% raw", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("sensor-source-summary-count-csv")).toHaveText("3");
    await expect(page.getByTestId("sensor-source-summary-count-live")).toHaveText("0");
    await expect(page.getByTestId("sensor-source-summary-count-demo")).toHaveText("0");
    await expect(page.locator('[data-testid="grow-data-source-badge"][data-label="Live"]')).toHaveCount(
      0,
    );
  });

  test("empty authenticated reads show first-tent setup without a t1 sensor query", async ({
    page,
  }) => {
    const scopedReads: string[] = [];
    await seedFakeSession(page);
    await mockSignedInSupabase(page, {
      tents: [],
      sensorRows: [],
      onTentScopedSensorRead: (tentId) => scopedReads.push(tentId),
    });

    await page.goto("/sensors");
    await acceptReconsentGateIfShown(page);

    await expect(page.getByTestId("sensors-first-tent-setup")).toBeVisible();
    await expect(page.getByTestId("sensor-source-summary-empty")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Tent [A-D]$/ })).toHaveCount(0);
    expect(scopedReads).toEqual([]);
  });
});
