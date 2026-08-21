/**
 * Authenticated One-Tent browser proof — objective coverage contract.
 *
 * Critical runtime values are imported and asserted as executable data.
 * @source-scan-justified The remaining source checks are narrowly scoped
 * static wiring/selector fences because importing the Playwright spec would
 * register and execute tests. They do not replace the authenticated run; they
 * prevent it from silently omitting the production handoffs it exists to prove.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as browserProofContract from "../../e2e/helpers/oneTentBrowserProofReceipt";
import { stripSourceComments } from "./utils/stripSourceComments";
import { parseOneTentFixtureMarker } from "../../scripts/e2e/one-tent-golden-path-fixture-cleanup.mjs";

const ROOT = resolve(__dirname, "../..");
const SPEC = readFileSync(resolve(ROOT, "e2e/one-tent-loop-golden-path-ui.spec.ts"), "utf8");
const EXECUTABLE_SPEC = stripSourceComments(SPEC);
const AI_RESPONSE = readFileSync(resolve(ROOT, "e2e/helpers/oneTentAiDoctorResponse.ts"), "utf8");
const SEED = readFileSync(resolve(ROOT, "scripts/e2e/seed-one-tent-golden-path.mjs"), "utf8");

type RuntimeContract = {
  viewport: { width: number; height: number };
  proofTimeoutMs: number;
  childProcess: { timeoutMs: number; killSignal: string; maxBufferBytes: number };
};

const runtimeContract = (
  browserProofContract as typeof browserProofContract & {
    ONE_TENT_PROOF_RUNTIME_CONTRACT?: RuntimeContract;
  }
).ONE_TENT_PROOF_RUNTIME_CONTRACT;
const assertRuntimeContract = (
  browserProofContract as typeof browserProofContract & {
    assertOneTentProofRuntimeContract?: (contract: RuntimeContract) => RuntimeContract;
  }
).assertOneTentProofRuntimeContract;

describe("authenticated One-Tent proof covers the production objective", () => {
  it("resolves the critical viewport, proof timeout, and child-process bounds from executable data", () => {
    expect(runtimeContract).toEqual({
      viewport: { width: 390, height: 844 },
      proofTimeoutMs: 15 * 60_000,
      childProcess: {
        timeoutMs: 60_000,
        killSignal: "SIGKILL",
        maxBufferBytes: 64 * 1024,
      },
    });
    expect(assertRuntimeContract).toBeTypeOf("function");
    expect(() =>
      assertRuntimeContract?.({
        ...runtimeContract!,
        proofTimeoutMs: 60_000,
      }),
    ).toThrow("one_tent_proof_runtime_contract_invalid");
  });

  it("uses a comment-stripped static wiring fence for the imported runtime contract", () => {
    expect(EXECUTABLE_SPEC).toMatch(
      /test\.use\(\{\s*viewport:\s*ONE_TENT_PROOF_RUNTIME_CONTRACT\.viewport,\s*isMobile:\s*true,\s*hasTouch:\s*true,\s*\}\);/,
    );
    expect(EXECUTABLE_SPEC).toContain(
      "test.setTimeout(ONE_TENT_PROOF_RUNTIME_CONTRACT.proofTimeoutMs)",
    );

    const adversarialDecoy = [
      "// const AUTHENTICATED_PROOF_TIMEOUT_MS = 15 * 60_000;",
      "// test.setTimeout(AUTHENTICATED_PROOF_TIMEOUT_MS);",
    ].join("\n");
    expect(adversarialDecoy).toContain("test.setTimeout(AUTHENTICATED_PROOF_TIMEOUT_MS)");
    expect(stripSourceComments(adversarialDecoy)).not.toContain("test.setTimeout");
  });

  it("resolves child CLIs with ESM-safe module URLs", () => {
    expect(SPEC).toMatch(
      /fileURLToPath\(\s*new URL\("\.\.\/scripts\/e2e\/seed-one-tent-golden-path\.mjs",\s*import\.meta\.url\)/,
    );
    expect(SPEC).toMatch(
      /fileURLToPath\(\s*new URL\("\.\.\/scripts\/e2e\/teardown-one-tent-golden-path\.mjs",\s*import\.meta\.url\)/,
    );
    expect(SPEC).not.toContain("__dirname");
  });

  it("statically wires both child CLIs to the resolved process bounds", () => {
    const seedStart = SPEC.indexOf(
      "execFileSync(process.execPath",
      SPEC.indexOf('"operator_sensor_evidence_seeded"'),
    );
    const seedEnd = SPEC.indexOf("expect(seedOutput)", seedStart);
    const teardownStart = SPEC.indexOf(
      "execFileSync(",
      SPEC.indexOf("process.env.LOVABLE_E2E_TEARDOWN_AFTER_SUCCESS"),
    );
    const teardownEnd = SPEC.indexOf("const lines = out", teardownStart);
    const seedCall = SPEC.slice(seedStart, seedEnd);
    const teardownCall = SPEC.slice(teardownStart, teardownEnd);

    for (const call of [seedCall, teardownCall]) {
      const executableCall = stripSourceComments(call);
      expect(executableCall).toContain(
        "timeout: ONE_TENT_PROOF_RUNTIME_CONTRACT.childProcess.timeoutMs",
      );
      expect(executableCall).toContain(
        "killSignal: ONE_TENT_PROOF_RUNTIME_CONTRACT.childProcess.killSignal",
      );
      expect(executableCall).toContain(
        "maxBuffer: ONE_TENT_PROOF_RUNTIME_CONTRACT.childProcess.maxBufferBytes",
      );
    }
  });

  it("shares a validated per-run fixture marker between the UI walk and evidence helper", () => {
    expect(SPEC).toContain("process.env.E2E_ONE_TENT_FIXTURE_MARKER");
    expect(SEED).toContain("process.env.E2E_ONE_TENT_FIXTURE_MARKER");
    expect(SPEC).toContain("GOLDEN-PATH-FIXTURE-RUN-");
    expect(SPEC).toContain("-ATTEMPT-");
    expect(SEED).toContain("parseOneTentFixtureMarker");
    expect(parseOneTentFixtureMarker("[GOLDEN-PATH-FIXTURE-RUN-123456-ATTEMPT-1]")).toBe(
      "[GOLDEN-PATH-FIXTURE-RUN-123456-ATTEMPT-1]",
    );
  });

  it("proves the served public build is the exact expected deployment SHA", () => {
    expect(SPEC).toContain("process.env.E2E_EXPECTED_SHA");
    expect(SPEC).toContain("process.env.E2E_EXPECTED_TREE_HASH");
    expect(SPEC).toContain("/version.json");
    expect(SPEC).toContain('await stage("deployment_sha_verified"');
    expect(SPEC).toContain("evaluatePublicDeploymentIdentity");
    expect(SPEC).toContain("expect(deploymentIdentity).toEqual({ ok: true })");
  });

  it("creates Grow, Tent, and Plant through the connected generic dialogs", () => {
    expect(SPEC).toContain("/grows?intent=one_tent_activation");
    expect(SPEC).toContain('getByRole("button", { name: "Create grow" })');
    for (const testId of [
      "create-tent-target-setup",
      "tent-create-submit",
      "create-plant-form",
      "create-plant-target-setup",
      "create-plant-tent-select",
      "create-plant-name",
      "plant-create-submit",
    ]) {
      expect(SPEC).toContain(testId);
    }
    expect(SPEC).toContain('getByRole("dialog", { name: "New plant" })');
    expect(SPEC).toContain('getByRole("combobox").first().click()');
    expect(SPEC).toContain('getByRole("option", { name: "Flowering", exact: true }).click()');
    expect(SPEC).not.toContain('selectOption({ label: "Flowering" })');
    expect(SPEC).not.toContain("/start-room");
    expect(SPEC).not.toContain("start-room-");
    expect(SPEC).not.toContain("fixture grow row must exist (run the seed)");
    expect(SPEC).toContain('"--evidence-only"');
    expect(SEED).toContain('const EVIDENCE_ONLY_FLAG = "--evidence-only"');
    expect(SEED).toContain('blocked("golden_grow_missing")');
    expect(SEED).toContain('blocked("golden_tent_missing")');
    expect(SEED).toContain('blocked("golden_plant_missing")');
  });

  it("requires an explicit matching target project before the evidence seed can write", () => {
    expect(SEED).toContain('if (!targetRef) blocked("missing_target_project_ref")');
    expect(SEED).toContain("resolveExactSupabaseProjectOrigin");
    expect(SEED).not.toContain("host.startsWith(`${targetRef}.`)");
    expect(SEED).toMatch(/blocked\(\s*"target_project_mismatch"/);
  });

  it("fails the evidence seed when the alert-driving grow target cannot be reconciled", () => {
    const targetBlock = SEED.slice(
      SEED.indexOf("// ---------- Grow targets ----------"),
      SEED.indexOf("// ---------- Manual sensor snapshot ----------"),
    );
    expect(SEED).toContain('throw new Error("grow_target_lookup_failed")');
    expect(SEED).toContain('throw new Error("grow_target_update_failed")');
    expect(SEED).toContain('throw new Error("grow_target_insert_failed")');
    expect(SEED).not.toContain("Grow target: skipped");
    expect(targetBlock).toContain('.eq("grow_id", grow.id)');
    expect(targetBlock).toContain("temp_max:");
    expect(targetBlock).toContain("rh_min:");
    expect(targetBlock).toContain("rh_max:");
    expect(targetBlock).toContain("vpd_max:");
    expect(targetBlock).not.toMatch(/\btent_id:|\.eq\("tent_id"/);
    expect(targetBlock).not.toMatch(/vpd_kpa_max|air_temp_f_max|humidity_pct_(?:min|max)/);
  });

  it("proves exact hierarchy binding, immediate appearance, and refresh persistence", () => {
    expect(SPEC).toContain("hierarchy_created_via_ui");
    expect(SPEC).toContain("plant_persisted_after_refresh");
    expect(SPEC).toMatch(/\.eq\("grow_id",\s*fixtureGrowId\)/);
    expect(SPEC).toMatch(/\.eq\("tent_id",\s*fixtureTentId\)/);
    expect(SPEC).toMatch(/\.eq\("id",\s*fixturePlantId\)/);
    expect(SPEC).toContain("await page.reload()");
    const persistenceStage = SPEC.slice(
      SPEC.indexOf('await stage("plant_persisted_after_refresh"'),
      SPEC.indexOf('await stage("photo_and_manual_evidence_persisted"'),
    );
    expect(persistenceStage.indexOf("getByText(PLANT_NAME")).toBeLessThan(
      persistenceStage.indexOf("await page.reload()"),
    );
  });

  it("holds the real post-insert plants refresh before closing or handing off", () => {
    const hierarchyStage = SPEC.slice(
      SPEC.indexOf('await stage("hierarchy_created_via_ui"'),
      SPEC.indexOf('await stage("grow_resolved"'),
    );
    for (const token of [
      'page.route("**/rest/v1/plants*"',
      'request.method() !== "GET"',
      "let plantInsertCompleted = false",
      'request.method() === "POST"',
      'pathname.endsWith("/rest/v1/plants")',
      'page.on("response", observePlantInsert)',
      'page.off("response", observePlantInsert)',
      "plantRefreshRequestHeld += 1",
      "await route.continue()",
      "await expect(plantDialog).toBeVisible()",
      "await expect(plantSubmit).toBeDisabled()",
      "const plantSubmitClick = plantSubmit.click()",
      "await plantSubmitClick",
      "releasePlantRefresh()",
    ]) {
      expect(hierarchyStage).toContain(token);
    }
    expect(hierarchyStage).not.toContain("route.fulfill");
    expect(hierarchyStage).not.toContain("await plantSubmit.click()");
    expect(hierarchyStage.indexOf("plantRefreshRequestHeld += 1")).toBeLessThan(
      hierarchyStage.indexOf("releasePlantRefresh()"),
    );
    expect(hierarchyStage.indexOf("releasePlantRefresh()")).toBeLessThan(
      hierarchyStage.indexOf("/dashboard"),
    );
  });

  it("proves Quick Log inherited the exact plant, tent, and grow before save", () => {
    expect(SPEC).toContain("quick_log_context_verified");
    expect(SPEC).toContain("quick-log-target-plant");
    expect(SPEC).toContain("quick-log-target-tent");
    expect(SPEC).toContain("quick-log-target-grow");
    expect(SPEC).toContain("plant-detail-quick-log-open");
    expect(SPEC).toContain("plant-quick-log-save");
    const authStage = SPEC.slice(
      SPEC.indexOf('await stage("auth_restored"'),
      SPEC.indexOf('await stage("hierarchy_created_via_ui"'),
    );
    expect(authStage).toContain("installOneTentNetworkBoundary");
    const contextStage = SPEC.slice(
      SPEC.indexOf('await stage("quick_log_context_verified"'),
      SPEC.indexOf('await stage("plant_persisted_after_refresh"'),
    );
    expect(contextStage).not.toContain("start-room-finish");
    expect(contextStage).toContain("new RegExp(`/dashboard");
    expect(contextStage).toContain("growId=${fixtureGrowId}$`));");
  });

  it("attaches a real browser photo and manual readings to the exact diary row", () => {
    expect(SPEC).toContain("photo_and_manual_evidence_persisted");
    expect(SPEC).toContain("plant-quick-log-photo-library-input");
    expect(SPEC).toContain("plant-quick-log-photo-preview");
    expect(SPEC).toContain("plant-quick-log-temp");
    expect(SPEC).toContain("plant-quick-log-humidity");
    expect(SPEC).toContain("photo_url");
    expect(SPEC).toContain("timeline-photo-open");
    expect(SPEC).toContain("timeline-manual-snapshot");
    const evidenceStage = SPEC.slice(
      SPEC.indexOf('await stage("photo_and_manual_evidence_persisted"'),
      SPEC.indexOf('await stage("timeline_visible"'),
    );
    expect(evidenceStage).toContain('getByTestId("plant-card").filter({ hasText: PLANT_NAME })');
    expect(evidenceStage).toContain("new RegExp(`/plants/${fixturePlantId}$`)");
    expect(evidenceStage.indexOf("await createdPlantCard.click()")).toBeLessThan(
      evidenceStage.indexOf('getByTestId("plant-detail-quick-log-open")'),
    );
    expect(SPEC).toContain('let evidenceSeedStatus: OneTentProofStagedResult["seedStatus"]');
    expect(SPEC).toContain('evidenceSeedStatus = "completed"');
    expect(SPEC).toContain('evidenceSeedStatus = "failed"');
    expect(SPEC).toContain("seedStatus: evidenceSeedStatus");
  });

  it("proves Quick Log manual Tent truth before operator sensor evidence is seeded", () => {
    const quickLogSave = SPEC.indexOf('await stage("quick_log_persisted"');
    const zeroSensorFence = SPEC.indexOf("expect(preSeedSensorRows).toHaveLength(0)");
    const manualTentStage = SPEC.indexOf('await stage("quick_log_manual_tent_snapshot_verified"');
    const tentsVisit = SPEC.indexOf("page.goto(`/tents?growId=${fixtureGrowId}`)", manualTentStage);
    const operatorSeed = SPEC.indexOf('await stage("operator_sensor_evidence_seeded"');
    const seedExecution = SPEC.indexOf("execFileSync(process.execPath", operatorSeed);
    const timeline = SPEC.indexOf('await stage("timeline_visible"');

    expect(quickLogSave).toBeGreaterThan(0);
    expect(zeroSensorFence).toBeGreaterThan(quickLogSave);
    expect(manualTentStage).toBeGreaterThan(zeroSensorFence);
    expect(tentsVisit).toBeGreaterThan(manualTentStage);
    expect(operatorSeed).toBeGreaterThan(tentsVisit);
    expect(seedExecution).toBeGreaterThan(operatorSeed);
    expect(timeline).toBeGreaterThan(seedExecution);

    for (const token of [
      "tents-list-sensor-source-${fixtureTentId}",
      "tents-list-metric-${fixtureTentId}-temp",
      "tents-list-metric-${fixtureTentId}-rh",
      "tents-list-metric-${fixtureTentId}-vpd",
      '"Manual"',
      "/82(?:\\.0)?\\s*°?F/i",
      "/48(?:\\.0)?\\s*%/",
      '"—"',
    ]) {
      expect(SPEC).toContain(token);
    }
    expect(SPEC).toContain("No sensor data yet");
    expect(SPEC).toContain("expect(tentCard).not.toContainText(/Live/i)");
  });

  it("requires AI Doctor to expose actual evidence, uncertainty, and missing context", () => {
    expect(SPEC).toContain("DETERMINISTIC_AI_DOCTOR_RESPONSE.evidence");
    expect(SPEC).toContain("DETERMINISTIC_AI_DOCTOR_RESPONSE.missing_information");
    expect(SPEC).toContain("DETERMINISTIC_AI_DOCTOR_RESPONSE.what_not_to_do");
    expect(AI_RESPONSE).toContain("twenty_four_hour_follow_up");
    expect(AI_RESPONSE).toContain("three_day_recovery_plan");
    expect(SPEC).toMatch(
      /body:\s*JSON\.stringify\(\{\s*ok:\s*true,\s*result:\s*DETERMINISTIC_AI_DOCTOR_RESPONSE\s*\}\)/s,
    );
    expect(SPEC).toContain("plant-ai-doctor-live-review-start");
    expect(SPEC).toContain("plant-detail-live-ai-doctor-review-result-evidence");
    expect(SPEC).toContain("plant-detail-live-ai-doctor-review-result-missing");
  });

  it("grounds the deterministic AI response in the captured request packet", () => {
    expect(SPEC).toContain("route.request().postDataJSON()");
    expect(SPEC).toContain("let aiDoctorRequestEnvelope: unknown = null");
    expect(SPEC).toContain("expect(requestEnvelope.grow_id).toBe(fixtureGrowId)");
    expect(SPEC).toContain('expect(packet.plant?.stage).toBe("flower")');
    expect(SPEC).toContain('expect(annotation.source).toBe("manual")');
    expect(SPEC).toContain('expect(annotation.trust).toBe("medium")');
    expect(SPEC).toContain("expect(annotation.includesValues).toBe(true)");
    expect(SPEC).toContain("expect(packet.missingLiveSensorReadings).toBe(true)");
    expect(AI_RESPONSE).toContain("Manual sensor snapshot included temperature and 48% RH");
    expect(AI_RESPONSE).toContain("No fresh device sensor reading was available");
    expect(SPEC).not.toContain("Grower observation: mild leaf-edge curl");
    expect(SPEC).not.toContain("Grow target: vpd_kpa_max");
  });

  it("walks the canonical Timeline to Sensors to AI Doctor to Alerts handoffs", () => {
    expect(SPEC).toContain("sensor_snapshot_verified");
    expect(SPEC).toContain("timeline-one-tent-loop-next-step-card-cta");
    expect(SPEC).toContain("sensors-one-tent-loop-next-step-card-cta");
    expect(SPEC).toContain("ai-doctor-one-tent-loop-next-step-card-cta");
    expect(SPEC).toContain("grow-data-source-badge");
    expect(SPEC).toContain("golden-path-manual-snapshot");
    const timelineStage = SPEC.slice(
      SPEC.indexOf('await stage("timeline_visible"'),
      SPEC.indexOf('await stage("manual_provenance_visible"'),
    );
    expect(timelineStage).toContain('getByRole("link", { name: /^open logs$/i }).click()');
    expect(timelineStage).toContain('getByTestId("timeline-tent-filter")');
    expect(timelineStage).toContain("timelineTentFilter.selectOption(fixtureTentId)");
    expect(timelineStage).toContain("toHaveValue(fixtureTentId)");
    const sensorStage = SPEC.slice(
      SPEC.indexOf('await stage("sensor_snapshot_verified"'),
      SPEC.indexOf('await stage("ai_doctor_boundary_verified"'),
    );
    expect(sensorStage).toContain('searchParams.get("tentId")');
    expect(sensorStage).toContain("fixtureTentId");
    expect(sensorStage).toContain("toHaveClass(");
    expect(sensorStage).toContain("/bg-primary/");
  });

  it("aborts all paid-model, device, service-role, approval, and checkout requests", () => {
    expect(SPEC).toContain("classifyOneTentForbiddenNetworkRequest");
    expect(SPEC).toContain('page.route("**/*"');
    expect(SPEC).toContain("onForbiddenNetwork");
    expect(SPEC).toContain("hasOneTentServiceRoleCredential");
    expect(SPEC).toContain('route.abort("blockedbyclient")');
    expect(SPEC).not.toMatch(/page\.route\(\/openai/);

    const routeBoundary = SPEC.slice(
      SPEC.indexOf('await page.route("**/*"'),
      SPEC.indexOf("const env = readManagedSessionEnv()"),
    );
    expect(routeBoundary.indexOf("isOneTentAiDoctorReviewEndpoint")).toBeGreaterThan(0);
    expect(routeBoundary.indexOf("classifyOneTentForbiddenNetworkRequest")).toBeGreaterThan(
      routeBoundary.indexOf("isOneTentAiDoctorReviewEndpoint"),
    );
  });

  it("distinguishes the AI Doctor plant picker from saved review history", () => {
    const sensorStage = SPEC.slice(
      SPEC.indexOf('await stage("sensor_snapshot_verified"'),
      SPEC.indexOf('await stage("ai_doctor_boundary_verified"'),
    );
    expect(sensorStage).toContain("toHaveURL(/\\/doctor(?:\\?|$)/)");
    expect(sensorStage).toContain('getByTestId("ai-doctor-start")');
    expect(sensorStage).not.toContain('getByTestId("ai-doctor-sessions-index-page")');

    const aiDoctorStage = SPEC.slice(
      SPEC.indexOf('await stage("ai_doctor_boundary_verified"'),
      SPEC.indexOf('await stage("alert_verified"'),
    );
    expect(aiDoctorStage).toMatch(
      /getByRole\(\s*"link",\s*\{\s*name:\s*`Review \$\{PLANT_NAME\} with AI Doctor`/s,
    );
    expect(aiDoctorStage).toContain("#plant-ai-doctor-review$");
    expect(aiDoctorStage).not.toContain("page.goto(`/plants/${fixturePlantId}`)");
    expect(aiDoctorStage).toContain('page.goto("/doctor/sessions")');
    expect(aiDoctorStage).toContain('getByTestId("ai-doctor-sessions-index-page")');
  });

  it("pins every manual sensor value through the database row and AI packet", () => {
    const sensorStage = SPEC.slice(
      SPEC.indexOf('await stage("sensor_snapshot_verified"'),
      SPEC.indexOf('await stage("ai_doctor_boundary_verified"'),
    );
    expect(sensorStage).toContain("temperature_c: 27.78");
    expect(sensorStage).toContain("humidity_pct: 48");
    expect(sensorStage).toContain("vpd_kpa: 1.65");

    const aiDoctorStage = SPEC.slice(
      SPEC.indexOf('await stage("ai_doctor_boundary_verified"'),
      SPEC.indexOf('await stage("alert_verified"'),
    );
    for (const expectedReading of [
      '{ field: "temperature_c", value: 27.78 }',
      '{ field: "humidity_pct", value: 48 }',
      '{ field: "vpd_kpa", value: 1.65 }',
    ]) {
      expect(aiDoctorStage).toContain(expectedReading);
    }
  });

  it("keeps a tent-scoped alert and its queue draft honest instead of inventing plant scope", () => {
    expect(SPEC).toContain("tent-scoped alert must not invent plant attribution");
    expect(SPEC).toContain("tent-scoped action must preserve null plant attribution");
    expect(SPEC).toContain('source).toBe("environment_alert")');
  });

  it("proves the queue row remains pending, device-less, and unexecuted at the approval boundary", () => {
    expect(SPEC).toContain('"pending_approval"');
    expect(SPEC).toContain("target_device");
    expect(SPEC).toContain("tent_id");
    expect(SPEC).toContain("alert-handoff-add-button");
    expect(SPEC).toContain("approval_boundary_verified");
    expect(SPEC).toContain("action-detail-approve");
    expect(SPEC).toContain("Current status: Pending review");
    expect(SPEC).not.toMatch(/getByTestId\("action-detail-approve"\)\.click/);
    expect(SPEC).not.toContain("action-detail-complete");
    expect(SPEC).not.toContain("grower_decision_verified");
    expect(SPEC).not.toContain("follow_up_marker_verified");
    const suggestionStage = SPEC.slice(
      SPEC.indexOf('await stage("action_queue_suggestion_verified"'),
      SPEC.indexOf('await stage("approval_boundary_verified"'),
    );
    const queueQuery = suggestionStage.slice(
      suggestionStage.indexOf('.from("action_queue")'),
      suggestionStage.indexOf("expect(queueError).toBeNull()"),
    );
    expect(queueQuery).toContain('.eq("grow_id", fixtureGrowId)');
    expect(queueQuery).not.toContain('.eq("tent_id"');
    expect(queueQuery).not.toContain('.eq("source"');
    expect(queueQuery).not.toContain('.is("plant_id"');
    expect(suggestionStage).toContain("expect(queueRowsAfterInsert).toHaveLength(1)");
    expect(suggestionStage).toContain(
      "fences.action_queue_count = queueRowsAfterInsert?.length ?? 0",
    );
    const approvalBoundary = SPEC.slice(
      SPEC.indexOf('await stage("approval_boundary_verified"'),
      SPEC.indexOf('await stage("paddle_sandbox_verified"'),
    );
    expect(approvalBoundary).toContain('event_type: "action_followup"');
    expect(approvalBoundary).toContain("expect(followUpRows).toHaveLength(0)");
  });

  it("proves Paddle remains visibly sandboxed without opening checkout", () => {
    expect(SPEC).toContain("paddle_sandbox_verified");
    expect(SPEC).toContain("payments-test-mode-banner");
    expect(SPEC).toContain('data-payment-env", "sandbox"');
    expect(SPEC).toContain("No real charges");
    expect(SPEC).toContain("pricing-checkout-trust");
    expect(SPEC).toContain('data-checkout-state", "sandbox"');
    expect(SPEC).not.toMatch(/pricing-(?:founder|pro)-(?:lifetime|monthly|annual)-cta"\)\.click/);
  });

  it("receipt cannot report PASS without every new objective stage", () => {
    for (const stage of [
      "hierarchy_created_via_ui",
      "deployment_sha_verified",
      "plant_persisted_after_refresh",
      "quick_log_context_verified",
      "photo_and_manual_evidence_persisted",
      "quick_log_manual_tent_snapshot_verified",
      "operator_sensor_evidence_seeded",
      "sensor_snapshot_verified",
      "approval_boundary_verified",
      "paddle_sandbox_verified",
    ]) {
      expect(browserProofContract.ONE_TENT_PROOF_STAGES).toContain(stage);
    }
  });

  it("classifies the first failed stage with a fixed secret-safe blocker code", () => {
    expect(SPEC).toContain("let proofBlockerReason: string | null = null");
    expect(SPEC).toContain("proofBlockerReason ??= `${name}_failed`");
    expect(SPEC).toContain("blockerReason: proofBlockerReason");
  });
});
