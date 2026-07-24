// Playwright proof of the Public Quick Log → First Diary Entry activation
// loop: anonymous /quick-log draft → (mocked) signup → authenticated
// "Continue your Quick Log" resume card → prefilled EXISTING Quick Log
// dialog → explicit "Save log" → exactly one RPC write → draft cleared
// only after confirmed success → entry visible in Timeline.
//
// SAFETY:
// - All Supabase /auth/v1/** and /rest/v1/** traffic is intercepted via
//   page.route(). No real Supabase calls, no real accounts, no real rows.
// - The "write" is a stubbed quicklog_save_manual RPC whose success pushes
//   an in-memory diary row, so Timeline truthfully shows nothing before
//   the explicit save and exactly one entry after it.
// - The failure path stubs an RPC reason-code response and proves the
//   draft survives and the save is retryable.
import { test, expect, type Page } from "@playwright/test";

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

const GROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PLANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GROW_EVENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const DRAFT_KEY = "verdant.quickLogStarter.draft.v1";
const NICKNAME = "Blue Dream #1";
const NOTE_TEXT = "First true leaves look healthy.";

// Requests this presentation/handoff surface must never make.
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

interface MockWorld {
  rpcCalls: number;
  rpcMode: "ok" | "fail";
  savedRows: Array<Record<string, unknown>>;
}

async function mockSignedInSupabase(page: Page, world: MockWorld) {
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

  // Catch-all FIRST; specific stubs AFTER (later-registered wins).
  await page.route(/\/rest\/v1\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  // The mocked user is "already consented": the real signup flow records
  // acceptance rows, so the re-consent gate must not overlay this journey.
  // Versions mirror src/constants/agreements.ts.
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
  await page.route(/\/rest\/v1\/grows/, (route) =>
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
  await page.route(/\/rest\/v1\/tents/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: TENT_ID,
          name: "Test Tent",
          grow_id: GROW_ID,
          is_archived: false,
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ]),
    }),
  );
  await page.route(/\/rest\/v1\/plants/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: PLANT_ID,
          name: NICKNAME,
          tent_id: TENT_ID,
          grow_id: GROW_ID,
          is_archived: false,
          stage: "veg",
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ]),
    }),
  );
  // Timeline reads: reflect exactly what the (stubbed) RPC has "written".
  await page.route(/\/rest\/v1\/diary_entries/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": `0-${world.savedRows.length}/${world.savedRows.length}` },
      body: JSON.stringify(world.savedRows),
    }),
  );
  // The ONLY write seam: the existing quicklog_save_manual RPC, stubbed.
  await page.route(/\/rest\/v1\/rpc\/quicklog_save_manual/, async (route, req) => {
    if (req.method() !== "POST") {
      await route.fulfill({ status: 405, contentType: "application/json", body: "{}" });
      return;
    }
    world.rpcCalls += 1;
    if (world.rpcMode === "fail") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "tent_not_found" }),
      });
      return;
    }
    world.savedRows.push({
      id: GROW_EVENT_ID,
      note: NOTE_TEXT,
      photo_url: null,
      stage: "veg",
      details: { event_type: "observation", plant_name: NICKNAME },
      entry_at: new Date().toISOString(),
      plant_id: PLANT_ID,
      tent_id: TENT_ID,
      grow_id: GROW_ID,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        grow_event_id: GROW_EVENT_ID,
        environment_event_id: null,
        diary_entry_id: null,
        reused: false,
      }),
    });
  });
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

async function storedDraftRaw(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => window.localStorage.getItem(key),
    DRAFT_KEY,
  );
}

/**
 * Step 1 of the journey is GENUINELY signed out: no session has been
 * seeded when this runs, proving the draft is created anonymously and
 * survives into the authenticated session established afterwards.
 */
async function createAnonymousDraft(page: Page) {
  await page.goto("/quick-log");
  const sessionRaw = await page.evaluate(
    (key) => window.sessionStorage.getItem(key),
    SB_SESSION_KEY,
  );
  expect(sessionRaw, "draft creation must be anonymous").toBeNull();
  await expect(page.getByTestId("public-quick-log-starter")).toBeVisible();
  await page.getByTestId("starter-plant-nickname").fill(NICKNAME);
  await page.getByTestId("starter-note").fill(NOTE_TEXT);
  await page.getByTestId("starter-save-draft").click();
  await expect(page.getByTestId("starter-saved-draft")).toBeVisible();
  expect(await storedDraftRaw(page)).not.toBeNull();
}

async function walkResumeToSave(page: Page, world: MockWorld) {
  // Post-signup landing: /onboarding shows the resume card.
  await page.goto("/onboarding");
  await acceptReconsentGateIfShown(page);
  const card = page.getByTestId("public-quick-log-handoff-card");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("public-quick-log-handoff-status-line")).toContainText(
    /not in your diary yet/i,
  );
  await expect(page.getByTestId("public-quick-log-handoff-row-plant")).toContainText(
    NICKNAME,
  );

  // The draft is still local and NOTHING has been written.
  expect(await storedDraftRaw(page)).not.toBeNull();
  expect(world.rpcCalls).toBe(0);

  // Review: the EXISTING Quick Log dialog opens prefilled.
  await page.getByTestId("public-quick-log-handoff-review-save").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("quicklog-note")).toHaveValue(NOTE_TEXT);
  await expect(dialog.getByTestId("quick-log-target-plant")).toContainText(NICKNAME);

  // Nothing is written until the grower's explicit save.
  expect(world.rpcCalls).toBe(0);
  expect(await storedDraftRaw(page)).not.toBeNull();

  await dialog.getByTestId("quick-log-save").click();
}

test.describe("Public Quick Log → first diary entry activation loop (mocked)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `activation-loop proof runs once, under the ${MOCKED_PROJECT} project`,
    );
    // NOTE: the fake session is deliberately NOT seeded here. Each test
    // creates the draft anonymously first, then calls seedFakeSession —
    // the mocked stand-in for completing signup — so the journey proves
    // an anonymous draft survives authentication.
  });

  test("desktop 1280x800: draft survives signup, becomes exactly one entry, appears in Timeline", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const world: MockWorld = { rpcCalls: 0, rpcMode: "ok", savedRows: [] };
    await mockSignedInSupabase(page, world);
    const traffic = watchTraffic(page);

    await createAnonymousDraft(page);
    // "Signup completes": the mocked session takes effect on the next
    // navigation, exactly where the real redirectTo flow would land.
    await seedFakeSession(page);
    await walkResumeToSave(page, world);

    // Confirmed success: post-save panel, exactly one RPC write, draft gone.
    await expect(page.getByTestId("quick-log-post-save")).toBeVisible();
    expect(world.rpcCalls).toBe(1);
    await expect
      .poll(async () => storedDraftRaw(page), { timeout: 5_000 })
      .toBeNull();

    // Close the dialog and verify the REAL Timeline surface shows the entry.
    await page.getByTestId("quick-log-post-save-close").click();
    await page.goto(`/timeline?growId=${GROW_ID}`);
    await acceptReconsentGateIfShown(page);
    await expect(page.getByText(NOTE_TEXT).first()).toBeVisible();

    expect(world.rpcCalls, "still exactly one write after navigation").toBe(1);
    expect(traffic.forbidden, "forbidden AI/function requests").toEqual([]);
    expect(traffic.pageErrors, "uncaught page errors").toEqual([]);
  });

  test("mobile 390x844: the full loop works at narrow width with no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const world: MockWorld = { rpcCalls: 0, rpcMode: "ok", savedRows: [] };
    await mockSignedInSupabase(page, world);
    const traffic = watchTraffic(page);

    await createAnonymousDraft(page);
    await seedFakeSession(page);

    await page.goto("/onboarding");
    await acceptReconsentGateIfShown(page);
    await expect(page.getByTestId("public-quick-log-handoff-card")).toBeVisible();

    // No horizontal overflow on the resume surface at 390px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "horizontal overflow px").toBeLessThanOrEqual(0);

    await page.getByTestId("public-quick-log-handoff-review-save").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("quicklog-note")).toHaveValue(NOTE_TEXT);
    await dialog.getByTestId("quick-log-save").click();

    await expect(page.getByTestId("quick-log-post-save")).toBeVisible();
    expect(world.rpcCalls).toBe(1);
    await expect
      .poll(async () => storedDraftRaw(page), { timeout: 5_000 })
      .toBeNull();

    expect(traffic.forbidden, "forbidden AI/function requests").toEqual([]);
    expect(traffic.pageErrors, "uncaught page errors").toEqual([]);
  });

  test("write failure: the draft is retained, the error is calm, and the save is recoverable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const world: MockWorld = { rpcCalls: 0, rpcMode: "fail", savedRows: [] };
    await mockSignedInSupabase(page, world);
    const traffic = watchTraffic(page);

    await createAnonymousDraft(page);
    // "Signup completes": the mocked session takes effect on the next
    // navigation, exactly where the real redirectTo flow would land.
    await seedFakeSession(page);
    await walkResumeToSave(page, world);

    // Failure: recoverable error shown, NO success panel, draft retained.
    await expect(page.getByTestId("quick-log-save-error")).toBeVisible();
    await expect(page.getByTestId("quick-log-post-save")).toHaveCount(0);
    expect(world.rpcCalls).toBe(1);
    expect(await storedDraftRaw(page)).not.toBeNull();

    // Recovery: the backend comes back; the SAME review surface saves once.
    world.rpcMode = "ok";
    await page.getByRole("dialog").getByTestId("quick-log-save").click();
    await expect(page.getByTestId("quick-log-post-save")).toBeVisible();
    expect(world.rpcCalls).toBe(2);
    await expect
      .poll(async () => storedDraftRaw(page), { timeout: 5_000 })
      .toBeNull();

    expect(traffic.forbidden, "forbidden AI/function requests").toEqual([]);
    expect(traffic.pageErrors, "uncaught page errors").toEqual([]);
  });
});
