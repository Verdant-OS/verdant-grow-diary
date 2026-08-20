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
/** Distinct from the spine id — production never reuses one id for both rows. */
export const FAKE_DIARY_ENTRY_ID = "55555555-5555-4555-8555-555555555555";

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
  /** Diary companions, linked to a spine row via details.linked_grow_event_id. */
  savedRows: Array<Record<string, unknown>>;
  /** The typed grow_events spine rows the same save writes. */
  savedGrowEvents: Array<Record<string, unknown>>;
  /**
   * Correctly grow-scoped reads served, per table.
   *
   * `grow_events` counts only the CORE listing read. Timeline also issues a
   * small supplemental by-id lookup to resolve diary companions whose spine
   * row the core query missed; that one is counted separately as
   * `grow_events_by_id`. Collapsing the two would make the S7 evidence
   * assertion satisfiable by the supplemental lookup alone, so a Timeline
   * that lost its core grow_events query entirely would still measure green.
   */
  reads: { diary_entries: number; grow_events: number; grow_events_by_id: number };
  /**
   * The `p_idempotency_key` the last accepted save carried, or null if it
   * carried none. Production treats an absent key as "do not deduplicate at
   * all" (the dedup lookup sits inside `IF p_idempotency_key IS NOT NULL`),
   * so a surface that silently dropped the field would still save — and would
   * write a second row on any lost-response retry. Exposed so a scenario can
   * assert the key was actually sent.
   */
  lastIdempotencyKey: string | null;
  rpcMode: "ok" | "fail";
}

export function createMockedWorld(): MockedWorld {
  return {
    savedRows: [],
    savedGrowEvents: [],
    reads: { diary_entries: 0, grow_events: 0, grow_events_by_id: 0 },
    lastIdempotencyKey: null,
    rpcMode: "ok",
  };
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
/**
 * True only when the request carries the expected `grow_id=eq.<uuid>` filter.
 *
 * Dispatching on pathname alone would serve rows for ANY scope, so a Timeline
 * that dropped or mangled its grow filter would still render this grow's
 * evidence and the scenario would claim correctly-scoped evidence it never
 * proved.
 */
function readScoped(
  world: MockedOneTentWorld,
  table: "diary_entries" | "grow_events",
  request: Request,
): unknown[] {
  if (!scopedToFakeGrow(request)) return [];
  if (table === "diary_entries") {
    world.reads.diary_entries += 1;
    return world.savedRows;
  }
  // The supplemental companion-resolution lookup is the only grow_events read
  // that carries an `id=in.(...)` filter (Timeline.tsx). The core listing read
  // filters on grow_id/is_deleted and orders by occurred_at instead.
  world.reads[isByIdLookup(request) ? "grow_events_by_id" : "grow_events"] += 1;
  return world.savedGrowEvents;
}

function isByIdLookup(request: Request): boolean {
  return (new URL(request.url()).searchParams.get("id") ?? "").startsWith("in.");
}

function scopedToFakeGrow(request: Request): boolean {
  return new URL(request.url()).searchParams.get("grow_id") === `eq.${FAKE_GROW_ID}`;
}

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
              ? readScoped(world, "diary_entries", request)
              : pathname.endsWith("/grow_events")
                ? readScoped(world, "grow_events", request)
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
    // Rows are DERIVED FROM THE INTERCEPTED PAYLOAD, never hard-coded.
    // Manufacturing a correctly-scoped "Better" entry regardless of what the
    // app submitted would make S7 circular: it would render the expected
    // evidence and record an authoritative passing receipt even if the UI sent
    // the wrong note, target, or action. Echoing the submission means a wrong
    // save produces wrong evidence and the scenario fails, which is the whole
    // point of calling this measured.
    const submitted = (() => {
      try {
        return (request.postDataJSON() ?? {}) as Record<string, unknown>;
      } catch {
        return {} as Record<string, unknown>;
      }
    })();
    const asText = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const submittedNote = asText(submitted.p_note);
    const submittedTargetType = asText(submitted.p_target_type);
    const submittedTargetId = asText(submitted.p_target_id);
    const submittedPlantId = submittedTargetType === "plant" ? submittedTargetId : null;
    const submittedTentId =
      submittedTargetType === "tent"
        ? submittedTargetId
        : (asText(submitted.p_tent_id) ?? FAKE_TENT_ID);

    // The real RPC validates the target against rows the caller owns and fails
    // closed on anything else. Copying p_target_id without checking it would
    // just relocate the circularity the payload derivation was meant to remove:
    // a save aimed at the WRONG plant would still manufacture a matching row,
    // and because Timeline is only grow-scoped the "Better" assertion would
    // still pass with a wrong plant association.
    const targetRecognized =
      (submittedTargetType === "plant" && submittedTargetId === FAKE_PLANT_ID) ||
      (submittedTargetType === "tent" && submittedTargetId === FAKE_TENT_ID);
    if (!targetRecognized) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "plant_not_found" }),
      });
      return;
    }

    // One canonical save writes TWO rows, exactly as quicklog_save_manual
    // does: the typed grow_events spine, plus a diary companion carrying
    // `details.linked_grow_event_id` back to it. Timeline reads BOTH sources
    // and de-duplicates them into one entry, so a fixture that emits only the
    // diary row would exercise the fallback path alone — it could not detect a
    // broken grow-event read, a broken merge, or duplicated evidence.
    // `quicklog_save_manual` accepts exactly two actions and rejects the rest
    // (migration 20260818010000:674). A fixture that accepted anything would
    // let a surface ship an action production refuses.
    const submittedAction = asText(submitted.p_action);
    if (submittedAction !== "water" && submittedAction !== "note") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "unsupported_action" }),
      });
      return;
    }

    // Production accepts an idempotency key of 8-200 characters and rejects
    // anything outside that band before writing
    // (20260818010000_quicklog_manual_delegate_forward_repair.sql:645).
    // A stub that took any key would let a surface ship one production
    // refuses, and the scenario would still show a successful save.
    const submittedKey = asText(submitted.p_idempotency_key);
    if (submittedKey !== null && (submittedKey.length < 8 || submittedKey.length > 200)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "invalid_idempotency_key" }),
      });
      return;
    }
    world.lastIdempotencyKey = submittedKey;

    const occurredAt = asText(submitted.p_occurred_at) ?? new Date().toISOString();
    world.savedGrowEvents.push({
      id: FAKE_GROW_EVENT_ID,
      grow_id: FAKE_GROW_ID,
      plant_id: submittedPlantId,
      tent_id: submittedTentId,
      // The RPC does NOT persist the transport action verbatim: it maps it to
      // a spine event_type (migration 20260818010000:730) — 'water' becomes
      // 'watering', everything else 'observation'. Copying `p_action` through
      // would give the merged Timeline entry an identity production never
      // writes, so a break in observation classification or presentation
      // could not fail this scenario.
      event_type: submittedAction === "water" ? "watering" : "observation",
      occurred_at: occurredAt,
      note: submittedNote,
      source: "manual",
      is_deleted: false,
      watering_events: [],
      feeding_events: [],
    });
    world.savedRows.push({
      id: FAKE_DIARY_ENTRY_ID,
      plant_id: submittedPlantId,
      tent_id: submittedTentId,
      grow_id: FAKE_GROW_ID,
      event_type: "quick_log",
      note: submittedNote,
      photo_url: null,
      stage: null,
      entry_at: occurredAt,
      retracted_at: null,
      details: {
        event_type: "observation",
        plant_name: submittedPlantId === FAKE_PLANT_ID ? FAKE_PLANT.name : null,
        linked_grow_event_id: FAKE_GROW_EVENT_ID,
      },
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        grow_event_id: FAKE_GROW_EVENT_ID,
        environment_event_id: null,
        diary_entry_id: FAKE_DIARY_ENTRY_ID,
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
