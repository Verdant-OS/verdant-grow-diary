/**
 * Authenticated One-Tent browser proof — objective coverage contract.
 *
 * This is intentionally a source-level fence around the real Playwright walk.
 * It does not pretend to replace the authenticated run; it prevents that run
 * from going green while skipping the exact production defects it exists to
 * prove: UI hierarchy creation, refresh persistence, bound Quick Log context,
 * photo/manual evidence, cautious AI, approval-required actions, mobile, and
 * Paddle sandbox truth.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SPEC = readFileSync(resolve(ROOT, "e2e/one-tent-loop-golden-path-ui.spec.ts"), "utf8");
const RECEIPT = readFileSync(resolve(ROOT, "e2e/helpers/oneTentBrowserProofReceipt.ts"), "utf8");
const SEED = readFileSync(resolve(ROOT, "scripts/e2e/seed-one-tent-golden-path.mjs"), "utf8");
const TIMELINE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const RUNBOOK = readFileSync(resolve(ROOT, "docs/one-tent-loop-golden-path.md"), "utf8");

describe("authenticated One-Tent proof covers the production objective", () => {
  it("runs the authoritative walk at the defect-reproducing mobile viewport", () => {
    expect(SPEC).toContain("width: 390");
    expect(SPEC).toContain("height: 844");
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

  it("shares a validated per-run fixture marker between the UI walk and evidence helper", () => {
    expect(SPEC).toContain("process.env.E2E_ONE_TENT_FIXTURE_MARKER");
    expect(SEED).toContain("process.env.E2E_ONE_TENT_FIXTURE_MARKER");
    expect(SPEC).toContain("GOLDEN-PATH-FIXTURE-RUN-");
    expect(SEED).toContain("GOLDEN-PATH-FIXTURE-RUN-");
  });

  it("creates Grow, Tent, and Plant through the real Start Your Room UI", () => {
    for (const testId of [
      "start-room-grow-name",
      "start-room-grow-submit",
      "start-room-tent-name",
      "start-room-tent-submit",
      "start-room-plant-name",
      "start-room-plant-submit",
      "start-room-finish",
    ]) {
      expect(SPEC).toContain(testId);
    }
    expect(SPEC).not.toContain("fixture grow row must exist (run the seed)");
    expect(SPEC).toContain('"--evidence-only"');
    expect(SEED).toContain('const EVIDENCE_ONLY_FLAG = "--evidence-only"');
    expect(SEED).toContain('blocked("golden_grow_missing")');
    expect(SEED).toContain('blocked("golden_tent_missing")');
    expect(SEED).toContain('blocked("golden_plant_missing")');
  });

  it("requires an explicit matching target project before the evidence seed can write", () => {
    expect(SEED).toContain('if (!targetRef) blocked("missing_target_project_ref")');
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
  });

  it("wires persisted Plant Quick Log manual evidence into the Timeline snapshot presenter", () => {
    expect(TIMELINE).toContain("resolveTimelineSensorSnapshot");
    expect(TIMELINE).toMatch(/resolveTimelineSensorSnapshot\(e\.details\)/);
  });

  it("proves Quick Log inherited the exact plant, tent, and grow before save", () => {
    expect(SPEC).toContain("quick_log_context_verified");
    expect(SPEC).toContain("quick-log-target-plant");
    expect(SPEC).toContain("quick-log-target-tent");
    expect(SPEC).toContain("quick-log-target-grow");
    expect(SPEC).toContain("plant-detail-quick-log-open");
    expect(SPEC).toContain("plant-quick-log-save");
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
    expect(SPEC).toContain('let evidenceSeedStatus: OneTentProofStagedResult["seedStatus"]');
    expect(SPEC).toContain('evidenceSeedStatus = "completed"');
    expect(SPEC).toContain('evidenceSeedStatus = "failed"');
    expect(SPEC).toContain("seedStatus: evidenceSeedStatus");
  });

  it("requires AI Doctor to expose actual evidence, uncertainty, and missing context", () => {
    expect(SPEC).toContain("DETERMINISTIC_AI_DOCTOR_RESPONSE.evidence");
    expect(SPEC).toContain("DETERMINISTIC_AI_DOCTOR_RESPONSE.missing_information");
    expect(SPEC).toContain("DETERMINISTIC_AI_DOCTOR_RESPONSE.what_not_to_do");
    expect(SPEC).toContain("twenty_four_hour_follow_up");
    expect(SPEC).toContain("three_day_recovery_plan");
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
    expect(SPEC).toContain("Manual sensor snapshot included temperature and 48% RH");
    expect(SPEC).toContain("No fresh live sensor reading was available");
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
  });

  it("keeps a tent-scoped alert and its queue draft honest instead of inventing plant scope", () => {
    expect(SPEC).toContain("tent-scoped alert must not invent plant attribution");
    expect(SPEC).toContain("tent-scoped action must preserve null plant attribution");
    expect(SPEC).toContain('source).toBe("environment_alert")');
  });

  it("proves the queue row is suggested and device-less before explicit approval and completion", () => {
    expect(SPEC).toContain('"pending_approval"');
    expect(SPEC).toContain("target_device");
    expect(SPEC).toContain("tent_id");
    expect(SPEC).toContain("alert-handoff-add-button");
    expect(SPEC).toContain("action-detail-approve");
    expect(SPEC).toContain("action-detail-complete");
    expect(SPEC).toContain('getByRole("dialog", { name: "Approve Action" })');
    expect(SPEC).toContain('getByRole("dialog", { name: "Mark Action Complete" })');
    expect(SPEC).toContain("grower_decision_verified");
  });

  it("proves Paddle remains visibly sandboxed without opening checkout", () => {
    expect(SPEC).toContain("paddle_sandbox_verified");
    expect(SPEC).toContain("pricing-checkout-trust");
    expect(SPEC).toContain('data-checkout-state", "sandbox"');
  });

  it("receipt cannot report PASS without every new objective stage", () => {
    for (const stage of [
      "hierarchy_created_via_ui",
      "plant_persisted_after_refresh",
      "quick_log_context_verified",
      "photo_and_manual_evidence_persisted",
      "sensor_snapshot_verified",
      "paddle_sandbox_verified",
    ]) {
      expect(RECEIPT).toContain(`"${stage}"`);
    }
  });

  it("does not call the authenticated fixture fully disposable while cleanup lacks authority", () => {
    expect(RUNBOOK).toContain("not yet fully disposable");
    expect(RUNBOOK).toContain("sensor_readings");
    expect(RUNBOOK).toContain("ai_doctor_sessions");
    expect(RUNBOOK).toContain("diary-photos");
  });
});
