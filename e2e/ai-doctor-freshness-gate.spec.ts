// Playwright boundary proof for the AI Doctor 48h snapshot-freshness gate
// on Plant Detail's "Ask Doctor" launch dialog.
//
// SAFETY:
// - One route boundary intercepts every Supabase /auth/v1/** and /rest/v1/**
//   request. Non-local external traffic is blocked before it can leave the
//   browser, so there are no real Supabase calls, accounts, or writes.
// - Uses a mocked signed-in user (fake token strings clearly labeled).
// - The grow, tent, and plant are explicit UUID-backed REST fixtures. The
//   authenticated surface never relies on bundled mock/demo fallback data.
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
import { test, expect, type Page } from "@playwright/test";

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

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const PLANT_ID = "33333333-3333-4333-8333-333333333333";
const PLANT_REVIEW_HREF = `/plants/${PLANT_ID}#plant-ai-doctor-review`;

const GROW_ROW = {
  id: GROW_ID,
  name: "Freshness Proof Grow",
  stage: "flower",
  is_archived: false,
  created_at: "2026-07-01T00:00:00.000Z",
};

const TENT_ROW = {
  id: TENT_ID,
  grow_id: GROW_ID,
  name: "Freshness Proof Tent",
  brand: "",
  size: "2x2",
  stage: "flower",
  light_on: true,
  light_schedule: "12/12",
  light_wattage: 150,
  is_archived: false,
  created_at: "2026-07-01T00:00:00.000Z",
};

const PLANT_ROW = {
  id: PLANT_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  name: "Freshness Proof Plant",
  strain: "Browser fixture",
  stage: "flower",
  started_at: "2026-07-01T00:00:00.000Z",
  health: "healthy",
  photo_url: "/placeholder.svg",
  last_note: null,
  is_archived: false,
  medium: "soil",
  pot_size: "3 gal",
  created_at: "2026-07-01T00:00:00.000Z",
};

// Mirrors src/constants/agreements.ts so the fixture represents a grower who
// already completed signup consent. This removes the only write the old
// browser harness performed (accepting the re-consent modal).
const CURRENT_AGREEMENT_ROWS = [
  { agreement_type: "terms", version: "2026-07-13" },
  { agreement_type: "privacy", version: "2026-07-13" },
];

const HOUR_MS = 3_600_000;
const FRESH_WINDOW_MS = 48 * HOUR_MS;

// Requests this presentation-only surface must never make.
const FORBIDDEN_REQUEST_RE = /(openai|anthropic|api\.groq|\/functions\/v1\/)/i;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const READ_ONLY_RPC_PATHS = new Set([
  "/rest/v1/rpc/has_role",
  "/rest/v1/rpc/get_latest_tent_sensor_snapshot",
]);

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

interface TrafficAudit {
  forbidden: string[];
  pageErrors: string[];
  restReads: string[];
  restMutations: string[];
  readOnlyRpcCalls: string[];
  functionRequests: string[];
  blockedExternal: string[];
  realExternalResponses: string[];
  interceptedRemote: Set<string>;
}

function isLocalUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function watchTraffic(page: Page): TrafficAudit {
  const traffic: TrafficAudit = {
    forbidden: [],
    pageErrors: [],
    restReads: [],
    restMutations: [],
    readOnlyRpcCalls: [],
    functionRequests: [],
    blockedExternal: [],
    realExternalResponses: [],
    interceptedRemote: new Set<string>(),
  };
  page.on("pageerror", (error) => traffic.pageErrors.push(String(error)));
  page.on("request", (request) => {
    if (FORBIDDEN_REQUEST_RE.test(request.url())) {
      traffic.forbidden.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (!isLocalUrl(url) && !traffic.interceptedRemote.has(url)) {
      traffic.realExternalResponses.push(`${response.status()} ${url}`);
    }
  });
  return traffic;
}

async function mockSignedInSupabase(
  page: Page,
  diaryRows: readonly DiaryFixtureRow[],
  traffic: TrafficAudit,
) {
  // Register the external fence first. The specific mocked Supabase routes
  // below are registered later and therefore win Playwright's LIFO match.
  // Everything else non-local is aborted, never continued to the network.
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (isLocalUrl(request.url())) {
      await route.continue();
      return;
    }
    traffic.blockedExternal.push(`${request.method()} ${request.url()}`);
    await route.abort("blockedbyclient");
  });

  await page.route(/\/auth\/v1\//, async (route, req) => {
    const url = req.url();
    traffic.interceptedRemote.add(url);
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

  // This catch-all owns the entire Supabase REST boundary. Every permitted
  // read receives a deterministic fixture; any write is aborted and fails the
  // scenario assertion below. No REST request is ever continued.
  await page.route(/\/rest\/v1\//, async (route) => {
    const request = route.request();
    const url = request.url();
    const pathname = new URL(url).pathname;
    const label = `${request.method()} ${url}`;
    traffic.interceptedRemote.add(url);

    if (READ_ONLY_RPC_PATHS.has(pathname)) {
      traffic.readOnlyRpcCalls.push(label);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: pathname.endsWith("/has_role") ? "false" : "null",
      });
      return;
    }

    if (WRITE_METHODS.has(request.method())) {
      traffic.restMutations.push(label);
      await route.abort("blockedbyclient");
      return;
    }

    traffic.restReads.push(label);
    const table = pathname.match(/\/rest\/v1\/([^/]+)/)?.[1] ?? "";
    const rows =
      table === "grows"
        ? [GROW_ROW]
        : table === "tents"
          ? [TENT_ROW]
          : table === "plants"
            ? [PLANT_ROW]
            : table === "diary_entries"
              ? diaryRows
              : table === "user_agreement_acceptances"
                ? CURRENT_AGREEMENT_ROWS
                : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
      body: JSON.stringify(rows),
    });
  });

  await page.route(/\/functions\/v1\//, async (route) => {
    const request = route.request();
    traffic.interceptedRemote.add(request.url());
    traffic.functionRequests.push(`${request.method()} ${request.url()}`);
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
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

function expectIsolatedReadOnlyTraffic(traffic: TrafficAudit) {
  expect(traffic.restReads).toEqual(
    expect.arrayContaining([
      expect.stringContaining("/rest/v1/plants"),
      expect.stringContaining("/rest/v1/tents"),
      expect.stringContaining("/rest/v1/diary_entries"),
    ]),
  );
  expect(traffic.restMutations, "intercepted REST mutations").toEqual([]);
  expect(traffic.functionRequests, "AI/edge-function requests").toEqual([]);
  expect(traffic.forbidden, "forbidden AI/function requests").toEqual([]);
  expect(traffic.realExternalResponses, "real external network responses").toEqual([]);
  expect(traffic.pageErrors, "uncaught page errors").toEqual([]);
}

async function openDoctorLaunchDialog(page: Page) {
  await page.goto(`/plants/${PLANT_ID}`, { waitUntil: "domcontentloaded" });
  const trigger = page.getByTestId("plant-detail-doctor-launch-trigger");
  await expect(trigger).toBeVisible();
  await expect(page.getByText("No real plants yet")).toHaveCount(0);
  await expect(page.getByTestId("agreement-reconsent-gate")).toHaveCount(0);
  await trigger.click();
  await expect(page.getByTestId("plant-detail-doctor-launch-dialog")).toBeVisible();
}

async function installFreshnessHarness(page: Page, diaryRows: readonly DiaryFixtureRow[]) {
  const traffic = watchTraffic(page);
  await seedFakeSession(page);
  await mockSignedInSupabase(page, diaryRows, traffic);
  return traffic;
}

test.describe("AI Doctor snapshot freshness gate (mocked, 48h boundary)", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `freshness boundary proof runs once, under the ${MOCKED_PROJECT} project`,
    );
  });

  test("FRESH: snapshot 47h30m old → no stale explanation, Continue enabled", async ({ page }) => {
    const traffic = await installFreshnessHarness(
      page,
      buildDiaryFixture(Date.now(), FRESH_WINDOW_MS - 30 * 60_000),
    );
    await openDoctorLaunchDialog(page);

    await expect(
      page.getByTestId("plant-detail-doctor-launch-snapshot-stale-explanation"),
    ).toHaveCount(0);
    await expect(page.getByTestId("plant-detail-doctor-launch-continue-blocked")).toHaveCount(0);

    const cont = page.getByTestId("plant-detail-doctor-launch-continue");
    await expect(cont).toBeVisible();
    await expect(cont).toHaveAttribute("href", PLANT_REVIEW_HREF);
    await expect(
      page.getByTestId("plant-detail-doctor-launch-log-readiness-to-diary"),
    ).toHaveAttribute("data-snapshot-freshness", "fresh");

    expectIsolatedReadOnlyTraffic(traffic);
  });

  test("STALE: snapshot 48h30m old → stale explanation renders, Continue STAYS enabled", async ({
    page,
  }) => {
    const fixtureNowMs = Date.now();
    const snapshotIso = new Date(fixtureNowMs - (FRESH_WINDOW_MS + 30 * 60_000)).toISOString();
    const traffic = await installFreshnessHarness(
      page,
      buildDiaryFixture(fixtureNowMs, FRESH_WINDOW_MS + 30 * 60_000),
    );
    await openDoctorLaunchDialog(page);

    const staleBox = page.getByTestId("plant-detail-doctor-launch-snapshot-stale-explanation");
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
    await expect(page.getByTestId("plant-detail-doctor-launch-continue-blocked")).toHaveCount(0);
    await expect(page.getByTestId("plant-detail-doctor-launch-blocked-explanation")).toHaveCount(0);
    const cont = page.getByTestId("plant-detail-doctor-launch-continue");
    await expect(cont).toBeVisible();
    await expect(cont).toHaveAttribute("href", PLANT_REVIEW_HREF);
    await expect(
      page.getByTestId("plant-detail-doctor-launch-log-readiness-to-diary"),
    ).toHaveAttribute("data-snapshot-freshness", "stale");

    expectIsolatedReadOnlyTraffic(traffic);
  });

  test("BLOCKED: no activity and no snapshot → disabled Continue + blocked explanation", async ({
    page,
  }) => {
    const traffic = await installFreshnessHarness(page, []);
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

    expectIsolatedReadOnlyTraffic(traffic);
  });
});
