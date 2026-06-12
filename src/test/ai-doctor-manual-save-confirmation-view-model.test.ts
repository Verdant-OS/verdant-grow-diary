/**
 * Unit tests for buildAiDoctorManualSaveConfirmationView.
 */
import { describe, it, expect } from "vitest";
import {
  AI_DOCTOR_MANUAL_SAVE_BUTTON_LABEL,
  AI_DOCTOR_MANUAL_SAVE_CONFIRM_LABEL,
  AI_DOCTOR_MANUAL_SAVE_SAVING_LABEL,
  AI_DOCTOR_MANUAL_SAVE_CONFIRMATION_COPY,
  buildAiDoctorManualSaveConfirmationView,
} from "@/lib/aiDoctorManualSaveConfirmationViewModel";
import type { AiDoctorCheckInPreviewView } from "@/lib/aiDoctorCheckInPreviewViewModel";

function makeView(
  overrides: Partial<AiDoctorCheckInPreviewView> = {},
): AiDoctorCheckInPreviewView {
  return {
    notices: {
      previewOnly: "Preview only — not saved.",
      noModelCalled: "No live AI model was called.",
    },
    contextWeak: false,
    summary: "Cautious observation-only summary.",
    likelyIssue: "Possible heat stress.",
    confidence: 0.35,
    confidenceBand: "low",
    evidence: ["Sensor live"],
    missingInformation: [],
    possibleCauses: [],
    immediateAction: "Observe.",
    whatNotToDo: [],
    followUp24h: "Re-check.",
    recoveryPlan3Day: "Log daily.",
    riskLevel: "low",
    limitations: [],
    actionQueueSuggestion: null,
    ...overrides,
  };
}

const IDENTITY = {
  plant_id: "p1",
  tent_id: "t1",
  grow_id: "g1",
  plant_name: "Plant A",
  stage: "veg",
};

const NOW = new Date("2026-06-10T12:00:00.000Z");

describe("buildAiDoctorManualSaveConfirmationView", () => {
  it("returns a ready view with required labels and copy", () => {
    const v = buildAiDoctorManualSaveConfirmationView({
      view: makeView(),
      identity: IDENTITY,
      receiptText: "receipt body",
      now: NOW,
    });
    expect(v.status).toBe("ready");
    if (v.status !== "ready") return;
    expect(v.buttonLabel).toBe(AI_DOCTOR_MANUAL_SAVE_BUTTON_LABEL);
    expect(v.eventTypeLabel).toBe("Observation");
    expect(v.sourceLabel).toBe("AI Doctor check-in manual save");
    expect(v.safetyLabels).toContain("Preview only");
    expect(v.safetyLabels).toContain("Deterministic engine");
    expect(v.safetyLabels).toContain("No live AI model");
    expect(v.copy).toBe(AI_DOCTOR_MANUAL_SAVE_CONFIRMATION_COPY);
    expect(v.confirmDisabled).toBe(true);
    expect(v.confirmDisabledLabel).toBe(AI_DOCTOR_MANUAL_SAVE_DISABLED_LABEL);
    expect(v.idempotencyKeyShort.length).toBeGreaterThan(0);
  });

  it("includes plant identity fields when present", () => {
    const v = buildAiDoctorManualSaveConfirmationView({
      view: makeView(),
      identity: IDENTITY,
      receiptText: "receipt",
      now: NOW,
    });
    if (v.status !== "ready") throw new Error("expected ready");
    expect(v.plant.id).toBe("p1");
    expect(v.plant.name).toBe("Plant A");
    expect(v.plant.stage).toBe("veg");
  });

  it("preserves limitations from preview view", () => {
    const v = buildAiDoctorManualSaveConfirmationView({
      view: makeView({
        limitations: [
          { code: "demo_only", message: "Demo only." },
          { code: "stale_or_invalid", message: "Stale telemetry." },
        ],
      }),
      identity: IDENTITY,
      receiptText: "receipt",
      now: NOW,
    });
    if (v.status !== "ready") throw new Error("expected ready");
    expect(v.limitations.map((l) => l.code)).toEqual([
      "demo_only",
      "stale_or_invalid",
    ]);
  });

  it("returns blocked view with reasons when identity is missing", () => {
    const v = buildAiDoctorManualSaveConfirmationView({
      view: makeView(),
      identity: { plant_id: null, tent_id: null, grow_id: null },
      receiptText: "receipt",
      now: NOW,
    });
    expect(v.status).toBe("blocked");
    if (v.status !== "blocked") return;
    expect(v.reasons).toContain("missing_plant_id");
    expect(v.reasons).toContain("missing_tent_id");
    expect(v.reasons).toContain("missing_grow_id");
    expect(v.buttonLabel).toBe(AI_DOCTOR_MANUAL_SAVE_BUTTON_LABEL);
  });

  it("copy includes mandatory no-model / no-alerts / cancel statements", () => {
    expect(AI_DOCTOR_MANUAL_SAVE_CONFIRMATION_COPY.noModel).toMatch(
      /No live AI model was called\./,
    );
    expect(AI_DOCTOR_MANUAL_SAVE_CONFIRMATION_COPY.noAlerts).toMatch(
      /No alerts or Action Queue items will be created\./,
    );
    expect(AI_DOCTOR_MANUAL_SAVE_CONFIRMATION_COPY.cancel).toMatch(
      /cancel before anything is saved/i,
    );
    expect(AI_DOCTOR_MANUAL_SAVE_CONFIRMATION_COPY.intro).toMatch(
      /save the AI Doctor preview as a diary observation/i,
    );
  });

  it("static guard: view model has no Supabase/write/model/alert/action-queue imports", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "src/lib/aiDoctorManualSaveConfirmationViewModel.ts",
      "utf8",
    );
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/functions\s*\.\s*invoke/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/createAlert|insertAlert|alertMutation/i);
    expect(src).not.toMatch(/actionQueue(Writer|Insert|Create|Mutation|Append)/i);
    expect(src).not.toMatch(/useQuickLogV2Save|useMutation/);
    expect(src).not.toMatch(/openai|anthropic|gemini|model\.invoke/i);
  });
});
