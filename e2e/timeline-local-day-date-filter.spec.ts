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
//   No real Supabase calls, no real accounts, no real rows.
// - This spec only reads. The exact read-only has_role RPC is fulfilled with
//   false; every other non-GET request to /rest/v1/** fails the test.
import { test, expect, type Page, type Route, type Request } from "@playwright/test";

const MOCKED_PROJECT = "chromium-mocked";

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

const CORE_DIARY_SELECT = "id,note,photo_url,stage,details,entry_at,plant_id,tent_id";

/** Selects Timeline's authoritative core page read, excluding supplemental diary queries. */
function findCoreDiaryUrl(urls: string[]): string | undefined {
  return urls.find((url) => {
    const params = new URL(url).searchParams;
    return (
      params.get("select") === CORE_DIARY_SELECT &&
      params.get("grow_id") === `eq.${GROW_ID}` &&
      params.get("order") === "entry_at.desc" &&
      params.get("limit") === "100"
    );
  });
}

interface Captured {
  diaryUrls: string[];
  growEventUrls: string[];
  nonGetRestCalls: string[];
}

async function mockSignedInSupabase(page: Page, captured: Captured) {
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

  // Registered first so the final safety handler below can fall through to
  // an empty fixture for otherwise-unhandled GET reads.
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
    if (req.method() !== "GET") {
      captured.nonGetRestCalls.push(`${req.method()} ${req.url()}`);
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    captured.diaryUrls.push(req.url());
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
    if (req.method() !== "GET") {
      captured.nonGetRestCalls.push(`${req.method()} ${req.url()}`);
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    captured.growEventUrls.push(req.url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/0" },
      body: "[]",
    });
  });

  // Playwright resolves matching routes in reverse registration order. Keep
  // this safety handler LAST so no specific fixture can fulfill a mutation
  // before the write fence sees it. Only the exact read-only role RPC may use
  // POST; all GETs continue to their specific fixture (or the generic one).
  await page.route(/\/rest\/v1\//, async (route: Route, req: Request) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/rest/v1/rpc/has_role") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "false" });
      return;
    }
    if (req.method() !== "GET") {
      captured.nonGetRestCalls.push(`${req.method()} ${req.url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.fallback();
  });
}

test.describe("Timeline local-day date-range filter (issue #587, America/Chicago)", () => {
  test.use({ timezoneId: "America/Chicago" });

  test.beforeEach(async ({ page }) => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `local-day date-filter proof runs once, under the ${MOCKED_PROJECT} project`,
    );
  });

  test("write fence intercepts mutations before every specific REST fixture", async ({ page }) => {
    const captured: Captured = { diaryUrls: [], growEventUrls: [], nonGetRestCalls: [] };
    await mockSignedInSupabase(page, captured);

    const outcomes = await page.evaluate(
      async ({ baseUrl, paths }) => {
        const results: string[] = [];
        for (const path of paths) {
          try {
            await fetch(`${baseUrl}${path}`, { method: "POST", mode: "no-cors", body: "{}" });
            results.push("fulfilled");
          } catch {
            results.push("rejected");
          }
        }
        return results;
      },
      {
        baseUrl: `https://${SB_PROJECT_REF}.supabase.co`,
        paths: [
          "/rest/v1/user_agreement_acceptances",
          "/rest/v1/grows",
          "/rest/v1/tents",
          "/rest/v1/plants",
          "/rest/v1/diary_entries",
          "/rest/v1/grow_events",
        ],
      },
    );

    expect(outcomes).toEqual([
      "rejected",
      "rejected",
      "rejected",
      "rejected",
      "rejected",
      "rejected",
    ]);
    expect(captured.nonGetRestCalls).toEqual([
      `POST https://${SB_PROJECT_REF}.supabase.co/rest/v1/user_agreement_acceptances`,
      `POST https://${SB_PROJECT_REF}.supabase.co/rest/v1/grows`,
      `POST https://${SB_PROJECT_REF}.supabase.co/rest/v1/tents`,
      `POST https://${SB_PROJECT_REF}.supabase.co/rest/v1/plants`,
      `POST https://${SB_PROJECT_REF}.supabase.co/rest/v1/diary_entries`,
      `POST https://${SB_PROJECT_REF}.supabase.co/rest/v1/grow_events`,
    ]);
  });

  test("selecting 2026-07-15 applies identical America/Chicago local-day bounds to diary_entries and grow_events, keeps the URL plain, and writes nothing", async ({
    page,
  }) => {
    const captured: Captured = { diaryUrls: [], growEventUrls: [], nonGetRestCalls: [] };
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

    const coreDiaryUrl = findCoreDiaryUrl(captured.diaryUrls);
    expect(coreDiaryUrl, "authoritative core diary_entries query must be present").toBeDefined();
    const diaryBounds = extractBounds(coreDiaryUrl!, "entry_at");
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
    const captured: Captured = { diaryUrls: [], growEventUrls: [], nonGetRestCalls: [] };
    await mockSignedInSupabase(page, captured);
    await seedFakeSession(page);

    await page.goto(`/timeline?growId=${GROW_ID}&start=2026-07-20&end=2026-07-10`);

    await expect(page.getByTestId("timeline-date-range-error")).toBeVisible();
    await expect
      .poll(() => captured.diaryUrls.length, { message: "diary_entries must have been queried" })
      .toBeGreaterThan(0);

    const coreDiaryUrl = findCoreDiaryUrl(captured.diaryUrls);
    expect(coreDiaryUrl, "authoritative core diary_entries query must be present").toBeDefined();
    const diaryBounds = extractBounds(coreDiaryUrl!, "entry_at");
    expect(diaryBounds.gte, "an invalid range must not guess a lower bound").toBeNull();
    expect(diaryBounds.lte, "an invalid range must not guess an upper bound").toBeNull();

    expect(captured.nonGetRestCalls, "read-only load must never write").toEqual([]);
  });
});
