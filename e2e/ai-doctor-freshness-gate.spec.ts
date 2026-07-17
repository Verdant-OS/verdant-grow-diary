// Playwright boundary proof for the AI Doctor 48h snapshot-freshness gate
// on Plant Detail's "Ask Doctor" launch dialog.
//
// SAFETY:
// - All Supabase /auth/v1/** and /rest/v1/** traffic is intercepted via
//   page.route(). No real Supabase calls, no real accounts, no writes.
// - Uses a mocked signed-in user (fake token strings clearly labeled).
// - Plant "p1" is a NON-UUID id, so growRepo short-circuits to the bundled
//   mock plant (stage flower, photo present) with zero /rest/v1/plants
//   traffic; only diary_entries fixtures below drive the freshness gate.
//
// GATE SEMANTICS UNDER TEST (the load-bearing part):
// - FRESH  (snapshot <= 48h old + recent activity) → no stale explanation,
//   Continue is an enabled link.
// - STALE  (snapshot > 48h old but within the 7d window, activity present)
//   → readiness "partial": the stale explanation renders AND Continue
//   STAYS ENABLED. The 48h cutoff downgrades confidence; it does not by
//   itself block the flow.
// - BLOCKED (no activity, no snapshot) → readiness "insufficient": the
//   Continue link is replaced by a disabled button + blocked explanation.
//
// TIME CONTROL: repo convention — fixture timestamps are computed relative
// to Date.now() at test time with ≥30min margins on both sides of the 48h
// boundary, and boundary exactness is asserted through the dialog's
// data-cutoff-at / data-snapshot-at ISO attributes (locale-independent).
import { test, expect, type Page, type Route } from "@playwright/test";

const MOCKED_PROJECT = "chromium-mocked";

// Same fake-session recipe as e2e/agent-integrations-smoke.spec.ts: the
// app's hardened supabase client persists its session in sessionStorage
// under `sb-${projectRef}-auth-token`, stored as the raw session object.
const SB_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SB_SESSION_KEY = `sb-${SB_PROJECT_REF}-auth-token`;

const FAKE_USER = {
  id: "test-user-id",
  aud: "authenticated",
  email: "x@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};

// Bundled mock plant (non-UUID id → served without any plants stub).
const PLANT_ID = "p1";
const TENT_ID = "t1";
const PLANT_REVIEW_HREF = `/plants/${PLANT_ID}#plant-ai-doctor-review`;

const HOUR_MS = 3_600_000;
const FRESH_WINDOW_MS = 48 * HOUR_MS;

// Requests this presentation-only surface must never make.
const FORBIDDEN_REQUEST_RE = /(openai|anthropic|api\.groq|\/functions\/v1\/)/i;

async function seedFakeSession(page: Page) {
  await page.addInitScript(
    ({ key, user }) => {
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
      } catch {
        /* ignore */
      }
    },
    { key: SB_SESSION_KEY, user: FAKE_USER },
  );
}

async function mockSignedInSupabase(page: Page) {
  await page.route(/\/auth\/v1\//, async (route, req) => {
    const url = req.url();
    if (/\/user/i.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FAKE_USER),
      });
      return;
    }
    if (/\/token/i.test(url) && req.method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "FAKE-NOT-REAL",
          refresh_token: "FAKE-NOT-REAL",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: "test-user-id", aud: "authenticated", email: "x@example.invalid" },
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  // Catch-all FIRST; the diary_entries fixture route is registered after
  // it in each test (Playwright checks later-registered routes first).
  await page.route(/\/rest\/v1\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
}

interface DiaryFixtureRow {
  id: string;
  plant_id: string;
  tent_id: string;
  entry_at: string;
  note: string | null;
  photo_url: string | null;
  details: Record<string, unknown>;
}

/**
 * Two recent activity rows (watering + note, well inside the 7d window)
 * plus, optionally, one manual sensor snapshot row at the given age.
 * The snapshot row matches manualSnapshotDiaryAdapter's persisted shape
 * (details.manual_sensor_snapshot with source "manual" + real metrics).
 */
function buildDiaryFixture(nowMs: number, snapshotAgeMs: number | null): DiaryFixtureRow[] {
  const rows: DiaryFixtureRow[] = [
    {
      id: "e2e-freshness-watering",
      plant_id: PLANT_ID,
      tent_id: TENT_ID,
      entry_at: new Date(nowMs - 3 * HOUR_MS).toISOString(),
      note: "Watered 500ml",
      photo_url: null,
      details: { event_type: "watering" },
    },
    {
      id: "e2e-freshness-note",
      plant_id: PLANT_ID,
      tent_id: TENT_ID,
      entry_at: new Date(nowMs - 5 * HOUR_MS).toISOString(),
      note: "Canopy looks even",
      photo_url: null,
      details: { event_type: "note" },
    },
  ];
  if (snapshotAgeMs !== null) {
    rows.push({
      id: "e2e-freshness-snapshot",
      plant_id: PLANT_ID,
      tent_id: TENT_ID,
      entry_at: new Date(nowMs - snapshotAgeMs).toISOString(),
      note: null,
      photo_url: null,
      details: {
        manual_sensor_snapshot: {
          source: "manual",
          temp_f: 72.5,
          humidity_percent: 55,
        },
      },
    });
  }
  // diary_entries queries order entry_at desc; mirror that in the stub.
  return rows.sort((a, b) => (a.entry_at < b.entry_at ? 1 : -1));
}

async function stubDiaryEntries(page: Page, rows: DiaryFixtureRow[]) {
  await page.route(/\/rest\/v1\/diary_entries/, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(rows),
    }),
  );
}

function watchTraffic(page: Page) {
  const forbidden: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("request", (req) => {
    if (FORBIDDEN_REQUEST_RE.test(req.url())) {
      forbidden.push(`${req.method()} ${req.url()}`);
    }
  });
  return { forbidden, pageErrors };
}

// The signed-in agreement re-consent gate renders as a modal overlay for
// accounts with no recorded consent rows (our mocked user), swallowing all
// pointer events. Accept it before interacting (same helper as the Quick
// Log smoke; the acceptance write is swallowed by the /rest/v1/ catch-all).
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

async function openDoctorLaunchDialog(page: Page) {
  await page.goto(`/plants/${PLANT_ID}`);
  await acceptReconsentGateIfShown(page);
  const trigger = page.getByTestId("plant-detail-doctor-launch-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByTestId("plant-detail-doctor-launch-dialog")).toBeVisible();
}

test.describe("AI Doctor snapshot freshness gate (mocked, 48h boundary)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `freshness boundary proof runs once, under the ${MOCKED_PROJECT} project`,
    );
    await seedFakeSession(page);
    await mockSignedInSupabase(page);
  });

  test("FRESH: snapshot 47h30m old → no stale explanation, Continue enabled", async ({
    page,
  }) => {
    const traffic = watchTraffic(page);
    await stubDiaryEntries(
      page,
      buildDiaryFixture(Date.now(), FRESH_WINDOW_MS - 30 * 60_000),
    );
    await openDoctorLaunchDialog(page);

    await expect(
      page.getByTestId("plant-detail-doctor-launch-snapshot-stale-explanation"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("plant-detail-doctor-launch-continue-blocked"),
    ).toHaveCount(0);

    const cont = page.getByTestId("plant-detail-doctor-launch-continue");
    await expect(cont).toBeVisible();
    await expect(cont).toHaveAttribute("href", PLANT_REVIEW_HREF);
    await expect(
      page.getByTestId("plant-detail-doctor-launch-log-readiness-to-diary"),
    ).toHaveAttribute("data-snapshot-freshness", "fresh");

    expect(traffic.forbidden, "forbidden AI/function requests").toEqual([]);
    expect(traffic.pageErrors, "uncaught page errors").toEqual([]);
  });

  test("STALE: snapshot 48h30m old → stale explanation renders, Continue STAYS enabled", async ({
    page,
  }) => {
    const traffic = watchTraffic(page);
    const fixtureNowMs = Date.now();
    const snapshotIso = new Date(
      fixtureNowMs - (FRESH_WINDOW_MS + 30 * 60_000),
    ).toISOString();
    await stubDiaryEntries(
      page,
      buildDiaryFixture(fixtureNowMs, FRESH_WINDOW_MS + 30 * 60_000),
    );
    await openDoctorLaunchDialog(page);

    const staleBox = page.getByTestId(
      "plant-detail-doctor-launch-snapshot-stale-explanation",
    );
    await expect(staleBox).toBeVisible();
    await expect(staleBox).toHaveAttribute("role", "status");
    await expect(staleBox).toHaveAttribute("data-snapshot-at", snapshotIso);
    await expect(
      page.getByTestId("plant-detail-doctor-launch-snapshot-stale-sentence"),
    ).toContainText(/48h freshness cutoff/);

    // Boundary arithmetic, drift-proof: the cutoff the dialog computed is
    // (render-time now - 48h). It must sit AFTER the seeded snapshot (the
    // definition of stale) and within a few minutes of our fixture-time
    // cutoff (render happens seconds after fixture build).
    const cutoffAt = await staleBox.getAttribute("data-cutoff-at");
    expect(cutoffAt).not.toBeNull();
    const cutoffMs = Date.parse(cutoffAt as string);
    expect(Number.isFinite(cutoffMs)).toBe(true);
    expect(cutoffMs).toBeGreaterThan(Date.parse(snapshotIso));
    expect(Math.abs(cutoffMs - (fixtureNowMs - FRESH_WINDOW_MS))).toBeLessThan(5 * 60_000);

    // THE gate semantics: stale-but-recent snapshot + activity → partial →
    // Continue remains an enabled link; no blocked button, no blocked box.
    await expect(
      page.getByTestId("plant-detail-doctor-launch-continue-blocked"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("plant-detail-doctor-launch-blocked-explanation"),
    ).toHaveCount(0);
    const cont = page.getByTestId("plant-detail-doctor-launch-continue");
    await expect(cont).toBeVisible();
    await expect(cont).toHaveAttribute("href", PLANT_REVIEW_HREF);
    await expect(
      page.getByTestId("plant-detail-doctor-launch-log-readiness-to-diary"),
    ).toHaveAttribute("data-snapshot-freshness", "stale");

    expect(traffic.forbidden, "forbidden AI/function requests").toEqual([]);
    expect(traffic.pageErrors, "uncaught page errors").toEqual([]);
  });

  test("BLOCKED: no activity and no snapshot → disabled Continue + blocked explanation", async ({
    page,
  }) => {
    const traffic = watchTraffic(page);
    await stubDiaryEntries(page, []);
    await openDoctorLaunchDialog(page);

    await expect(page.getByTestId("plant-detail-doctor-launch-continue")).toHaveCount(0);
    const blocked = page.getByTestId("plant-detail-doctor-launch-continue-blocked");
    await expect(blocked).toBeVisible();
    await expect(blocked).toBeDisabled();
    await expect(blocked).toHaveAttribute("aria-disabled", "true");

    const explanation = page.getByTestId("plant-detail-doctor-launch-blocked-explanation");
    await expect(explanation).toBeVisible();
    await expect(explanation).toHaveAttribute("role", "status");
    const codes = await page
      .getByTestId("plant-detail-doctor-launch-blocked-list")
      .locator("li")
      .evaluateAll((lis) => lis.map((li) => li.getAttribute("data-blocking-code")));
    expect(codes).toEqual(["recent-timeline-activity", "recent-manual-sensor-snapshot"]);

    expect(traffic.forbidden, "forbidden AI/function requests").toEqual([]);
    expect(traffic.pageErrors, "uncaught page errors").toEqual([]);
  });
});
