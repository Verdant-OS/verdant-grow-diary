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
 *  - Restores VALIDATED managed cookies into the context BEFORE any
 *    navigation, then the Supabase local-storage session, then loads
 *    the app. Malformed cookies fail preflight closed — no partial set
 *    is ever restored.
 *  - Intercepts the AI Doctor Edge Function ONLY. React components are
 *    never mocked. No paid model endpoint is ever contacted.
 *  - Never uses service_role in the browser. Persistence assertions use
 *    an authenticated Supabase client with the managed access token.
 *  - Emits a BLOCKED skip (not a pass) when preflight is not ready.
 *
 * Receipts: every outcome (blocked / pass / fail) prints a human line
 * plus exactly one deterministic ONE_TENT_BROWSER_PROOF_JSON= line —
 * see e2e/helpers/oneTentBrowserProofReceipt.ts. No tokens, cookies,
 * worker IDs, timestamps, or file paths ever enter the receipt.
 *
 * Optional cleanup: when LOVABLE_E2E_TEARDOWN_AFTER_SUCCESS=true, the
 * confirmed teardown CLI runs AFTER a fully passing proof only — never
 * after BLOCKED or FAIL (failed-run fixtures are evidence; keep them).
 * Teardown failure is surfaced, never hidden.
 *
 * NOTE: On first run against real UI, individual stage selectors may
 * need narrowing to match production markup. Per the production-fix
 * rule the FIRST broken handoff exposed here should be fixed with a
 * single narrow app change and a matching browser assertion; unrelated
 * stages must not be rewritten.
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateManagedSession,
  readManagedSessionEnv,
  restoreManagedCookiesBeforeNavigation,
  type ManagedSessionReady,
} from "./helpers/lovableManagedSupabaseSession";
import {
  buildBlockedOneTentBrowserProofReceipt,
  buildOneTentBrowserProofReceipt,
  renderOneTentBrowserProofReceipt,
  type OneTentProofStage,
  type OneTentProofStagedResult,
  type StageOutcome,
} from "./helpers/oneTentBrowserProofReceipt";

const QUICK_LOG_NOTE = "Observed mild leaf-edge curl after a warm afternoon.";
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
  possible_causes: ["Peak afternoon canopy heat", "Slight VPD elevation above target"],
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

async function restoreManagedSession(
  page: Page,
  ready: ManagedSessionReady,
  rawSessionJson: string,
) {
  const context = page.context();
  // Validated cookies FIRST, before any navigation (cookie order rule).
  await restoreManagedCookiesBeforeNavigation(context, page, ready.cookies, "/");
  // Inject the VERBATIM validated session JSON (not the narrowed preflight
  // view). supabase-js `_isValidSession` requires access_token AND
  // refresh_token AND expires_at all present; the narrowed shape can drop
  // refresh_token/expires_at/token_type/expires_in, which makes the app
  // discard the stored session and bounce to /auth. Storing the exact value
  // supabase-js itself would have written restores auth faithfully.
  const value =
    typeof rawSessionJson === "string" && rawSessionJson.trim()
      ? rawSessionJson.trim()
      : JSON.stringify(ready.session);
  await page.evaluate(
    ({ key, value: v }) => {
      try {
        window.localStorage.setItem(key, v);
        window.sessionStorage.setItem(key, v);
      } catch {
        /* storage may be locked in some contexts */
      }
    },
    {
      key: ready.storageKey,
      value,
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

// BLOCKED receipt is emitted even when the walk never starts, so
// operators/CI always get exactly one machine-readable proof line.
// Registered as a test (not module-level logging) so it prints exactly
// once in one worker — module scope would repeat per loader/worker.
// Single-project pin: the config matches this spec in more than one
// project; running the proof (and its receipt) once per project would
// duplicate fixture writes and violate the one-receipt-line contract.
// chromium-mocked is the CLEAN-context project (no storageState, no setup
// dependency). chromium-authed must NOT be used here: it preloads
// e2e/.auth/user.json (a different login flow's state) — absent in the
// managed-injection environment (context creation would fail before the
// receipt), and contaminating when present.
const PROOF_PROJECT = "chromium-mocked";

if (preflight.status !== "ready") {
  test("One-Tent proof blocked — emits receipt (no walk, no writes)", () => {
    test.skip(
      test.info().project.name !== PROOF_PROJECT,
      `receipt is emitted once, by the ${PROOF_PROJECT} project`,
    );
    const blockedReceipt = buildBlockedOneTentBrowserProofReceipt(
      preflight.status === "blocked" ? preflight.reason : "unknown",
      preflight.restoreStrategy,
      "blocked",
    );
    console.log("Authenticated One-Tent Loop Playwright Proof: BLOCKED");
    console.log(`Reason: ${preflight.status === "blocked" ? preflight.reason : "unknown"}`);
    console.log("");
    console.log(renderOneTentBrowserProofReceipt(blockedReceipt));
  });
}

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
    test.skip(
      test.info().project.name !== PROOF_PROJECT,
      `authenticated proof runs once, under the ${PROOF_PROJECT} project`,
    );
    // Preflight is READY at describe-time; assert again to narrow the type.
    if (preflight.status !== "ready") throw new Error("unreachable: preflight not ready");
    const ready = preflight;
    const authedDb = newSupabaseTestClient(ready.session);
    const userId = ready.session.user.id;

    // --- Receipt stage tracker (deterministic; no clocks, no IDs) ---
    const stageOutcomes: Partial<Record<OneTentProofStage, StageOutcome>> = {};
    const fences: OneTentProofStagedResult["duplicateFences"] = {};
    let sawPasswordAuth = false;
    let sawPaidModel = false;
    let sawDeviceControl = false;
    let sawServiceRole = false;
    let proofReceiptStatus: "pass" | "blocked" | "fail" = "fail";

    async function stage<T>(name: OneTentProofStage, fn: () => Promise<T>): Promise<T> {
      try {
        const out = await fn();
        stageOutcomes[name] = "pass";
        return out;
      } catch (err) {
        stageOutcomes[name] = "fail";
        throw err;
      }
    }

    page.on("request", (req) => {
      const url = req.url();
      if (/\/auth\/v1\/token\?grant_type=password/.test(url)) sawPasswordAuth = true;
      if (/openai\.com|anthropic\.com|generativelanguage\.googleapis\.com/i.test(url)) {
        sawPaidModel = true;
      }
      if (/mqtt|device-command|actuator/i.test(url)) sawDeviceControl = true;
      const headers = req.headers();
      // A service_role credential never contains the literal string in its
      // encoded form: legacy keys are JWTs (role claim is base64url-encoded)
      // and new-format secret keys use the sb_secret_ prefix. Check both
      // the authorization and apikey headers, decoding JWT role claims.
      for (const headerName of ["authorization", "apikey"]) {
        const value = String(headers[headerName] ?? "");
        if (!value) continue;
        if (/sb_secret_/i.test(value) || /service_role/i.test(value)) {
          sawServiceRole = true;
          continue;
        }
        const token = value.replace(/^Bearer\s+/i, "");
        const segments = token.split(".");
        if (segments.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")) as {
              role?: string;
            };
            if (payload.role === "service_role") sawServiceRole = true;
          } catch {
            /* not a JWT — nothing to decode */
          }
        }
      }
    });

    try {
      await stubAiDoctorNetworkBoundary(page);

      // Stage 1 — Authenticated shell (cookies before navigation).
      await stage("auth_restored", async () => {
        await restoreManagedSession(page, ready, env.sessionJson ?? "");
        await expect(page).not.toHaveURL(/\/auth(\?|$)/);
      });

      // Stage 2 — Grow → Tent → Plant navigation. The clicks are
      // tolerant (flat layouts may not render a grow/tent tile) but MUST
      // be time-bounded: an unbounded click auto-waits to the full test
      // timeout, defeating the tolerance. The DB assertion is what makes
      // the stage meaningful.
      let fixtureGrowId = "";
      await stage("grow_resolved", async () => {
        const { data: growRow } = await authedDb
          .from("grows")
          .select("id")
          .eq("user_id", userId)
          .eq("name", GROW_NAME)
          .maybeSingle();
        expect(growRow?.id, "fixture grow row must exist (run the seed)").toBeTruthy();
        fixtureGrowId = String(growRow!.id);
        await page
          .getByText(GROW_NAME, { exact: false })
          .first()
          .click({ timeout: 2_000 })
          .catch(() => {});
      });
      await stage("tent_resolved", async () => {
        await page
          .getByText(TENT_NAME, { exact: false })
          .first()
          .click({ timeout: 2_000 })
          .catch(() => {});
      });
      await stage("plant_resolved", async () => {
        const plantEntry = page.getByText(PLANT_NAME, { exact: false }).first();
        await expect(plantEntry).toBeVisible();
        await plantEntry.click();
      });

      // Stage 3 — Quick Log
      await stage("quick_log_persisted", async () => {
        const quickLogTextarea = page
          .getByRole("textbox", { name: /note|observation|quick log|log/i })
          .first();
        await quickLogTextarea.fill(QUICK_LOG_NOTE);
        await expect(quickLogTextarea).toHaveValue(QUICK_LOG_NOTE);

        const [quickLogResponse] = await Promise.all([
          page.waitForResponse(
            (r) =>
              /\/rest\/v1\/(grow_events|diary_entries|observation_events)|\/rpc\/quicklog_save/.test(
                r.url(),
              ) && r.request().method() === "POST",
          ),
          page
            .getByRole("button", { name: /save|log|submit/i })
            .first()
            .click(),
        ]);
        expect(quickLogResponse.ok()).toBe(true);

        // Persistence assertion (real row under the authenticated user).
        const { data: quickLogRows } = await authedDb
          .from("grow_events")
          .select("id,user_id,plant_id,note")
          .eq("user_id", userId)
          .ilike("note", `%${QUICK_LOG_NOTE}%`);
        expect((quickLogRows ?? []).length).toBeGreaterThanOrEqual(1);
        fences.quick_log_count = (quickLogRows ?? []).length;
      });

      // Stage 4 — Timeline: appears once, survives refresh
      await stage("timeline_visible", async () => {
        await expect(page.getByText(QUICK_LOG_NOTE, { exact: false })).toHaveCount(1);
        await page.reload();
        await expect(page.getByText(QUICK_LOG_NOTE, { exact: false })).toHaveCount(1);
      });

      // Stage 5 — Sensor provenance
      await stage("manual_provenance_visible", async () => {
        const manualBadge = page.getByText(/^manual$/i).first();
        await expect(manualBadge).toBeVisible();
        // Never rendered as Live for the same snapshot region.
        await expect(page.getByText(/^live$/i)).toHaveCount(0);
        await expect(page.getByText(/82.*°?F|82\s*F/i).first()).toBeVisible();
      });

      // Stage 6 — AI Doctor: cautious, deterministic, at network boundary
      await stage("ai_doctor_boundary_verified", async () => {
        await page
          .getByRole("button", { name: /ai doctor|ask ai|analyze|diagnose/i })
          .first()
          .click();
        await expect(page.getByText(DETERMINISTIC_AI_DOCTOR_RESPONSE.likely_issue)).toBeVisible();
        await expect(page.getByText(/confidence/i)).toBeVisible();
        // Cautious output — no confirmed-diagnosis or device-control language.
        const pageText = (await page.content()).toLowerCase();
        expect(pageText).not.toMatch(
          /definitive diagnosis|guaranteed cure|activate pump|turn on light/,
        );
      });

      // Stage 7 — Alert exists (VPD 1.65 vs target 1.60) — via UI, not by
      // mutating the golden snapshot.
      await stage("alert_verified", async () => {
        const alertEntry = page.getByText(/vpd/i).first();
        await expect(alertEntry).toBeVisible();
        await alertEntry.click({ timeout: 2_000 }).catch(() => {});
        // The row assertion is what verifies the alert — the /vpd/i text
        // alone also matches the snapshot region, so it proves nothing.
        const { data: alertRows } = await authedDb
          .from("alerts")
          .select("id")
          .eq("user_id", userId)
          .eq("grow_id", fixtureGrowId)
          .eq("status", "open");
        expect(
          (alertRows ?? []).length,
          "an open alert must exist on the fixture grow (VPD 1.65 > 1.60)",
        ).toBeGreaterThanOrEqual(1);
        fences.alert_count = (alertRows ?? []).length;
      });

      // Stage 8 — Add to Action Queue (user-initiated)
      let suggestedId = "";
      await stage("action_queue_suggestion_verified", async () => {
        const addToQueue = page
          .getByRole("button", { name: /add to action queue|queue action/i })
          .first();
        await addToQueue.click();
        // Rapid REAL second click must not duplicate (a trial click never
        // dispatches, so it cannot exercise the dedupe). The button may
        // legitimately disappear/disable after the first click — that IS
        // dedupe — so the second click is tolerant and time-bounded.
        await addToQueue.click({ timeout: 2_000 }).catch(() => {});

        // Scoped to the fixture grow so pre-existing suggestions elsewhere
        // can't mask a duplicate; exactly ONE suggested row must exist.
        const { data: queueRowsAfterInsert } = await authedDb
          .from("action_queue")
          .select("id,status,target_device")
          .eq("user_id", userId)
          .eq("grow_id", fixtureGrowId)
          .order("created_at", { ascending: false })
          .limit(5);
        const suggested = (queueRowsAfterInsert ?? []).filter((r) =>
          ["pending_approval", "suggested"].includes(String(r.status)),
        );
        expect(suggested.length, "double-click must not create a duplicate").toBe(1);
        // No executable device command on any suggested item.
        for (const r of suggested) {
          expect(r.target_device ?? null).toBeNull();
        }
        suggestedId = String(suggested[0].id);
        fences.action_queue_count = suggested.length;
      });

      // Stage 9 — Grower approval / completion
      await stage("grower_decision_verified", async () => {
        const approveBtn = page
          .getByRole("button", { name: /approve|complete|mark done/i })
          .first();
        await approveBtn.click();
        const { data: postApproval } = await authedDb
          .from("action_queue")
          .select("id,status")
          .eq("id", suggestedId)
          .single();
        expect(["approved", "completed", "done"]).toContain(String(postApproval?.status));
      });

      // Stage 10 — Follow-up marker survives refresh, no duplicates.
      await stage("follow_up_marker_verified", async () => {
        await page.reload();
        const followUp = page.getByText(/follow[- ]?up/i).first();
        await expect(followUp).toBeVisible();

        // Duplicate fences
        await expect(page.getByText(QUICK_LOG_NOTE, { exact: false })).toHaveCount(1);
        const { data: finalQueueRows } = await authedDb
          .from("action_queue")
          .select("id")
          .eq("user_id", userId)
          .eq("id", suggestedId);
        expect((finalQueueRows ?? []).length).toBe(1);
        const { data: followUpRows } = await authedDb
          .from("diary_entries")
          .select("id")
          .eq("user_id", userId)
          .contains("details", { event_type: "action_followup" });
        fences.follow_up_marker_count = (followUpRows ?? []).length;
      });

      // Network safety
      expect(sawPasswordAuth).toBe(false);
      expect(sawPaidModel).toBe(false);

      // Honest receipt annotation
      testInfo.annotations.push({
        type: "one-tent-loop-golden-path",
        description: "Auto-diary follow-up: HONESTLY UNSUPPORTED. Marker-level follow-up: PASS.",
      });
    } finally {
      // Exactly one machine-readable proof line, pass or fail. Any tripped
      // safety fence forces the receipt out of "pass" (the builder enforces
      // this), so a safety violation can never print PASS or trigger the
      // optional post-pass teardown.
      const safetyViolationReason = sawPasswordAuth
        ? "password_auth_request_observed"
        : sawPaidModel
          ? "paid_ai_request_observed"
          : sawDeviceControl
            ? "device_control_request_observed"
            : sawServiceRole
              ? "service_role_in_browser_observed"
              : null;
      const receipt = buildOneTentBrowserProofReceipt({
        restoreStrategy: ready.restoreStrategy,
        // "completed" is inferable (the marker-named plant can only come
        // from the seed); anything else is reported as not_started because
        // this run did NOT verify the seed either way.
        seedStatus: stageOutcomes.plant_resolved === "pass" ? "completed" : "not_started",
        blockerReason: null,
        safetyViolationReason,
        stages: stageOutcomes,
        duplicateFences: fences,
        safety: {
          paid_ai_request_observed: sawPaidModel,
          device_control_request_observed: sawDeviceControl,
          service_role_in_browser_observed: sawServiceRole,
        },
      });
      console.log(`Authenticated One-Tent Loop Playwright Proof: ${receipt.status.toUpperCase()}`);
      console.log(renderOneTentBrowserProofReceipt(receipt));
      proofReceiptStatus = receipt.status;
    }

    // Optional cleanup — deliberately OUTSIDE the finally (throwing there
    // would swallow the original test error): this line is only reached
    // when the walk threw nothing, and the receipt-status gate keeps it
    // to fully passing proofs. Never after BLOCKED or FAIL; never silent.
    if (
      proofReceiptStatus === "pass" &&
      process.env.LOVABLE_E2E_TEARDOWN_AFTER_SUCCESS === "true"
    ) {
      // Repo-rooted path: the worker's cwd is wherever playwright was
      // invoked from, so a cwd-relative script path would ENOENT.
      const teardownScript = resolve(
        __dirname,
        "..",
        "scripts/e2e/teardown-one-tent-golden-path.mjs",
      );
      try {
        const out = execFileSync(
          process.execPath,
          [teardownScript, "--execute", "--confirm-fixture-teardown"],
          { encoding: "utf8" },
        );
        console.log(out);
      } catch (err) {
        // Surface the child's ONE_TENT_TEARDOWN_JSON receipt before
        // failing — a hidden teardown failure is worse than a loud one.
        const failed = err as { stdout?: string };
        if (failed.stdout) console.log(String(failed.stdout));
        throw err;
      }
    }
  });
});
