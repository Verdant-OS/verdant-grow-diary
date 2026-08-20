/**
 * Shared mocked-Supabase world for the One-Tent interaction-counter harness
 * (Tranche B+ PR-B0a). Extracts the merged-precedent recipe used across the
 * repo's chromium-mocked specs so measurement scenarios stay credential-free
 * and deterministic.
 *
 * SAFETY (mirrors the merged mocked specs; enforced by
 * src/test/quicklog-e2e-harness-safety.test.ts):
 * - No real Supabase calls, no real accounts, no real rows.
 * - Fake session token literal only (never a real bearer shape).
 * - No elevated DB role, no edge-function invocation of a paid model.
 * - Every /functions/v1 request is stubbed 404 and model hosts are aborted,
 *   so a measured scenario can never spend an AI credit.
 * - Supabase writes are counted at the network seam via the injected counter.
 */
import type { Page, Route, Request } from "@playwright/test";

import type { InteractionCounter, RestWriteVerb } from "./interactionCounter";

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
export const SB_SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
export const MOCKED_PROJECT = "chromium-mocked";

export const FAKE_USER = {
  id: "one-tent-counter-user",
  aud: "authenticated",
  email: "counter@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};

export const FAKE_GROW_ID = "11111111-1111-4111-8111-111111111111";
export const FAKE_TENT_ID = "22222222-2222-4222-8222-222222222222";
export const FAKE_PLANT_ID = "33333333-3333-4333-8333-333333333333";
export const FAKE_GROW_EVENT_ID = "44444444-4444-4444-8444-444444444444";

const FAKE_GROW = {
  id: FAKE_GROW_ID,
  name: "Counter Grow",
  stage: "veg",
  is_archived: false,
  created_at: "2020-01-01T00:00:00.000Z",
};

const FAKE_TENT = {
  id: FAKE_TENT_ID,
  grow_id: FAKE_GROW_ID,
  name: "Counter Tent",
  brand: "",
  size: "2x2",
  stage: "veg",
  light_on: true,
  light_schedule: "18/6",
  light_wattage: 100,
  is_archived: false,
  created_at: "2020-01-01T00:00:00.000Z",
};

const FAKE_PLANT = {
  id: FAKE_PLANT_ID,
  grow_id: FAKE_GROW_ID,
  tent_id: FAKE_TENT_ID,
  name: "Counter Plant",
  strain: "Browser fixture",
  stage: "veg",
  started_at: "2020-01-01T00:00:00.000Z",
  health: "healthy",
  plant_type: "unknown",
  photo_url: null,
  last_note: null,
  is_archived: false,
  medium: "soil",
  pot_size: "3 gal",
};

// Agreement versions mirror src/constants/agreements.ts so the re-consent
// gate never overlays a measured scenario (which would skew counts).
const AGREEMENT_ROWS = [
  { agreement_type: "terms", version: "2026-07-13" },
  { agreement_type: "privacy", version: "2026-07-13" },
];

export interface MockedWorld {
  savedRows: Array<Record<string, unknown>>;
  rpcMode: "ok" | "fail";
}

export function createMockedWorld(): MockedWorld {
  return { savedRows: [], rpcMode: "ok" };
}

export async function seedFakeSession(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, user }) => {
      try {
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
      } catch {
        /* ignore */
      }
    },
    { key: SB_SESSION_KEY, user: FAKE_USER },
  );
}

/**
 * Fulfill a PostgREST read honestly for both list and `.single()` callers:
 * object-accept requests get the first row as a bare object.
 */
/** Edge functions that meter AI credits (AGENTS.md — AI Credit Enforcement). */
const PAID_AI_EDGE_FUNCTIONS = ["ai-doctor-review", "ai-coach"] as const;

function fulfillRows(route: Route, request: Request, rows: unknown[]): Promise<void> {
  const accept = request.headers()["accept"] ?? "";
  const wantsObject = accept.includes("vnd.pgrst.object");
  const body = wantsObject ? JSON.stringify(rows[0] ?? null) : JSON.stringify(rows);
  const contentType = wantsObject ? "application/vnd.pgrst.object+json" : "application/json";
  return route.fulfill({
    status: 200,
    contentType,
    headers: { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
    body,
  });
}

/**
 * Install the full signed-in mocked backend. When `counter` is supplied, every
 * REST write verb and RPC call is tallied at the seam so counts never depend
 * on browser event synthesis.
 */
export async function mockSignedInSupabase(
  page: Page,
  world: MockedWorld,
  counter?: InteractionCounter,
): Promise<void> {
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

  // Catch-all REST FIRST; specific stubs AFTER — Playwright gives precedence
  // to the most recently registered matching route, so the order here is
  // load-bearing: registering the catch-all last would swallow the RPC.
  await page.route(/\/rest\/v1\//, async (route, request) => {
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    // PostgREST addresses every RPC over POST, so an RPC is NOT a table
    // write: tally it by name (e.g. the read-only `has_role` check) and keep
    // rest_post meaning "a direct table insert", which is what the
    // second-persistence-path assertions are actually about.
    const rpcName = pathname.includes("/rest/v1/rpc/")
      ? pathname.slice(pathname.lastIndexOf("/") + 1)
      : null;
    if (rpcName) {
      counter?.recordRpc(rpcName);
      await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
      return;
    }
    if (method === "POST" || method === "PATCH" || method === "DELETE") {
      counter?.recordRestWrite(method as RestWriteVerb);
      await route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      return;
    }
    const rows = pathname.endsWith("/user_agreement_acceptances")
      ? AGREEMENT_ROWS
      : pathname.endsWith("/plants")
        ? [FAKE_PLANT]
        : pathname.endsWith("/tents")
          ? [FAKE_TENT]
          : pathname.endsWith("/grows")
            ? [FAKE_GROW]
            : pathname.endsWith("/diary_entries")
              ? world.savedRows
              : [];
    await fulfillRows(route, request, rows);
  });

  // The single write seam: quicklog_save_manual, stubbed and counted.
  await page.route(/\/rest\/v1\/rpc\/quicklog_save_manual/, async (route, request) => {
    if (request.method() !== "POST") {
      await route.fulfill({ status: 405, contentType: "application/json", body: "{}" });
      return;
    }
    counter?.recordRpc("quicklog_save_manual");
    if (world.rpcMode === "fail") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "tent_not_found" }),
      });
      return;
    }
    world.savedRows.push({
      id: FAKE_GROW_EVENT_ID,
      plant_id: FAKE_PLANT_ID,
      tent_id: FAKE_TENT_ID,
      grow_id: FAKE_GROW_ID,
      event_type: "quick_log",
      note: "Better",
      photo_url: null,
      entry_at: new Date().toISOString(),
      details: { event_type: "observation", plant_name: FAKE_PLANT.name },
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        grow_event_id: FAKE_GROW_EVENT_ID,
        environment_event_id: null,
        diary_entry_id: null,
        reused: false,
      }),
    });
  });

  // Paid-AI fence: edge functions stubbed, model hosts aborted, and any leak
  // recorded so an assertion of zero paid requests can catch it.
  //
  // The metered functions are counted HERE, before the stub answers. A paid
  // call made through an edge function reaches the provider server-side, so
  // the browser never sees the model host — the model-host route below cannot
  // observe it. Counting only there would leave `paid_ai_requests === 0`
  // green after a regression that starts spending real credits.
  await page.route(/\/functions\/v1\//, (route, request) => {
    const path = new URL(request.url()).pathname;
    if (PAID_AI_EDGE_FUNCTIONS.some((fn) => path.endsWith(`/${fn}`))) {
      counter?.recordPaidAiRequest();
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  await page.route(/openai|anthropic|api\.groq/i, (route) => {
    counter?.recordPaidAiRequest();
    return route.abort();
  });
  await page.route(/google-analytics\.com|googletagmanager\.com/, (route) => route.abort());
}
