// Browser regression proof for Issue #2203:
// Mobile (375px): Timeline, Plant and Dashboard pages overflow horizontally.
//
// SAFETY:
// - Uses a clearly fake session.
// - Intercepts every Supabase auth, REST, storage, and edge-function request.
// - Performs no real writes, AI calls, ingest, alerts, Action Queue changes,
//   or device control.
import { expect, test, type Page } from "@playwright/test";
import { CURRENT_AGREEMENT_LIST } from "../src/constants/agreements";

const CURRENT_AGREEMENT_ROWS = CURRENT_AGREEMENT_LIST.map((agreement) => ({
  agreement_type: agreement.type,
  version: agreement.version,
}));

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const MOCKED_PROJECT = "chromium-mocked";
const VIEWPORT_375 = { width: 375, height: 812 } as const;

const USER_ID = "11111111-1111-4111-8111-000000000001";
const GROW_ID = "11111111-1111-4111-8111-111111111111";
const GROW_ID_2 = "11111111-1111-4111-8111-111111111112";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const PLANT_ID = "33333333-3333-4333-8333-333333333333";

const FAKE_USER = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "mobile-overflow-2203@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  confirmed_at: "2026-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};

const NOW = "2026-10-16T12:00:00.000Z";
const YESTERDAY = "2026-10-15T12:00:00.000Z";

const GROWS = [
  {
    id: GROW_ID,
    user_id: USER_ID,
    name: "QA Pass 29 Grow",
    grow_type: "tent",
    stage: "flower",
    started_at: "2026-10-01T00:00:00.000Z",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    is_archived: false,
  },
  {
    id: GROW_ID_2,
    user_id: USER_ID,
    name: "Second Grow",
    grow_type: "tent",
    stage: "veg",
    started_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    is_archived: false,
  },
];

const TENT = {
  id: TENT_ID,
  user_id: USER_ID,
  grow_id: GROW_ID,
  name: "Main 4x4 Tent",
  brand: "AC Infinity",
  size: "4x4",
  stage: "flower",
  light_on: true,
  light_schedule: "12/12",
  light_wattage: 400,
  is_archived: false,
  created_at: "2026-10-01T00:00:00.000Z",
};

const PLANT = {
  id: PLANT_ID,
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  name: "Blue Dream #1",
  strain: "Blue Dream",
  stage: "flower",
  started_at: "2026-10-01T00:00:00.000Z",
  health: "healthy",
  plant_type: "photoperiod",
  photo_url: null,
  last_note: "Looking healthy",
  is_archived: false,
  medium: "coco",
  pot_size: "5 gal",
  created_at: "2026-10-01T00:00:00.000Z",
};

const SENSOR_EFFECTIVE_ROWS = [
  {
    id: "44444444-4444-4444-8444-444444444441",
    user_id: USER_ID,
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    metric: "temperature_c",
    value: 35.56,
    unit: "C",
    source: "manual",
    quality: "ok",
    correction_valid: true,
    device_id: null,
    raw_payload: null,
    ts: YESTERDAY,
    captured_at: YESTERDAY,
    created_at: YESTERDAY,
  },
  {
    id: "44444444-4444-4444-8444-444444444442",
    user_id: USER_ID,
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    metric: "humidity_pct",
    value: 60,
    unit: "%",
    source: "manual",
    quality: "ok",
    correction_valid: true,
    device_id: null,
    raw_payload: null,
    ts: YESTERDAY,
    captured_at: YESTERDAY,
    created_at: YESTERDAY,
  },
  {
    id: "44444444-4444-4444-8444-444444444443",
    user_id: USER_ID,
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    metric: "vpd_kpa",
    value: 4.5,
    unit: "kPa",
    source: "manual",
    quality: "ok",
    correction_valid: true,
    device_id: null,
    raw_payload: null,
    ts: YESTERDAY,
    captured_at: YESTERDAY,
    created_at: YESTERDAY,
  },
];

const DIARY_ENTRY = {
  id: "55555555-5555-4555-8555-555555555555",
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  plant_id: PLANT_ID,
  stage: "flower",
  entry_at: YESTERDAY,
  created_at: YESTERDAY,
  note: "Watered 500ml with pH 9.5 and EC 1.4",
  photo_url: "/placeholder.svg",
  details: {
    event_type: "watering",
    source: "manual",
    water_ml: 500,
    ph: 9.5,
    ec: 1.4,
    grow_event_id: "66666666-6666-4666-8666-666666666666",
    manual_sensor_snapshot: {
      source: "manual",
      ts: YESTERDAY,
      captured_at: YESTERDAY,
      temp_c: 35.56,
      rh_pct: 60,
      vpd_kpa: 4.5,
    },
  },
};

const GROW_EVENT = {
  id: "66666666-6666-4666-8666-666666666666",
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  plant_id: PLANT_ID,
  event_type: "watering",
  source: "manual",
  occurred_at: YESTERDAY,
  created_at: YESTERDAY,
  notes: "Watered 500ml",
  details: { water_ml: 500, ph: 9.5, ec: 1.4 },
};

const ALERT = {
  id: "77777777-7777-4777-8777-777777777777",
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  plant_id: PLANT_ID,
  severity: "warning",
  status: "open",
  title: "Temperature above stage range",
  reason: "Temperature 35.6°C is above the flower target range (20–26°C).",
  metric: "temp",
  source: "manual",
  created_at: NOW,
  first_seen_at: NOW,
  last_seen_at: NOW,
};

const ACTION = {
  id: "88888888-8888-4888-8888-888888888888",
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  plant_id: PLANT_ID,
  source: "alert",
  action_type: "environment_adjustment",
  suggested_change: "Check tent exhaust and canopy distance before adjusting airflow",
  reason: "Temperature above stage target range",
  risk_level: "medium",
  status: "pending_approval",
  created_at: NOW,
  updated_at: NOW,
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
    const url = new URL(request.url());
    const table = url.pathname.match(/\/rest\/v1\/([^/]+)/i)?.[1] ?? "";
    const accept = request.headers()["accept"] ?? "";
    const isSingle = accept.includes("application/vnd.pgrst.object+json");

    const rows =
      table === "user_agreement_acceptances"
        ? CURRENT_AGREEMENT_ROWS
        : table === "grows"
          ? GROWS
          : table === "tents"
            ? [TENT]
            : table === "plants"
              ? [PLANT]
              : table === "sensor_readings" || table === "sensor_readings_effective"
                ? SENSOR_EFFECTIVE_ROWS
                : table === "diary_entries"
                  ? [DIARY_ENTRY]
                  : table === "grow_events"
                    ? [GROW_EVENT]
                    : table === "alerts"
                      ? [ALERT]
                      : table === "action_queue"
                        ? [ACTION]
                        : [];

    if (request.method() === "HEAD") {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : "*/0",
        },
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : "*/0",
      },
      contentType: "application/json",
      body: JSON.stringify(isSingle ? (rows[0] ?? null) : rows),
    });
  });

  await page.route(/\/storage\/v1\//, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route(/\/functions\/v1\//, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  // Match analytics by hostname, not by a substring anywhere in the URL.
  await page.route(
    (url) => /(^|\.)(google-analytics\.com|googletagmanager\.com)$/.test(url.hostname),
    (route) => route.abort(),
  );
}

async function acceptReconsentGateIfShown(page: Page) {
  const gate = page.getByTestId("agreement-reconsent-gate");
  const shown = await gate
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;
  await gate.locator("#reconsent-accept").click();
  await gate.getByRole("button", { name: /accept and continue/i }).click();
  await gate.waitFor({ state: "hidden", timeout: 15_000 });
}

async function readPageOverflowMetrics(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector<HTMLElement>("main#main-content");
    if (!main) throw new Error("main#main-content missing");
    return {
      document: {
        clientWidth: doc.clientWidth,
        scrollWidth: doc.scrollWidth,
      },
      main: {
        clientWidth: main.clientWidth,
        scrollWidth: main.scrollWidth,
      },
    };
  });
}

function expectNoHorizontalOverflow(metrics: Awaited<ReturnType<typeof readPageOverflowMetrics>>) {
  expect(metrics.document.clientWidth).toBe(VIEWPORT_375.width);
  expect(metrics.document.scrollWidth).toBeLessThanOrEqual(metrics.document.clientWidth);
  expect(metrics.main.scrollWidth).toBeLessThanOrEqual(metrics.main.clientWidth);
}

test.describe("Issue #2203 — mobile (375px) horizontal overflow closure", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `mobile overflow proof runs once, under the ${MOCKED_PROJECT} project`,
    );
    await page.setViewportSize(VIEWPORT_375);
    await seedFakeSession(page);
    await mockSignedInSupabase(page);
  });

  test("Timeline at 375x812 has no horizontal overflow and keeps all 6 stage progression items inside the viewport", async ({
    page,
  }) => {
    await page.goto("/timeline");
    await acceptReconsentGateIfShown(page);

    const stageScroller = page.getByTestId("timeline-stage-progression-scroll");
    await expect(stageScroller).toBeVisible();
    await expect(page.getByTestId("cultivation-calendar-horizontal-scroll")).toBeVisible();
    await expect(page.getByTestId("watering-history-panel")).toBeVisible();
    await expect(page.getByTestId("timeline-entry-body").first()).toBeVisible();

    expectNoHorizontalOverflow(await readPageOverflowMetrics(page));

    const stageBounds = await stageScroller.evaluate((scroller) => {
      const items = Array.from(scroller.querySelectorAll("li"));
      return {
        scrollerClientWidth: scroller.clientWidth,
        scrollerScrollWidth: scroller.scrollWidth,
        items: items.map((li) => {
          const rect = li.getBoundingClientRect();
          return {
            text: (li.textContent ?? "").trim(),
            left: rect.left,
            right: rect.right,
          };
        }),
      };
    });

    expect(stageBounds.scrollerScrollWidth).toBeLessThanOrEqual(stageBounds.scrollerClientWidth);
    expect(stageBounds.items).toHaveLength(6);
    for (const label of [
      "Seedling",
      "Vegetative",
      "Flowering",
      "Flushing",
      "Harvest",
      "Drying / Curing",
    ]) {
      const match = stageBounds.items.find((item) => item.text.includes(label));
      expect(match, `stage item for ${label} must be rendered`).toBeDefined();
      expect(match!.left).toBeGreaterThanOrEqual(0);
      expect(match!.right).toBeLessThanOrEqual(VIEWPORT_375.width);
    }
  });

  test("Plant Detail at 375x812 has no horizontal overflow across Tent Alerts, Consistency, and expanded disclosures", async ({
    page,
  }) => {
    await page.goto(`/plants/${PLANT_ID}`);
    await acceptReconsentGateIfShown(page);

    const alertsPanel = page.getByTestId("plant-assigned-tent-alerts-panel");
    await expect(alertsPanel).toBeVisible();
    await expect(page.getByTestId("plant-assigned-tent-alert-view")).toBeVisible();

    expectNoHorizontalOverflow(await readPageOverflowMetrics(page));

    for (const group of ["history", "harvest", "ai"] as const) {
      await page.getByTestId(`plant-detail-disclosure-${group}-trigger`).click();
    }
    const nextInspection = page.getByTestId("plant-detail-harvest-watch-next-inspection-cta");
    await expect(nextInspection).toBeVisible();

    expectNoHorizontalOverflow(await readPageOverflowMetrics(page));

    const surfaceMetrics = await page.evaluate(() => {
      const alertPanel = document.querySelector<HTMLElement>(
        "[data-testid='plant-assigned-tent-alerts-panel']",
      );
      const alertView = document.querySelector<HTMLElement>(
        "[data-testid='plant-assigned-tent-alert-view']",
      );
      const harvestCta = document.querySelector<HTMLElement>(
        "[data-testid='plant-detail-harvest-watch-next-inspection-cta']",
      );
      if (!alertPanel || !alertView || !harvestCta) {
        throw new Error("Plant Detail overflow proof surfaces missing");
      }
      return {
        alertPanelOverflow: alertPanel.scrollWidth - alertPanel.clientWidth,
        alertViewRight: alertView.getBoundingClientRect().right,
        harvestCtaOverflow: harvestCta.scrollWidth - harvestCta.clientWidth,
        harvestCtaRight: harvestCta.getBoundingClientRect().right,
      };
    });

    expect(surfaceMetrics.alertPanelOverflow).toBeLessThanOrEqual(0);
    expect(surfaceMetrics.alertViewRight).toBeLessThanOrEqual(VIEWPORT_375.width);
    expect(surfaceMetrics.harvestCtaOverflow).toBeLessThanOrEqual(0);
    expect(surfaceMetrics.harvestCtaRight).toBeLessThanOrEqual(VIEWPORT_375.width);
  });

  test("Dashboard (unscoped and grow-scoped) at 375x812 has no horizontal overflow and does not clip the heading", async ({
    page,
  }) => {
    for (const path of ["/dashboard", `/dashboard?growId=${GROW_ID}`] as const) {
      await page.goto(path);
      await acceptReconsentGateIfShown(page);

      const root = page.getByTestId("dashboard-root");
      await expect(root).toBeVisible();
      await expect(page.getByTestId("dashboard-environment-snapshot")).toBeVisible();
      await expect(page.getByTestId("sensor-chart-range-selector")).toBeVisible();

      expectNoHorizontalOverflow(await readPageOverflowMetrics(page));

      const dashboardMetrics = await page.evaluate(() => {
        const rootEl = document.querySelector<HTMLElement>("[data-testid='dashboard-root']");
        const heading = document.querySelector<HTMLElement>("main#main-content h1");
        if (!rootEl || !heading) throw new Error("Dashboard overflow proof surfaces missing");
        const headingRect = heading.getBoundingClientRect();
        return {
          rootOverflow: rootEl.scrollWidth - rootEl.clientWidth,
          headingLeft: headingRect.left,
          headingRight: headingRect.right,
        };
      });

      expect(dashboardMetrics.rootOverflow).toBeLessThanOrEqual(0);
      expect(dashboardMetrics.headingLeft).toBeGreaterThanOrEqual(0);
      expect(dashboardMetrics.headingRight).toBeLessThanOrEqual(VIEWPORT_375.width);
    }
  });
});
