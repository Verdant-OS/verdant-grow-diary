/**
 * One-Tent Loop — authenticated UI golden-path browser proof.
 *
 * This spec walks the ACTUAL application from the authenticated shell
 * through Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot
 * → AI Doctor → Alert → approval-required Action Queue suggestion.
 *
 * Safety envelope:
 *  - Runs only when the managed Lovable browser session preflight
 *    reports READY. Never fabricates a login. Never uses
 *    signInWithPassword, signUp, admin.createUser, or hand-forged JWTs.
 *  - Restores VALIDATED managed cookies into the context BEFORE any
 *    navigation, then the Supabase local-storage session, then loads
 *    the app. Malformed cookies fail preflight closed — no partial set
 *    is ever restored.
 *  - Intercepts the AI Doctor Edge Function at the network boundary. The
 *    pricing scarcity request is aborted because that nominal read endpoint
 *    persists request telemetry; the sandbox trust badge itself is not
 *    mocked. React components are never mocked. No paid model endpoint is
 *    ever contacted.
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
import { test, expect, type Page, type Response, type Route } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
import { DETERMINISTIC_AI_DOCTOR_RESPONSE } from "./helpers/oneTentAiDoctorResponse";
import {
  classifyOneTentForbiddenNetworkRequest,
  isOneTentAiDoctorReviewEndpoint,
  type OneTentForbiddenNetworkKind,
} from "./helpers/oneTentNetworkSafety";

const QUICK_LOG_NOTE = "Observed mild leaf-edge curl after a warm afternoon.";
const QUICK_LOG_CONTEXT_DRAFT = "Context check only — close without saving.";
const DEFAULT_FIXTURE_MARKER = "[GOLDEN-PATH-FIXTURE]";
const RUN_FIXTURE_MARKER = /^\[GOLDEN-PATH-FIXTURE-RUN-[0-9]+\]$/;
const TARGET_PROJECT_REF = process.env.LOVABLE_E2E_TARGET_PROJECT_REF?.trim() ?? "";
const declaredFixtureMarker = process.env.E2E_ONE_TENT_FIXTURE_MARKER?.trim();
if (
  declaredFixtureMarker &&
  declaredFixtureMarker !== DEFAULT_FIXTURE_MARKER &&
  !RUN_FIXTURE_MARKER.test(declaredFixtureMarker)
) {
  throw new Error("invalid_one_tent_fixture_marker");
}
const FIXTURE_MARKER = declaredFixtureMarker || DEFAULT_FIXTURE_MARKER;
const GROW_NAME = `One-Tent Golden Run ${FIXTURE_MARKER}`;
const TENT_NAME = `Flower Tent A ${FIXTURE_MARKER}`;
const PLANT_NAME = `Golden Plant 1 ${FIXTURE_MARKER}`;
const SEED_SCRIPT = fileURLToPath(
  new URL("../scripts/e2e/seed-one-tent-golden-path.mjs", import.meta.url),
);
const TEARDOWN_SCRIPT = fileURLToPath(
  new URL("../scripts/e2e/teardown-one-tent-golden-path.mjs", import.meta.url),
);
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=",
  "base64",
);

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

async function installOneTentNetworkBoundary(
  page: Page,
  captureAiDoctorRequest: (body: unknown) => void,
  onForbiddenNetwork: (kind: OneTentForbiddenNetworkKind) => void,
) {
  await page.route("**/*", async (route: Route) => {
    const url = route.request().url();
    if (isOneTentAiDoctorReviewEndpoint(url, TARGET_PROJECT_REF)) {
      let requestBody: unknown = null;
      try {
        requestBody = route.request().postDataJSON();
      } catch {
        // The stage assertion below fails closed when the review request is
        // absent or malformed; never log the packet or its auth headers.
      }
      captureAiDoctorRequest(requestBody);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, result: DETERMINISTIC_AI_DOCTOR_RESPONSE }),
      });
      return;
    }
    const forbidden = classifyOneTentForbiddenNetworkRequest(url);
    if (forbidden) {
      onForbiddenNetwork(forbidden);
      await route.abort("blockedbyclient");
      return;
    }
    if (/\/functions\/v1\/founder-slots-remaining(?:\?|$)/i.test(url)) {
      // Despite its read-shaped response, the function persists request
      // metrics. Abort it so observing Paddle sandbox copy adds no unrelated
      // database write and cannot be mistaken for checkout success.
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
}

const env = readManagedSessionEnv();
const preflight = evaluateManagedSession(env);

test.use({ viewport: { width: 390, height: 844 } });

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
const AUTHENTICATED_PROOF_TIMEOUT_MS = 15 * 60_000;

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

  test("walks Grow → Tent → Plant → Quick Log → Photo → Timeline → Sensor Snapshot → AI Doctor → Alert → approval-required Action Queue → Paddle sandbox", async ({
    page,
  }, testInfo) => {
    test.setTimeout(AUTHENTICATED_PROOF_TIMEOUT_MS);
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
    let aiDoctorRequestEnvelope: unknown = null;
    let evidenceSeedStatus: OneTentProofStagedResult["seedStatus"] = "not_started";
    let proofReceiptStatus: "pass" | "blocked" | "fail" = "fail";
    let proofBlockerReason: string | null = null;

    async function stage<T>(name: OneTentProofStage, fn: () => Promise<T>): Promise<T> {
      try {
        const out = await fn();
        stageOutcomes[name] = "pass";
        return out;
      } catch (err) {
        stageOutcomes[name] = "fail";
        proofBlockerReason ??= `${name}_failed`;
        throw err;
      }
    }

    page.on("request", (req) => {
      const url = req.url();
      if (/\/auth\/v1\/token\?grant_type=password/.test(url)) sawPasswordAuth = true;
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
      // Stage 1 — Authenticated shell (cookies before navigation).
      await stage("auth_restored", async () => {
        await installOneTentNetworkBoundary(
          page,
          (body) => {
            aiDoctorRequestEnvelope = body;
          },
          (kind) => {
            if (kind === "paid_ai") sawPaidModel = true;
            if (kind === "device_control") sawDeviceControl = true;
          },
        );
        await restoreManagedSession(page, ready, env.sessionJson ?? "");
        await expect(page).not.toHaveURL(/\/auth(\?|$)/);
      });

      // Stage 2 — Create the hierarchy through the connected generic dialogs.
      // The exact marker rows must be absent first: this proof is intended
      // to expose creation/handoff defects, not reuse a seeded hierarchy.
      let fixtureGrowId = "";
      let fixtureTentId = "";
      let fixturePlantId = "";
      await stage("hierarchy_created_via_ui", async () => {
        const [growBefore, tentBefore, plantBefore] = await Promise.all([
          authedDb
            .from("grows")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("name", GROW_NAME),
          authedDb
            .from("tents")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("name", TENT_NAME),
          authedDb
            .from("plants")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("name", PLANT_NAME),
        ]);
        expect(growBefore.error).toBeNull();
        expect(tentBefore.error).toBeNull();
        expect(plantBefore.error).toBeNull();
        expect(growBefore.count, "teardown must remove the prior golden grow").toBe(0);
        expect(tentBefore.count, "teardown must remove the prior golden tent").toBe(0);
        expect(plantBefore.count, "teardown must remove the prior golden plant").toBe(0);

        await page.goto("/grows?intent=one_tent_activation");
        await page.getByPlaceholder("Tent #1, Backyard, Mothers…").fill(GROW_NAME);
        await page.getByRole("button", { name: "Create grow" }).click();
        await expect(page).toHaveURL(/\/tents\?growId=[0-9a-f-]+&intent=one_tent_activation$/i);

        await expect(page.getByTestId("create-tent-target-setup")).toContainText(GROW_NAME);
        await page.getByPlaceholder("Tent #1").fill(TENT_NAME);
        await page.getByTestId("tent-create-submit").click();
        await expect(page).toHaveURL(
          /\/plants\?growId=[0-9a-f-]+&tentId=[0-9a-f-]+&intent=one_tent_activation$/i,
        );

        const plantDialog = page.getByRole("dialog", { name: "New plant" });
        await expect(plantDialog.getByTestId("create-plant-form")).toBeVisible();
        await expect(plantDialog.getByTestId("create-plant-target-setup")).toContainText(GROW_NAME);
        await expect(plantDialog.getByTestId("create-plant-tent-select")).toContainText(TENT_NAME);
        await plantDialog.getByTestId("create-plant-name").fill(PLANT_NAME);
        await plantDialog.getByRole("combobox").first().click();
        await page.getByRole("option", { name: "Flowering", exact: true }).click();

        let plantRefreshLatchArmed = true;
        let plantRefreshRequestHeld = 0;
        let plantInsertCompleted = false;
        let releasePlantRefresh = () => {};
        const plantRefreshRelease = new Promise<void>((resolve) => {
          releasePlantRefresh = resolve;
        });
        const observePlantInsert = (response: Response) => {
          const request = response.request();
          const pathname = new URL(response.url()).pathname;
          if (
            request.method() === "POST" &&
            pathname.endsWith("/rest/v1/plants") &&
            response.ok()
          ) {
            plantInsertCompleted = true;
          }
        };
        const holdPlantRefresh = async (route: Route) => {
          const request = route.request();
          if (!plantRefreshLatchArmed || !plantInsertCompleted || request.method() !== "GET") {
            await route.continue();
            return;
          }
          plantRefreshRequestHeld += 1;
          await plantRefreshRelease;
          await route.continue();
        };
        page.on("response", observePlantInsert);
        await page.route("**/rest/v1/plants*", holdPlantRefresh);
        const plantSubmit = plantDialog.getByTestId("plant-create-submit");
        const plantSubmitClick = plantSubmit.click();
        try {
          await expect.poll(() => plantRefreshRequestHeld).toBeGreaterThan(0);
          await expect(plantDialog).toBeVisible();
          await expect(plantSubmit).toBeDisabled();
          await expect(page).toHaveURL(
            /\/plants\?growId=[0-9a-f-]+&tentId=[0-9a-f-]+&intent=one_tent_activation$/i,
          );
        } finally {
          plantRefreshLatchArmed = false;
          releasePlantRefresh();
          await plantSubmitClick;
          await page.unroute("**/rest/v1/plants*", holdPlantRefresh);
          page.off("response", observePlantInsert);
        }
        await expect(page).toHaveURL(/\/dashboard\?growId=[0-9a-f-]+$/i);
      });

      await stage("grow_resolved", async () => {
        const { data: growRow, error } = await authedDb
          .from("grows")
          .select("id,name")
          .eq("user_id", userId)
          .eq("name", GROW_NAME)
          .single();
        expect(error).toBeNull();
        expect(growRow?.name).toBe(GROW_NAME);
        fixtureGrowId = String(growRow?.id ?? "");
        expect(fixtureGrowId).not.toBe("");
      });
      await stage("tent_resolved", async () => {
        const { data: tentRow, error } = await authedDb
          .from("tents")
          .select("id,name,grow_id")
          .eq("user_id", userId)
          .eq("name", TENT_NAME)
          .eq("grow_id", fixtureGrowId)
          .single();
        expect(error).toBeNull();
        expect(tentRow?.grow_id).toBe(fixtureGrowId);
        fixtureTentId = String(tentRow?.id ?? "");
        expect(fixtureTentId).not.toBe("");
      });
      await stage("plant_resolved", async () => {
        const { data: plantRow, error } = await authedDb
          .from("plants")
          .select("id,name,grow_id,tent_id")
          .eq("user_id", userId)
          .eq("name", PLANT_NAME)
          .eq("grow_id", fixtureGrowId)
          .eq("tent_id", fixtureTentId)
          .single();
        expect(error).toBeNull();
        expect(plantRow?.grow_id).toBe(fixtureGrowId);
        expect(plantRow?.tent_id).toBe(fixtureTentId);
        fixturePlantId = String(plantRow?.id ?? "");
        expect(fixturePlantId).not.toBe("");
      });

      // The generic plant dialog must hand the just-created hierarchy to the
      // permanently mounted legacy Quick Log. A typed draft makes Save prove
      // it is enabled by exact context; Escape closes without writing it.
      await stage("quick_log_context_verified", async () => {
        await expect(page).toHaveURL(new RegExp(`/dashboard\\?growId=${fixtureGrowId}$`));
        const dialog = page.getByRole("dialog", { name: /^quick log$/i });
        await expect(dialog).toBeVisible();
        const targetCard = dialog.getByTestId("quick-log-target-card");
        await expect(targetCard).toHaveAttribute("data-target-plant-id", fixturePlantId);
        await expect(targetCard).toHaveAttribute("data-target-tent-id", fixtureTentId);
        await expect(targetCard).toHaveAttribute("data-target-grow-id", fixtureGrowId);
        await expect(dialog.getByTestId("quick-log-target-plant")).toContainText(PLANT_NAME);
        await expect(dialog.getByTestId("quick-log-target-tent")).toContainText(TENT_NAME);
        await expect(dialog.getByTestId("quick-log-target-grow")).toContainText(GROW_NAME);
        await dialog.getByTestId("quicklog-note").fill(QUICK_LOG_CONTEXT_DRAFT);
        await expect(dialog.getByTestId("quick-log-save")).toBeEnabled();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
      });

      await stage("plant_persisted_after_refresh", async () => {
        await page.goto(`/plants?growId=${fixtureGrowId}&tentId=${fixtureTentId}`);
        await expect(page.getByText(PLANT_NAME, { exact: false }).first()).toBeVisible();
        await page.reload();
        await expect(page).toHaveURL(
          new RegExp(`/plants\\?growId=${fixtureGrowId}&tentId=${fixtureTentId}$`),
        );
        await expect(page.getByText(PLANT_NAME, { exact: false }).first()).toBeVisible();
        const { data: persistedPlant, error } = await authedDb
          .from("plants")
          .select("id,grow_id,tent_id")
          .eq("user_id", userId)
          .eq("id", fixturePlantId)
          .eq("grow_id", fixtureGrowId)
          .eq("tent_id", fixtureTentId)
          .single();
        expect(error).toBeNull();
        expect(persistedPlant?.id).toBe(fixturePlantId);
      });

      // The evidence-only seed may add grow targets and manual sensor rows,
      // but fails closed if the browser-created hierarchy is missing or
      // misbound. It cannot rescue a broken creation handoff.
      await stage("photo_and_manual_evidence_persisted", async () => {
        try {
          const seedOutput = execFileSync(process.execPath, [SEED_SCRIPT, "--evidence-only"], {
            encoding: "utf8",
            env: process.env,
          });
          expect(seedOutput).toContain("One-Tent Golden Path seed: OK");
          evidenceSeedStatus = "completed";
        } catch (error) {
          evidenceSeedStatus = "failed";
          throw error;
        }

        const createdPlantCard = page.getByTestId("plant-card").filter({ hasText: PLANT_NAME });
        await expect(createdPlantCard).toHaveCount(1);
        await createdPlantCard.click();
        await expect(page).toHaveURL(new RegExp(`/plants/${fixturePlantId}$`));
        await expect(page.getByRole("heading", { name: PLANT_NAME, exact: true })).toBeVisible();
        await page.getByTestId("plant-detail-quick-log-open").click();
        const plantQuickLog = page.getByTestId("plant-quick-log-sheet");
        await expect(plantQuickLog).toBeVisible();
        await plantQuickLog.getByTestId("plant-quick-log-note").fill(QUICK_LOG_NOTE);
        await plantQuickLog.getByTestId("plant-quick-log-photo-library-input").setInputFiles({
          name: "one-tent-leaf.png",
          mimeType: "image/png",
          buffer: ONE_PIXEL_PNG,
        });
        await expect(plantQuickLog.getByTestId("plant-quick-log-photo-preview")).toBeVisible();
        const tempLabel =
          (await plantQuickLog.locator('label[for="plant-quick-log-temp"]').textContent()) ?? "";
        await plantQuickLog
          .getByTestId("plant-quick-log-temp")
          .fill(tempLabel.includes("°C") ? "27.8" : "82");
        await plantQuickLog.getByTestId("plant-quick-log-humidity").fill("48");
        await expect(plantQuickLog.getByTestId("plant-quick-log-save")).toBeEnabled();
        const [quickLogResponse] = await Promise.all([
          page.waitForResponse(
            (response) =>
              /\/rest\/v1\/rpc\/quicklog_save_manual(?:\?|$)/.test(response.url()) &&
              response.request().method() === "POST",
          ),
          plantQuickLog.getByTestId("plant-quick-log-save").click(),
        ]);
        expect(quickLogResponse.ok()).toBe(true);
        await expect(plantQuickLog).toBeHidden();

        const { data: diaryRows, error: diaryError } = await authedDb
          .from("diary_entries")
          .select("id,grow_id,tent_id,plant_id,note,photo_url,details")
          .eq("user_id", userId)
          .eq("grow_id", fixtureGrowId)
          .eq("tent_id", fixtureTentId)
          .eq("plant_id", fixturePlantId)
          .eq("note", QUICK_LOG_NOTE);
        expect(diaryError).toBeNull();
        expect(diaryRows).toHaveLength(1);
        const diaryRow = diaryRows?.[0];
        expect(diaryRow?.photo_url).toBeTruthy();
        const diaryDetails = (diaryRow?.details ?? {}) as Record<string, unknown>;
        const manualSnapshot = (diaryDetails.manual_sensor_snapshot ?? {}) as Record<
          string,
          unknown
        >;
        expect(manualSnapshot.source).toBe("manual");
        expect(manualSnapshot.temp_f).toBe(82);
        expect(manualSnapshot.humidity_percent).toBe(48);
      });

      await stage("quick_log_persisted", async () => {
        const { data: quickLogRows, error } = await authedDb
          .from("grow_events")
          .select("id,user_id,grow_id,tent_id,plant_id,note,source")
          .eq("user_id", userId)
          .eq("grow_id", fixtureGrowId)
          .eq("tent_id", fixtureTentId)
          .eq("plant_id", fixturePlantId)
          .eq("note", QUICK_LOG_NOTE);
        expect(error).toBeNull();
        expect(quickLogRows).toHaveLength(1);
        fences.quick_log_count = quickLogRows?.length ?? 0;
      });

      // Timeline: exact plant log, photo, and manual snapshot all survive refresh.
      await stage("timeline_visible", async () => {
        await page.getByRole("link", { name: /^open logs$/i }).click();
        let timelineEntry = page.getByTestId("timeline-entry").filter({ hasText: QUICK_LOG_NOTE });
        await expect(timelineEntry).toHaveCount(1);
        await expect(timelineEntry.getByTestId("timeline-photo-open")).toBeVisible();
        await expect(timelineEntry.getByTestId("timeline-manual-snapshot")).toBeVisible();
        await page.reload();
        timelineEntry = page.getByTestId("timeline-entry").filter({ hasText: QUICK_LOG_NOTE });
        await expect(timelineEntry).toHaveCount(1);
        await expect(timelineEntry.getByTestId("timeline-photo-open")).toBeVisible();
        await expect(timelineEntry.getByTestId("timeline-manual-snapshot")).toBeVisible();
        const timelineTentFilter = page.getByTestId("timeline-tent-filter");
        await timelineTentFilter.selectOption(fixtureTentId);
        await expect(timelineTentFilter).toHaveValue(fixtureTentId);
      });

      // Sensor provenance stays scoped to the exact persisted diary event.
      await stage("manual_provenance_visible", async () => {
        const timelineEntry = page
          .getByTestId("timeline-entry")
          .filter({ hasText: QUICK_LOG_NOTE });
        const manualSnapshot = timelineEntry.getByTestId("timeline-manual-snapshot");
        await expect(manualSnapshot).toContainText(/manual snapshot/i);
        await expect(manualSnapshot).toContainText(/82.*°?F|82\s*F/i);
        await expect(manualSnapshot.getByText(/^live$/i)).toHaveCount(0);
      });

      // Walk the canonical Timeline → Sensor Snapshot handoff and prove the
      // seed's manual readings remain source-labeled and linked to the exact
      // browser-created tent and relevant plant.
      await stage("sensor_snapshot_verified", async () => {
        await page.getByTestId("timeline-one-tent-loop-next-step-card-cta").click();
        await expect(page).toHaveURL(/\/sensors(?:\?|$)/);
        const sensorsUrl = new URL(page.url());
        expect(sensorsUrl.searchParams.get("tentId")).toBe(fixtureTentId);
        await expect(page.getByRole("button", { name: TENT_NAME, exact: true })).toHaveClass(
          /bg-primary/,
        );
        const sourceBadge = page
          .getByTestId("grow-data-source-badge")
          .filter({ hasText: /^manual$/i })
          .first();
        await expect(sourceBadge).toBeVisible();
        await expect(sourceBadge).toHaveAttribute("data-label", "Manual");

        const { data: sensorRows, error: sensorError } = await authedDb
          .from("sensor_readings")
          .select("metric,value,source,tent_id,captured_at,raw_payload")
          .eq("user_id", userId)
          .eq("tent_id", fixtureTentId)
          .eq("source", "manual")
          .contains("raw_payload", {
            golden_marker: "golden-path-manual-snapshot",
            plant_id: fixturePlantId,
          });
        expect(sensorError).toBeNull();
        expect(sensorRows).toHaveLength(3);
        expect((sensorRows ?? []).map((row) => row.metric).sort()).toEqual([
          "humidity_pct",
          "temperature_c",
          "vpd_kpa",
        ]);
        const sensorValuesByMetric = Object.fromEntries(
          (sensorRows ?? []).map((row) => [row.metric, Number(row.value)]),
        );
        expect(sensorValuesByMetric).toEqual({
          temperature_c: 27.78,
          humidity_pct: 48,
          vpd_kpa: 1.65,
        });
        expect(new Set((sensorRows ?? []).map((row) => row.captured_at)).size).toBe(1);
        for (const row of sensorRows ?? []) {
          expect(row.source).toBe("manual");
          expect(row.tent_id).toBe(fixtureTentId);
          const raw = (row.raw_payload ?? {}) as Record<string, unknown>;
          expect(raw.plant_id).toBe(fixturePlantId);
        }

        await page.getByTestId("sensors-one-tent-loop-next-step-card-cta").click();
        await expect(page).toHaveURL(/\/doctor(?:\?|$)/);
        await expect(page.getByTestId("ai-doctor-start")).toBeVisible();
      });

      // AI Doctor is initiated only by the grower on the real plant-scoped
      // review surface. The network boundary returns the current credited
      // envelope, then the UI must render the validated cautious contract.
      await stage("ai_doctor_boundary_verified", async () => {
        const doctorEntry = page.getByRole("link", {
          name: `Review ${PLANT_NAME} with AI Doctor`,
        });
        await expect(doctorEntry).toBeVisible();
        await doctorEntry.click();
        await expect(page).toHaveURL(
          new RegExp(`/plants/${fixturePlantId}\\?tentId=${fixtureTentId}#plant-ai-doctor-review$`),
        );
        const review = page.getByTestId("plant-ai-doctor-live-review");
        await expect(review).toBeVisible();
        const importedContinue = review.getByTestId("plant-ai-doctor-imported-history-continue");
        if (await importedContinue.isVisible()) await importedContinue.click();
        const rootZoneContinue = review.getByTestId("plant-ai-doctor-root-zone-history-continue");
        if (await rootZoneContinue.isVisible()) await rootZoneContinue.click();

        const startReview = review.getByTestId("plant-ai-doctor-live-review-start");
        await expect(startReview).toBeEnabled();
        await startReview.click();
        await expect(review.getByTestId("plant-ai-doctor-live-review-result-wrap")).toBeVisible();
        await expect(review.getByTestId("plant-ai-doctor-history-saved")).toBeVisible();

        const requestEnvelope = aiDoctorRequestEnvelope as {
          grow_id?: unknown;
          packet?: {
            plant?: { stage?: unknown };
            recentRootZoneObservations?: unknown[];
            recentSensorSnapshot?: {
              readings?: Array<{ field?: unknown; value?: unknown; unit?: unknown }>;
            } | null;
            recentSensorSnapshotAnnotation?: {
              source?: unknown;
              trust?: unknown;
              includesValues?: unknown;
              stale?: unknown;
            } | null;
            missingLiveSensorReadings?: unknown;
          };
        };
        expect(requestEnvelope.grow_id).toBe(fixtureGrowId);
        const packet = requestEnvelope.packet ?? {};
        expect(packet.plant?.stage).toBe("flower");
        const annotation = packet.recentSensorSnapshotAnnotation ?? {};
        expect(annotation.source).toBe("manual");
        expect(annotation.trust).toBe("medium");
        expect(annotation.includesValues).toBe(true);
        expect(annotation.stale).toBe(false);
        expect(packet.missingLiveSensorReadings).toBe(true);
        expect(packet.recentRootZoneObservations ?? []).toHaveLength(0);
        const requestReadings = packet.recentSensorSnapshot?.readings ?? [];
        expect(requestReadings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: "temperature_c", value: 27.78 }),
            expect.objectContaining({ field: "humidity_pct", value: 48 }),
            expect.objectContaining({ field: "vpd_kpa", value: 1.65 }),
          ]),
        );
        await expect(
          review.getByTestId("plant-detail-live-ai-doctor-review-result-likely-issue"),
        ).toContainText(DETERMINISTIC_AI_DOCTOR_RESPONSE.likely_issue);
        const evidencePanel = review.getByTestId(
          "plant-detail-live-ai-doctor-review-result-evidence",
        );
        const missingPanel = review.getByTestId(
          "plant-detail-live-ai-doctor-review-result-missing",
        );
        for (const evidence of DETERMINISTIC_AI_DOCTOR_RESPONSE.evidence) {
          await expect(evidencePanel).toContainText(evidence);
        }
        for (const missing of DETERMINISTIC_AI_DOCTOR_RESPONSE.missing_information) {
          await expect(missingPanel).toContainText(missing);
        }
        await expect(
          review.getByTestId("plant-detail-live-ai-doctor-review-result-what-not-to-do"),
        ).toContainText(DETERMINISTIC_AI_DOCTOR_RESPONSE.what_not_to_do);
        const reviewText = (await review.textContent())?.toLowerCase() ?? "";
        expect(reviewText).not.toMatch(
          /definitive diagnosis|guaranteed cure|activate pump|turn on light/,
        );

        await page.goto("/doctor/sessions");
        await expect(page.getByTestId("ai-doctor-sessions-index-page")).toBeVisible();
        await page.getByTestId("ai-doctor-one-tent-loop-next-step-card-cta").click();
        await expect(page).toHaveURL(/\/alerts(?:\?|$)/);
      });

      // Alert persistence is intentionally tent-scoped. The source hook does
      // not pass a plant id, so the proof must reject invented attribution.
      let alertId = "";
      await stage("alert_verified", async () => {
        await expect(page.getByTestId("alerts-one-tent-loop-approval-note")).toBeVisible();
        await expect
          .poll(async () => {
            const { data, error } = await authedDb
              .from("alerts")
              .select("id")
              .eq("user_id", userId)
              .eq("grow_id", fixtureGrowId)
              .eq("tent_id", fixtureTentId)
              .is("plant_id", null)
              .eq("source", "environment_alerts")
              .eq("metric", "vpd")
              .eq("status", "open");
            if (error) throw error;
            return data?.length ?? 0;
          })
          .toBe(1);

        const { data: alertRows, error: alertError } = await authedDb
          .from("alerts")
          .select("id,grow_id,tent_id,plant_id,status,source,metric")
          .eq("user_id", userId)
          .eq("grow_id", fixtureGrowId)
          .eq("tent_id", fixtureTentId)
          .is("plant_id", null)
          .eq("source", "environment_alerts")
          .eq("metric", "vpd")
          .eq("status", "open");
        expect(alertError).toBeNull();
        expect(alertRows).toHaveLength(1);
        const alertRow = alertRows?.[0];
        expect(
          alertRow?.plant_id ?? null,
          "tent-scoped alert must not invent plant attribution",
        ).toBeNull();
        expect(alertRow?.grow_id).toBe(fixtureGrowId);
        expect(alertRow?.tent_id).toBe(fixtureTentId);
        alertId = String(alertRow?.id ?? "");
        expect(alertId).not.toBe("");
        fences.alert_count = alertRows?.length ?? 0;

        await page.reload();
        await page.locator(`a[href="/alerts/${alertId}"]`).click();
        await expect(page.getByTestId("alert-handoff-region")).toContainText(
          "Nothing is executed automatically",
        );
      });

      // Creating the advisory row is a separate, explicit grower click. The
      // alert handoff preserves null plant scope, pending approval, and no
      // executable target_device.
      let suggestedId = "";
      await stage("action_queue_suggestion_verified", async () => {
        const addToQueue = page.getByTestId("alert-handoff-add-button");
        await expect(addToQueue).toBeEnabled();
        await addToQueue.click();
        await expect(page.getByTestId("alert-handoff-already-queued-link")).toBeVisible();

        const { data: queueRowsAfterInsert, error: queueError } = await authedDb
          .from("action_queue")
          .select("id,status,target_device,grow_id,tent_id,plant_id,source,reason")
          .eq("user_id", userId)
          .eq("grow_id", fixtureGrowId);
        expect(queueError).toBeNull();
        expect(queueRowsAfterInsert).toHaveLength(1);
        const suggestion = queueRowsAfterInsert?.[0];
        expect(suggestion?.status).toBe("pending_approval");
        expect(suggestion?.reason).toContain(`[alert:${alertId}]`);
        expect(suggestion?.target_device ?? null).toBeNull();
        expect(suggestion?.grow_id).toBe(fixtureGrowId);
        expect(suggestion?.tent_id).toBe(fixtureTentId);
        expect(
          suggestion?.plant_id ?? null,
          "tent-scoped action must preserve null plant attribution",
        ).toBeNull();
        expect(suggestion?.source).toBe("environment_alert");
        suggestedId = String(suggestion?.id ?? "");
        expect(suggestedId).not.toBe("");
        fences.action_queue_count = queueRowsAfterInsert?.length ?? 0;

        await page.getByTestId("alert-handoff-already-queued-link").click();
        await expect(page).toHaveURL(new RegExp(`/actions/${suggestedId}(?:\\?|$)`));
      });

      // The loop ends at an approval-required suggestion. Prove the grower
      // can review the control, but do not click it and do not transition or
      // complete the row. No device action or completion diary entry is made.
      await stage("approval_boundary_verified", async () => {
        await expect(page.getByLabel("Current status: Pending review")).toBeVisible();
        const approveButton = page.getByTestId("action-detail-approve");
        await expect(approveButton).toBeVisible();
        await expect(approveButton).toBeEnabled();

        const { data: pendingRow, error: pendingError } = await authedDb
          .from("action_queue")
          .select("id,status,target_device,grow_id,tent_id,plant_id")
          .eq("user_id", userId)
          .eq("id", suggestedId)
          .single();
        expect(pendingError).toBeNull();
        expect(pendingRow?.status).toBe("pending_approval");
        expect(pendingRow?.target_device ?? null).toBeNull();
        expect(pendingRow?.grow_id).toBe(fixtureGrowId);
        expect(pendingRow?.tent_id).toBe(fixtureTentId);
        expect(pendingRow?.plant_id ?? null).toBeNull();

        const { data: followUpRows, error: followUpError } = await authedDb
          .from("diary_entries")
          .select("id")
          .eq("user_id", userId)
          .contains("details", {
            event_type: "action_followup",
            action_queue_id: suggestedId,
          });
        expect(followUpError).toBeNull();
        expect(followUpRows).toHaveLength(0);
      });

      // Paddle is observed only. No plan CTA is clicked and the scarcity
      // function is already blocked above to avoid its telemetry write.
      await stage("paddle_sandbox_verified", async () => {
        await page.goto("/pricing");
        const checkoutTrust = page.getByTestId("pricing-checkout-trust");
        await expect(checkoutTrust).toHaveAttribute("data-checkout-state", "sandbox");
        await expect(checkoutTrust).toContainText(/sandbox|test/i);
      });

      // Network safety
      expect(sawPasswordAuth).toBe(false);
      expect(sawPaidModel).toBe(false);
      expect(sawDeviceControl).toBe(false);
      expect(sawServiceRole).toBe(false);

      // Honest receipt annotation
      testInfo.annotations.push({
        type: "one-tent-loop-golden-path",
        description:
          "Pending approval suggestion verified; approval control observed but not clicked; no device command sent.",
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
        // Record the evidence seed at its real boundary. A later photo, Quick
        // Log, or UI assertion failure must not rewrite a completed seed as
        // "not_started" in the evidence receipt.
        seedStatus: evidenceSeedStatus,
        blockerReason: proofBlockerReason,
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
      try {
        const out = execFileSync(
          process.execPath,
          [TEARDOWN_SCRIPT, "--execute", "--confirm-fixture-teardown"],
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
