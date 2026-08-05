// Playwright boundary proof for the AI Doctor 48h snapshot-freshness gate
// on Plant Detail's "AI Doctor Context" panel.
//
// SURFACE HISTORY (why this spec moved):
// This proof originally drove PlantDetailDoctorLaunchDialog's "Ask Doctor"
// dialog. Commit a6972773d ("retire dead-end tasks and doctor placeholders")
// unmounted PlantDetailDoctorContextPreview — the dialog's only mount path —
// from Plant Detail, and src/test/plant-detail-information-architecture.test.ts
// now asserts that retirement is permanent. The launcher is gone; the 48h rule
// is NOT. It still lives in aiDoctorContextRules (snapshotFreshMs, sourced from
// AI_DOCTOR_SNAPSHOT_FRESH_HOURS = 48) and still ships on
// PlantDetailAiDoctorContextPanel, which is mounted inside Plant Detail's "AI
// review & context" disclosure. This spec therefore proves the same boundary on
// the surface that actually reaches growers.
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
// - FRESH  (snapshot <= 48h old + recent activity) → the panel credits BOTH
//   `recent-manual-sensor-snapshot` AND `fresh-manual-sensor-snapshot`.
// - STALE  (snapshot > 48h old but within the 7d window, activity present)
//   → `recent-manual-sensor-snapshot` is still credited but
//   `fresh-manual-sensor-snapshot` is WITHDRAWN, and readiness STAYS
//   "partial" — never "insufficient". The 48h cutoff downgrades confidence;
//   it does not by itself block the flow.
// - BLOCKED (no activity, no snapshot) → readiness "insufficient" and both
//   snapshot codes move to the Missing column.
//
// Readiness is "partial" rather than "strong" in the fresh case by fixture
// design, not by accident: aiDoctorContextRules only awards "strong" when
// plant type is known AND root-zone history exists, and PLANT_ROW is
// deliberately `plant_type: "unknown"` with no root-zone rows. Holding
// readiness constant across FRESH/STALE is what makes the evidence-code
// flip the sole, unambiguous signal of the 48h boundary.
//
// TIME CONTROL: repo convention — fixture timestamps are computed relative
// to Date.now() at test time with ≥30min margins on both sides of the 48h
// boundary. The retired dialog also exposed data-cutoff-at / data-snapshot-at
// ISO attributes for exact-instant assertions; the shipping panel does not
// render a cutoff instant, so exactness at the boundary is covered by
// src/test/ai-doctor-snapshot-freshness-boundary.test.ts at the unit level
// and this lane proves the rendered consequence.
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
  plant_type: "unknown",
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

async function openAiDoctorContextPanel(page: Page) {
  await page.goto(`/plants/${PLANT_ID}`, { waitUntil: "domcontentloaded" });
  const aiDisclosureTrigger = page.getByTestId("plant-detail-disclosure-ai-trigger");
  await expect(aiDisclosureTrigger).toBeVisible();
  if ((await aiDisclosureTrigger.getAttribute("aria-expanded")) !== "true") {
    await aiDisclosureTrigger.click();
  }
  await expect(page.getByTestId("plant-detail-disclosure-ai-content")).toBeVisible();

  const panel = page.getByTestId("plant-ai-doctor-context-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByText("No real plants yet")).toHaveCount(0);
  await expect(page.getByTestId("agreement-reconsent-gate")).toHaveCount(0);
  // Both columns must have rendered before codes are read, otherwise an
  // empty list would read as "code absent" and pass a stale-gate assertion.
  await expect(page.getByTestId("plant-ai-doctor-context-evidence")).toBeVisible();
  await expect(page.getByTestId("plant-ai-doctor-context-missing")).toBeVisible();
  return panel;
}

/** Codes the panel currently credits as available evidence. */
function evidenceCodes(page: Page): Promise<(string | null)[]> {
  return page
    .getByTestId("plant-ai-doctor-context-evidence")
    .locator("li[data-code]")
    .evaluateAll((lis) => lis.map((li) => li.getAttribute("data-code")));
}

/** Codes the panel currently reports as missing. */
function missingCodes(page: Page): Promise<(string | null)[]> {
  return page
    .getByTestId("plant-ai-doctor-context-missing")
    .locator("li[data-code]")
    .evaluateAll((lis) => lis.map((li) => li.getAttribute("data-code")));
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

  test("FRESH: snapshot 47h30m old → snapshot credited as fresh evidence", async ({ page }) => {
    const traffic = await installFreshnessHarness(
      page,
      buildDiaryFixture(Date.now(), FRESH_WINDOW_MS - 30 * 60_000),
    );
    const panel = await openAiDoctorContextPanel(page);

    // Inside the 48h window the rules award the freshness credit on top of
    // the plain "a snapshot exists" credit.
    const evidence = await evidenceCodes(page);
    expect(evidence).toContain("recent-manual-sensor-snapshot");
    expect(evidence).toContain("fresh-manual-sensor-snapshot");
    expect(await missingCodes(page)).not.toContain("recent-manual-sensor-snapshot");

    await expect(panel).toHaveAttribute("data-readiness", "partial");
    await expect(page.getByTestId("plant-ai-doctor-context-latest-snapshot")).toBeVisible();

    expectIsolatedReadOnlyTraffic(traffic);
  });

  test("STALE: snapshot 48h30m old → freshness credit withdrawn, flow STAYS unblocked", async ({
    page,
  }) => {
    const traffic = await installFreshnessHarness(
      page,
      buildDiaryFixture(Date.now(), FRESH_WINDOW_MS + 30 * 60_000),
    );
    const panel = await openAiDoctorContextPanel(page);

    // 30 minutes past the cutoff is enough to withdraw the freshness credit,
    // and ONLY the freshness credit — the snapshot itself still counts.
    const evidence = await evidenceCodes(page);
    expect(evidence).toContain("recent-manual-sensor-snapshot");
    expect(evidence).not.toContain("fresh-manual-sensor-snapshot");
    expect(await missingCodes(page)).not.toContain("recent-manual-sensor-snapshot");

    // THE gate semantics: a stale-but-recent snapshot with activity present
    // downgrades confidence and nothing more. Readiness must be identical to
    // the FRESH case — crossing 48h must never escalate to "insufficient".
    await expect(panel).toHaveAttribute("data-readiness", "partial");
    await expect(page.getByTestId("plant-ai-doctor-context-latest-snapshot")).toBeVisible();

    expectIsolatedReadOnlyTraffic(traffic);
  });

  test("BLOCKED: no activity and no snapshot → readiness insufficient", async ({ page }) => {
    const traffic = await installFreshnessHarness(page, []);
    const panel = await openAiDoctorContextPanel(page);

    await expect(panel).toHaveAttribute("data-readiness", "insufficient");
    await expect(page.getByTestId("plant-ai-doctor-context-notice")).toBeVisible();

    const missing = await missingCodes(page);
    expect(missing).toContain("recent-timeline-activity");
    expect(missing).toContain("recent-manual-sensor-snapshot");

    // With no snapshot at all, neither snapshot credit may be awarded —
    // freshness is not something an absent snapshot can earn by default.
    const evidence = await evidenceCodes(page);
    expect(evidence).not.toContain("recent-manual-sensor-snapshot");
    expect(evidence).not.toContain("fresh-manual-sensor-snapshot");

    // No snapshot means no "latest snapshot" line to render.
    await expect(page.getByTestId("plant-ai-doctor-context-latest-snapshot")).toHaveCount(0);

    expectIsolatedReadOnlyTraffic(traffic);
  });
});
