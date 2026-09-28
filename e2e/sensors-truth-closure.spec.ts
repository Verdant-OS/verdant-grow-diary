// Browser regression proof for authenticated Sensors truth handling.
//
// SAFETY:
// - Uses a clearly fake session and fabricated fixtures.
// - Intercepts every Supabase auth, REST, and edge-function request.
// - Performs no real writes, ingest, AI calls, alerts, Action Queue changes,
//   token minting, automation, or device control.
import { expect, test, type Page } from "@playwright/test";
import { CURRENT_AGREEMENT_LIST } from "../src/constants/agreements";

// AgreementReconsentGate renders inside the authenticated shell and queries
// user_agreement_acceptances on mount. Without this fixture the catch-all below
// answers `[]`, computeAgreementGaps reports both agreements missing, and the
// modal opens over the page, intercepting clicks depending on whether the query
// resolves before or after the interaction. Derived from the product registry
// so an agreement bump cannot silently reintroduce the flake.
const CURRENT_AGREEMENT_ROWS = CURRENT_AGREEMENT_LIST.map((agreement) => ({
  agreement_type: agreement.type,
  version: agreement.version,
}));

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const MOCKED_PROJECT = "chromium-mocked";
// UUIDs throughout: the Sensors loaders read the validated
// `sensor_readings_effective` view (#1546), and requireEffectiveSensorReadings
// rejects the whole batch when any row carries a non-UUID id, user_id or tent_id.
const FAKE_USER_ID = "44444444-4444-4444-8444-444444444444";
const FAKE_USER = {
  id: FAKE_USER_ID,
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

function readingId(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

// One shape serves both the raw table and the effective view. The view keeps
// every sensor_readings column and adds correction metadata; a row without
// `correction_valid: true` or an explicit `device_id` is rejected as unverifiable
// evidence, never shown as empty or zero (effectiveSensorReadingRules.ts).
function sensorRow(n: number, tentId: string, ts: string, metric: string, value: number) {
  return {
    id: readingId(n),
    user_id: FAKE_USER_ID,
    tent_id: tentId,
    device_id: null,
    metric,
    value,
    quality: "ok",
    source: "csv",
    ts,
    captured_at: ts,
    created_at: ts,
    raw_payload: null,
    correction_valid: true,
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
    if (pathname.endsWith("/rest/v1/user_agreement_acceptances")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(CURRENT_AGREEMENT_ROWS),
      });
      return;
    }

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

    // Readers moved to the validated view in #1546; the raw table is still read
    // elsewhere. Serve both, so a tent-scoped read of either kind is observed.
    if (
      pathname.endsWith("/rest/v1/sensor_readings") ||
      pathname.endsWith("/rest/v1/sensor_readings_effective")
    ) {
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
      sensorRow(1, TENT_A_ID, oldest, "temperature_c", 20),
      sensorRow(2, TENT_A_ID, oldest, "humidity_pct", 50),
      sensorRow(3, TENT_A_ID, oldest, "soil_moisture_pct", 11),
      sensorRow(4, TENT_A_ID, newestSoil, "soil_moisture_pct", 61),
      // The newest overall snapshot is intentionally sparse. Its compatibility
      // soil=0 must not erase the latest actual soil observation above.
      sensorRow(5, TENT_A_ID, newestAir, "temperature_c", 25),
      sensorRow(6, TENT_A_ID, newestAir, "humidity_pct", 60),
      sensorRow(7, TENT_B_ID, otherTent, "soil_moisture_pct", 88),
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
    const alphaTent = page.getByRole("button", { name: "Alpha Real Tent" });
    await expect(alphaTent).toBeVisible();
    await expect(page.getByRole("button", { name: "Beta Real Tent" })).toBeVisible();
    // Repository order is authoritative for the initial selection. Choose
    // Alpha explicitly before asserting its tent-scoped evidence.
    await alphaTent.click();
    await expect(page.getByText("Soil moisture: 61% raw", { exact: true })).toBeVisible();
    await expect(page.getByText("Soil moisture: 11% raw", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Soil moisture: 88% raw", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("sensor-source-summary-count-csv")).toHaveText("3");
    await expect(page.getByTestId("sensor-source-summary-count-live")).toHaveText("0");
    await expect(page.getByTestId("sensor-source-summary-count-demo")).toHaveText("0");
    await expect(
      page.locator('[data-testid="grow-data-source-badge"][data-label="Live"]'),
    ).toHaveCount(0);
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
