// Playwright proof (issue #587) that Timeline's date-range filter queries the
// grower's LOCAL day, not a UTC day, end-to-end in a real browser:
//
//   browser timezone (America/Chicago, emulated) -> Timeline.tsx computes
//   local-day bounds -> real Supabase-js REST request carries those bounds as
//   the `entry_at` / `occurred_at` gte/lte filters -> the mocked REST layer
//   applies them the way PostgREST would -> the rendered timeline reflects
//   exactly the rows inside the grower's local day.
//
// This is the credential-free mocked-browser verification called for by
// issue #587: it captures the actual wire-level REST query string (not a
// mocked query-builder), so it also proves diary_entries and grow_events
// receive IDENTICAL bounds, that the URL keeps plain YYYY-MM-DD dates, and
// that reading never triggers a write.
//
// SAFETY:
// - All /auth/v1/** and /rest/v1/** traffic is intercepted via page.route().
//   Any unmatched external request is aborted; only the loopback app can load.
//   No real Supabase calls, no real accounts, no real rows.
// - This spec only reads. Only the exact read-only has_role fixture may POST;
//   all other non-GET REST requests are recorded and rejected before any mock
//   table handler can quietly accept them.
import { test, expect, type Page, type Route, type Request } from "@playwright/test";

const MOCKED_PROJECT = "chromium-mocked";

const SB_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SB_SESSION_KEY = `sb-${SB_PROJECT_REF}-auth-token`;
const FIXTURE_ORIGIN = "https://timeline-fixture.invalid";

const FAKE_USER = {
  id: "test-user-id",
  aud: "authenticated",
  email: "x@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};

const GROW_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

// America/Chicago is CDT (UTC-5) on 2026-07-15 (well outside any DST
// transition), so the grower's local day 2026-07-15 spans exactly these UTC
// instants — the same bounds asserted in src/test/timeline-date-range-rules.test.ts.
const LOCAL_DAY_START_ISO = "2026-07-15T05:00:00.000Z";
const LOCAL_DAY_END_ISO = "2026-07-16T04:59:59.999Z";

interface DiaryFixtureRow {
  id: string;
  note: string;
  entry_at: string;
}

// Straddles both midnight boundaries of the America/Chicago local day so a
// UTC-day query and a local-day query disagree on at least 4 of these 5 rows.
const DIARY_FIXTURE_ROWS: DiaryFixtureRow[] = [
  { id: "row-before", note: "row before local midnight", entry_at: "2026-07-15T04:59:59.999Z" },
  { id: "row-start", note: "row at local day start", entry_at: LOCAL_DAY_START_ISO },
  { id: "row-inside", note: "row inside local day", entry_at: "2026-07-15T17:00:00.000Z" },
  { id: "row-end", note: "row at local day end", entry_at: LOCAL_DAY_END_ISO },
  { id: "row-after", note: "row after local day end", entry_at: "2026-07-16T05:00:00.000Z" },
];

function diaryRow(id: string, note: string, entryAt: string) {
  return {
    id,
    note,
    photo_url: null,
    stage: "veg",
    details: {},
    entry_at: entryAt,
    plant_id: null,
    tent_id: null,
  };
}

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

/** Extracts the `gte`/`lte` values PostgREST-style repeated filters carry for one column. */
function extractBounds(url: string, column: string): { gte: string | null; lte: string | null } {
  const parsed = new URL(url);
  const values = parsed.searchParams.getAll(column);
  const gte = values.find((v) => v.startsWith("gte."))?.slice("gte.".length) ?? null;
  const lte = values.find((v) => v.startsWith("lte."))?.slice("lte.".length) ?? null;
  return { gte, lte };
}

interface Captured {
  diaryUrls: string[];
  growEventUrls: string[];
  nonGetRestCalls: string[];
  blockedExternalRequests: string[];
}

/** Identify the core Timeline reads independently of the date bounds under test. */
function isCoreTimelineRead(url: string, table: "diary_entries" | "grow_events"): boolean {
  const query = new URL(url).searchParams;
  if (query.get("grow_id") !== `eq.${GROW_ID}` || query.get("limit") !== "100") return false;
  if (table === "diary_entries") {
    return (
      query.get("select") === "id,note,photo_url,stage,details,entry_at,plant_id,tent_id" &&
      query.get("order") === "entry_at.desc"
    );
  }
  return query.get("order") === "occurred_at.desc";
}

function isReadOnlyRoleFixture(req: Request): boolean {
  if (req.method() !== "POST" || new URL(req.url()).pathname !== "/rest/v1/rpc/has_role") {
    return false;
  }
  try {
    const args = req.postDataJSON();
    return (
      args !== null &&
      typeof args === "object" &&
      Object.keys(args).sort().join(",") === "_role,_user_id" &&
      args._role === "operator" &&
      args._user_id === FAKE_USER.id
    );
  } catch {
    return false;
  }
}

async function mockSignedInSupabase(page: Page, captured: Captured) {
  // Registered first so specific fixtures below run before this egress fence.
  // A new backend surface must receive an explicit mock rather than reach a host.
  await page.route("**/*", async (route, req) => {
    const url = new URL(req.url());
    if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      return route.continue();
    }
    captured.blockedExternalRequests.push(req.url());
    await route.abort("blockedbyclient");
  });

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
          user: FAKE_USER,
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route(/\/rest\/v1\//, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route(/\/rest\/v1\/user_agreement_acceptances/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { agreement_type: "terms", version: "2026-07-13" },
        { agreement_type: "privacy", version: "2026-07-13" },
      ]),
    }),
  );

  await page.route(/\/rest\/v1\/grows(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: GROW_ID,
          name: "Test Grow",
          stage: "veg",
          is_archived: false,
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ]),
    }),
  );

  await page.route(/\/rest\/v1\/(tents|plants)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  // The core query under test: diary_entries. Mimics PostgREST's own
  // gte/lte filtering over the fixture set so the rendered UI genuinely
  // reflects whatever bounds Timeline.tsx sent over the wire.
  await page.route(/\/rest\/v1\/diary_entries/, async (route, req) => {
    if (isCoreTimelineRead(req.url(), "diary_entries")) captured.diaryUrls.push(req.url());
    const { gte, lte } = extractBounds(req.url(), "entry_at");
    const kept = DIARY_FIXTURE_ROWS.filter((row) => {
      if (gte && row.entry_at < gte) return false;
      if (lte && row.entry_at > lte) return false;
      return true;
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": `0-${kept.length}/${kept.length}` },
      body: JSON.stringify(kept.map((r) => diaryRow(r.id, r.note, r.entry_at))),
    });
  });

  // grow_events: same bounds object, different column — captured to prove
  // cross-table agreement. No rows needed for this proof.
  await page.route(/\/rest\/v1\/grow_events/, async (route, req) => {
    if (isCoreTimelineRead(req.url(), "grow_events")) captured.growEventUrls.push(req.url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/0" },
      body: "[]",
    });
  });

  // Playwright tries routes in reverse registration order. This guard must
  // run before every table-specific handler, including grows/tents/plants.
  await page.route(/\/rest\/v1\//, async (route, req) => {
    if (req.method() === "GET") return route.fallback();
    // useHasRole asks the existing STABLE SELECT-only has_role RPC via POST.
    // Answer only this exact fixture and never grant an operator role.
    if (isReadOnlyRoleFixture(req)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "false" });
      return;
    }
    captured.nonGetRestCalls.push(`${req.method()} ${req.url()}`);
    await route.fulfill({
      status: 405,
      contentType: "application/json",
      body: JSON.stringify({ message: "Fixture blocked a write" }),
    });
  });
}

test.describe("Timeline local-day date-range filter (issue #587, America/Chicago)", () => {
  test.use({ timezoneId: "America/Chicago" });

  test.beforeAll(async ({ browser, baseURL }, testInfo) => {
    // Keep cold Vite compilation outside the boundary assertions. The first
    // Timeline visit in a run pays the dev server's on-demand compile, which
    // can outlast the default 10 s expect budget, so startup time would read
    // as a missing local-day row. Warm the same route once, fully mocked.
    if (testInfo.project.name !== MOCKED_PROJECT) return;
    testInfo.setTimeout(120_000);
    // One 110 s budget for the whole warm-up, inside the hook's 120 s: the render
    // wait gets only what the navigation left, so a timeout names the step that
    // ran out rather than the hook (Copilot review on #1715).
    const deadline = Date.now() + 110_000;
    const remaining = () => Math.max(1_000, deadline - Date.now());
    const page = await browser.newPage({ baseURL, timezoneId: "America/Chicago" });
    try {
      await mockSignedInSupabase(page, {
        diaryUrls: [],
        growEventUrls: [],
        nonGetRestCalls: [],
        blockedExternalRequests: [],
      });
      await seedFakeSession(page);
      await page.goto(`/timeline?growId=${GROW_ID}&start=2026-07-20&end=2026-07-10`, {
        waitUntil: "domcontentloaded",
        timeout: remaining(),
      });
      await expect(page.getByTestId("timeline-date-range-error")).toBeVisible({
        timeout: remaining(),
      });
    } finally {
      await page.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `local-day date-filter proof runs once, under the ${MOCKED_PROJECT} project`,
    );
  });

  test("selecting 2026-07-15 applies identical America/Chicago local-day bounds to diary_entries and grow_events, keeps the URL plain, and writes nothing", async ({
    page,
  }) => {
    const captured: Captured = {
      diaryUrls: [],
      growEventUrls: [],
      nonGetRestCalls: [],
      blockedExternalRequests: [],
    };
    await mockSignedInSupabase(page, captured);
    await seedFakeSession(page);

    await page.goto(`/timeline?growId=${GROW_ID}&start=2026-07-15&end=2026-07-15`);

    // Boundary-correct inclusion: only the local-day rows render.
    await expect(
      page.getByTestId("timeline-entry").filter({ hasText: "row at local day start" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("timeline-entry").filter({ hasText: "row inside local day" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("timeline-entry").filter({ hasText: "row at local day end" }),
    ).toBeVisible();
    // Boundary-correct exclusion: the adjacent-day rows never appear, proving
    // this isn't a UTC-day query (which would keep "row before" and "row inside"
    // but wrongly include the pre-2026-07-15 UTC morning and exclude the CDT evening).
    await expect(
      page.getByTestId("timeline-entry").filter({ hasText: "row before local midnight" }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("timeline-entry").filter({ hasText: "row after local day end" }),
    ).toHaveCount(0);

    expect(captured.diaryUrls.length, "diary_entries must have been queried").toBeGreaterThan(0);
    expect(captured.growEventUrls.length, "grow_events must have been queried").toBeGreaterThan(0);

    await test.info().attach("timeline-core-read-queries", {
      body: JSON.stringify(captured, null, 2),
      contentType: "application/json",
    });
    // Supplemental context reads can finish last; inspect every core request
    // instead of allowing whichever diary query completed last to decide.
    for (const url of captured.diaryUrls) {
      expect(extractBounds(url, "entry_at")).toEqual({
        gte: LOCAL_DAY_START_ISO,
        lte: LOCAL_DAY_END_ISO,
      });
    }
    for (const url of captured.growEventUrls) {
      expect(extractBounds(url, "occurred_at")).toEqual({
        gte: LOCAL_DAY_START_ISO,
        lte: LOCAL_DAY_END_ISO,
      });
    }
    const diaryBounds = extractBounds(captured.diaryUrls.at(-1)!, "entry_at");
    const growEventBounds = extractBounds(captured.growEventUrls.at(-1)!, "occurred_at");

    expect(diaryBounds.gte, "diary_entries lower bound").toBe(LOCAL_DAY_START_ISO);
    expect(diaryBounds.lte, "diary_entries upper bound").toBe(LOCAL_DAY_END_ISO);
    // Identical bounds contract (issue #587 requirement #4): grow_events must
    // agree with diary_entries exactly, not merely "also be timezone-aware".
    expect(growEventBounds.gte, "grow_events lower bound must match diary_entries").toBe(
      diaryBounds.gte,
    );
    expect(growEventBounds.lte, "grow_events upper bound must match diary_entries").toBe(
      diaryBounds.lte,
    );

    // URL stays plain YYYY-MM-DD — the ISO instants are a query-boundary
    // implementation detail, never surfaced to the address bar.
    await expect(page).toHaveURL(/[?&]start=2026-07-15(&|$)/);
    await expect(page).toHaveURL(/[?&]end=2026-07-15(&|$)/);
    expect(page.url()).not.toContain("T05%3A00");
    expect(page.url()).not.toContain(":00:00");

    expect(captured.nonGetRestCalls, "read-only load must never write").toEqual([]);
  });

  test("an inverted range (start after end) sends no date bound at all, matching the existing no-op contract", async ({
    page,
  }) => {
    const captured: Captured = {
      diaryUrls: [],
      growEventUrls: [],
      nonGetRestCalls: [],
      blockedExternalRequests: [],
    };
    await mockSignedInSupabase(page, captured);
    await seedFakeSession(page);

    await page.goto(`/timeline?growId=${GROW_ID}&start=2026-07-20&end=2026-07-10`);

    await expect(page.getByTestId("timeline-date-range-error")).toBeVisible();
    await expect
      .poll(() => captured.diaryUrls.length, { message: "diary_entries must have been queried" })
      .toBeGreaterThan(0);
    await expect
      .poll(() => captured.growEventUrls.length, { message: "grow_events must have been queried" })
      .toBeGreaterThan(0);

    await test.info().attach("timeline-core-read-queries", {
      body: JSON.stringify(captured, null, 2),
      contentType: "application/json",
    });
    for (const url of captured.diaryUrls) {
      const diaryBounds = extractBounds(url, "entry_at");
      expect(diaryBounds.gte, "an invalid range must not guess a lower bound").toBeNull();
      expect(diaryBounds.lte, "an invalid range must not guess an upper bound").toBeNull();
    }
    for (const url of captured.growEventUrls) {
      const eventBounds = extractBounds(url, "occurred_at");
      expect(eventBounds.gte, "an invalid range must not guess an event lower bound").toBeNull();
      expect(eventBounds.lte, "an invalid range must not guess an event upper bound").toBeNull();
    }

    expect(captured.nonGetRestCalls, "read-only load must never write").toEqual([]);
  });

  test("the fixture rejects table writes, mutating RPCs and altered role probes", async ({
    page,
  }) => {
    const captured: Captured = {
      diaryUrls: [],
      growEventUrls: [],
      nonGetRestCalls: [],
      blockedExternalRequests: [],
    };
    await mockSignedInSupabase(page, captured);
    await seedFakeSession(page);
    await page.goto(`/timeline?growId=${GROW_ID}&start=2026-07-20&end=2026-07-10`);
    await expect(page.getByTestId("timeline-date-range-error")).toBeVisible();
    expect(captured.nonGetRestCalls).toEqual([]);

    const roleResult = await page.evaluate(
      async ({ origin, userId }) => {
        const response = await fetch(`${origin}/rest/v1/rpc/has_role`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ _user_id: userId, _role: "operator" }),
        });
        return { status: response.status, body: await response.json() };
      },
      { origin: FIXTURE_ORIGIN, userId: FAKE_USER.id },
    );
    expect(roleResult, "the exact read fixture must deny the operator role").toEqual({
      status: 200,
      body: false,
    });
    expect(captured.nonGetRestCalls, "the exact read fixture is not recorded as a write").toEqual(
      [],
    );

    const probes = [
      { method: "POST", path: "grows", body: {} },
      { method: "PATCH", path: "diary_entries", body: {} },
      { method: "DELETE", path: "grow_events", body: {} },
      { method: "POST", path: "rpc/quicklog_save_event", body: {} },
      // The exact has_role arguments sent to a write RPC must still be a write:
      // the fixture exemption is bound to the has_role path, not to the body.
      {
        method: "POST",
        path: "rpc/quicklog_save_event",
        body: { _user_id: FAKE_USER.id, _role: "operator" },
      },
      {
        method: "POST",
        path: "rpc/has_role",
        body: { _user_id: "another-user", _role: "operator" },
      },
      {
        method: "POST",
        path: "rpc/has_role",
        body: { _user_id: FAKE_USER.id, _role: "staff" },
      },
      {
        method: "POST",
        path: "rpc/has_role",
        body: { _user_id: FAKE_USER.id, _role: "operator", _extra: true },
      },
      { method: "PUT", path: "rpc/has_role", body: { _user_id: FAKE_USER.id, _role: "operator" } },
    ];
    const statuses = await page.evaluate(
      async ({ origin, probes }) => {
        const statuses: number[] = [];
        for (const probe of probes) {
          const response = await fetch(`${origin}/rest/v1/${probe.path}`, {
            method: probe.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(probe.body),
          });
          statuses.push(response.status);
        }
        return statuses;
      },
      { origin: FIXTURE_ORIGIN, probes },
    );
    expect(statuses).toEqual(probes.map(() => 405));
    expect(captured.nonGetRestCalls).toEqual(
      probes.map((probe) => `${probe.method} ${FIXTURE_ORIGIN}/rest/v1/${probe.path}`),
    );

    const unmatchedBackendBlocked = await page.evaluate(async (origin) => {
      try {
        await fetch(`${origin}/functions/v1/unmocked`);
        return false;
      } catch {
        return true;
      }
    }, FIXTURE_ORIGIN);
    expect(
      unmatchedBackendBlocked,
      "an unmatched external request must not reach the network",
    ).toBe(true);
    expect(
      captured.blockedExternalRequests,
      "the fixture must intercept the unmatched request",
    ).toContain(`${FIXTURE_ORIGIN}/functions/v1/unmocked`);
  });
});
