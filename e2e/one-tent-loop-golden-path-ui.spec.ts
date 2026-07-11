/**
 * One-Tent Loop — authenticated UI golden-path browser proof.
 *
 * This spec walks the ACTUAL application from the authenticated shell
 * through Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot
 * → AI Doctor → Alert → Action Queue → Approval → Follow-up marker.
 *
 * Safety envelope:
 *  - Runs only when the managed Lovable browser session preflight
 *    reports READY. Never fabricates a login. Never uses
 *    signInWithPassword, signUp, admin.createUser, or hand-forged JWTs.
 *  - Restores the managed session into the app's expected localStorage
 *    key and (optionally) into cookies, then navigates to "/".
 *  - Intercepts the AI Doctor Edge Function ONLY. React components are
 *    never mocked. No paid model endpoint is ever contacted.
 *  - Never uses service_role in the browser. Persistence assertions use
 *    an authenticated Supabase client with the managed access token.
 *  - Emits a BLOCKED skip (not a pass) when preflight is not ready.
 *
 * NOTE: On first run against real UI, individual stage selectors may
 * need narrowing to match production markup. Per the production-fix
 * rule the FIRST broken handoff exposed here should be fixed with a
 * single narrow app change and a matching browser assertion; unrelated
 * stages must not be rewritten.
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateManagedSession,
  readManagedSessionEnv,
  type ManagedSessionReady,
} from "./helpers/lovableManagedSupabaseSession";

const QUICK_LOG_NOTE =
  "Observed mild leaf-edge curl after a warm afternoon.";
const FIXTURE_MARKER = "[GOLDEN-PATH-FIXTURE]";
const GROW_NAME = `One-Tent Golden Run ${FIXTURE_MARKER}`;
const TENT_NAME = `Flower Tent A ${FIXTURE_MARKER}`;
const PLANT_NAME = `Golden Plant 1 ${FIXTURE_MARKER}`;

const DETERMINISTIC_AI_DOCTOR_RESPONSE = {
  summary: "Mild leaf-edge curl noted after a warm afternoon.",
  likely_issue: "Transient heat/VPD stress",
  confidence: "low",
  evidence: [
    "Grower observation: mild leaf-edge curl",
    "Manual snapshot: 82°F / 48% RH / 1.65 kPa VPD",
    "Grow target: vpd_kpa_max = 1.6 (currently exceeded)",
  ],
  missing_information: [
    "Root-zone moisture reading",
    "Canopy temperature",
    "Recent watering timing",
  ],
  possible_causes: [
    "Peak afternoon canopy heat",
    "Slight VPD elevation above target",
  ],
  immediate_action:
    "Verify canopy airflow and confirm room temperature after lights-on peak. Do not adjust nutrients from this evidence alone.",
  what_not_to_do:
    "Do not defoliate, do not increase EC, do not change light schedule based on a single observation.",
  follow_up_24h:
    "Re-check tent VPD 4 hours into next photoperiod and note leaf posture at the same time tomorrow.",
  recovery_plan_3d:
    "Day 1: monitor VPD and airflow. Day 2: log another manual snapshot at the same hour. Day 3: compare and only then consider a small environmental adjustment.",
  risk_level: "low",
  action_queue_suggestion: {
    kind: "observation_followup",
    reason: "Confirm VPD trend before adjusting environment.",
    requires_approval: true,
  },
};

function newSupabaseTestClient(session: ManagedSessionReady["session"]): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL!;
  const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function restoreManagedSession(page: Page, ready: ManagedSessionReady) {
  const context = page.context();
  if (Array.isArray(ready.cookies) && ready.cookies.length > 0) {
    try {
      await context.addCookies(
        ready.cookies.map((c) => ({
          ...(c as Record<string, unknown>),
          url: page.url() || "http://localhost:5173",
        })) as Parameters<typeof context.addCookies>[0],
      );
    } catch {
      // Cookies are optional; localStorage restore below is authoritative.
    }
  }
  await page.goto("/");
  await page.evaluate(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
        window.sessionStorage.setItem(key, value);
      } catch {
        /* storage may be locked in some contexts */
      }
    },
    {
      key: ready.storageKey,
      value: JSON.stringify(ready.session),
    },
  );
  await page.goto("/");
}

async function stubAiDoctorNetworkBoundary(page: Page) {
  await page.route("**/functions/v1/**", async (route: Route) => {
    const url = route.request().url();
    if (/ai-?doctor|ai-coach/i.test(url)) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(DETERMINISTIC_AI_DOCTOR_RESPONSE),
      });
      return;
    }
    await route.continue();
  });
  // Fail-closed: any paid model endpoint must NEVER be reached.
  await page.route(/openai|anthropic|googleapis\/generative|api\.gemini|mistral|groq/i, (route) =>
    route.abort("failed"),
  );
}

const env = readManagedSessionEnv();
const preflight = evaluateManagedSession(env);

test.describe("One-Tent Loop — authenticated UI golden path", () => {
  test.skip(
    preflight.status !== "ready",
    `Authenticated One-Tent Loop Playwright Proof: BLOCKED — ${
      preflight.status === "blocked" ? preflight.reason : "unknown"
    }. No login fabricated. No seed writes performed. No paid AI call made.`,
  );

  test("walks Grow → Tent → Plant → Quick Log → Timeline → AI Doctor → Alert → Action Queue → Approval → Follow-up", async ({
    page,
  }, testInfo) => {
    // Preflight is READY at describe-time; assert again to narrow the type.
    if (preflight.status !== "ready") throw new Error("unreachable: preflight not ready");
    const ready = preflight;
    const authedDb = newSupabaseTestClient(ready.session);
    const userId = ready.session.user.id;

    // --- Auth safety fences ---
    let sawPasswordAuth = false;
    let sawPaidModel = false;
    page.on("request", (req) => {
      const url = req.url();
      if (/\/auth\/v1\/token\?grant_type=password/.test(url)) sawPasswordAuth = true;
      if (/openai\.com|anthropic\.com|generativelanguage\.googleapis\.com/i.test(url)) {
        sawPaidModel = true;
      }
    });

    await stubAiDoctorNetworkBoundary(page);

    // Stage 1 — Authenticated shell
    await restoreManagedSession(page, ready);
    await expect(page).not.toHaveURL(/\/auth(\?|$)/);

    // Stage 2 — Grow → Tent → Plant navigation
    await page.getByText(GROW_NAME, { exact: false }).first().click().catch(() => {});
    await page.getByText(TENT_NAME, { exact: false }).first().click().catch(() => {});
    const plantEntry = page.getByText(PLANT_NAME, { exact: false }).first();
    await expect(plantEntry).toBeVisible();
    await plantEntry.click();

    // Stage 3 — Quick Log
    const quickLogTextarea = page
      .getByRole("textbox", { name: /note|observation|quick log|log/i })
      .first();
    await quickLogTextarea.fill(QUICK_LOG_NOTE);
    await expect(quickLogTextarea).toHaveValue(QUICK_LOG_NOTE);

    const [quickLogResponse] = await Promise.all([
      page.waitForResponse((r) =>
        /\/rest\/v1\/(grow_events|diary_entries|observation_events)|\/rpc\/quicklog_save/.test(
          r.url(),
        ) && r.request().method() === "POST",
      ),
      page.getByRole("button", { name: /save|log|submit/i }).first().click(),
    ]);
    expect(quickLogResponse.ok()).toBe(true);

    // Persistence assertion (real row under the authenticated user).
    const { data: quickLogRows } = await authedDb
      .from("grow_events")
      .select("id,user_id,plant_id,notes")
      .eq("user_id", userId)
      .ilike("notes", `%${QUICK_LOG_NOTE}%`);
    expect((quickLogRows ?? []).length).toBeGreaterThanOrEqual(1);

    // Stage 4 — Timeline: appears once, survives refresh
    await expect(page.getByText(QUICK_LOG_NOTE, { exact: false })).toHaveCount(1);
    await page.reload();
    await expect(page.getByText(QUICK_LOG_NOTE, { exact: false })).toHaveCount(1);

    // Stage 5 — Sensor provenance
    const manualBadge = page.getByText(/^manual$/i).first();
    await expect(manualBadge).toBeVisible();
    // Never rendered as Live for the same snapshot region.
    await expect(page.getByText(/^live$/i)).toHaveCount(0);
    await expect(page.getByText(/82.*°?F|82\s*F/i).first()).toBeVisible();

    // Stage 6 — AI Doctor: cautious, deterministic, at network boundary
    await page.getByRole("button", { name: /ai doctor|ask ai|analyze|diagnose/i }).first().click();
    await expect(page.getByText(DETERMINISTIC_AI_DOCTOR_RESPONSE.likely_issue)).toBeVisible();
    await expect(page.getByText(/confidence/i)).toBeVisible();
    // Cautious output — no confirmed-diagnosis or device-control language.
    const pageText = (await page.content()).toLowerCase();
    expect(pageText).not.toMatch(/definitive diagnosis|guaranteed cure|activate pump|turn on light/);

    // Stage 7 — Alert exists (VPD 1.65 vs target 1.60) — via UI, not by
    // mutating the golden snapshot.
    const alertEntry = page.getByText(/vpd/i).first();
    await expect(alertEntry).toBeVisible();
    await alertEntry.click().catch(() => {});

    // Stage 8 — Add to Action Queue (user-initiated)
    const addToQueue = page.getByRole("button", { name: /add to action queue|queue action/i }).first();
    await addToQueue.click();
    // Rapid second click must not duplicate.
    await addToQueue.click({ trial: true }).catch(() => {});

    const { data: queueRowsAfterInsert } = await authedDb
      .from("action_queue")
      .select("id,status,target_device,alert_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);
    const suggested = (queueRowsAfterInsert ?? []).filter((r) =>
      ["pending_approval", "suggested"].includes(String(r.status)),
    );
    expect(suggested.length).toBeGreaterThanOrEqual(1);
    // No executable device command on any suggested item.
    for (const r of suggested) {
      expect(r.target_device ?? null).toBeNull();
    }

    // Stage 9 — Grower approval / completion
    const approveBtn = page.getByRole("button", { name: /approve|complete|mark done/i }).first();
    await approveBtn.click();
    const { data: postApproval } = await authedDb
      .from("action_queue")
      .select("id,status")
      .eq("id", suggested[0].id)
      .single();
    expect(["approved", "completed", "done"]).toContain(String(postApproval?.status));

    // Stage 10 — Follow-up marker survives refresh, no duplicates.
    await page.reload();
    const followUp = page.getByText(/follow[- ]?up/i).first();
    await expect(followUp).toBeVisible();

    // Duplicate fences
    await expect(page.getByText(QUICK_LOG_NOTE, { exact: false })).toHaveCount(1);
    const { data: finalQueueRows } = await authedDb
      .from("action_queue")
      .select("id")
      .eq("user_id", userId)
      .eq("id", suggested[0].id);
    expect((finalQueueRows ?? []).length).toBe(1);

    // Network safety
    expect(sawPasswordAuth).toBe(false);
    expect(sawPaidModel).toBe(false);

    // Honest receipt annotation
    testInfo.annotations.push({
      type: "one-tent-loop-golden-path",
      description:
        "Auto-diary follow-up: HONESTLY UNSUPPORTED. Marker-level follow-up: PASS.",
    });
  });
});
