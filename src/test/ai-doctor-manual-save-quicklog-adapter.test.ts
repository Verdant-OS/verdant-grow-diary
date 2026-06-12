/**
 * Unit tests for buildAiDoctorQuickLogSavePayload.
 *
 * The adapter must map an OK manual-save draft to the existing Quick Log v2
 * RPC parameter shape without writing anything.
 */
import { describe, it, expect } from "vitest";
import { buildAiDoctorManualSaveDraft } from "@/lib/aiDoctorManualSaveDraft";
import { buildAiDoctorQuickLogSavePayload } from "@/lib/aiDoctorManualSaveQuickLogAdapter";
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
    limitations: [{ code: "demo_only", message: "Demo only." }],
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

function buildOkDraft() {
  const draft = buildAiDoctorManualSaveDraft({
    view: makeView(),
    identity: IDENTITY,
    receiptText: "AI Doctor receipt text",
    now: new Date("2026-06-10T12:00:00Z"),
  });
  if (!draft.ok) throw new Error("expected ok draft");
  return draft;
}

describe("buildAiDoctorQuickLogSavePayload", () => {
  it("maps draft to a Quick Log v2 plant/note RPC payload", () => {
    const draft = buildOkDraft();
    const payload = buildAiDoctorQuickLogSavePayload(draft);
    expect(payload.p_target_type).toBe("plant");
    expect(payload.p_target_id).toBe("p1");
    expect(payload.p_action).toBe("note");
    expect(payload.p_note).toBe("AI Doctor receipt text");
    expect(payload.p_volume_ml).toBeNull();
    expect(payload.p_temperature_c).toBeNull();
    expect(payload.p_humidity_pct).toBeNull();
    expect(payload.p_vpd_kpa).toBeNull();
    expect(payload.p_occurred_at).toBe("2026-06-10T12:00:00.000Z");
  });

  it("encodes AI Doctor metadata and idempotency key in p_details", () => {
    const draft = buildOkDraft();
    const payload = buildAiDoctorQuickLogSavePayload(draft);
    const d = payload.p_details as Record<string, unknown>;
    expect(d.kind).toBe("ai_doctor_check_in");
    expect(d.preview_only).toBe(true);
    expect(d.manual_save).toBe(true);
    expect(d.deterministic_engine).toBe(true);
    expect(d.no_live_ai_model).toBe(true);
    expect(d.source).toBe("ai_doctor_check_in_manual_save");
    expect(d.event_type_intent).toBe("observation");
    expect(d.tent_id).toBe("t1");
    expect(d.grow_id).toBe("g1");
    expect(d.idempotency_key).toBe(draft.idempotency_key);
    expect(d.context_hash).toBeTruthy();
    expect(typeof d.engine_output).toBe("object");
  });

  it("redacted engine_output contains no raw payloads or secrets", () => {
    const draft = buildOkDraft();
    const payload = buildAiDoctorQuickLogSavePayload(draft);
    const d = payload.p_details as Record<string, unknown>;
    const eo = d.engine_output as Record<string, unknown>;
    expect(Object.keys(eo).sort()).toEqual(
      [
        "action_queue_suggestion_status",
        "confidence",
        "evidence",
        "follow_up_24h",
        "immediate_action",
        "likely_issue",
        "missing_information",
        "recovery_plan_3_day",
        "risk_level",
        "summary",
        "what_not_to_do",
      ].sort(),
    );
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/raw_payload|secret|token|api[_-]?key/i);
  });

  it("is deterministic for identical input", () => {
    const a = buildAiDoctorQuickLogSavePayload(buildOkDraft());
    const b = buildAiDoctorQuickLogSavePayload(buildOkDraft());
    expect(a).toEqual(b);
  });

  it("static guard: adapter has no Supabase/fetch/RPC imports", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "src/lib/aiDoctorManualSaveQuickLogAdapter.ts",
      "utf8",
    );
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/functions\s*\.\s*invoke/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/useQuickLogV2Save|useMutation/);
    expect(src).not.toMatch(/createAlert|actionQueue/i);
    expect(src).not.toMatch(/openai|anthropic|gemini|model\.invoke/i);
  });
});
