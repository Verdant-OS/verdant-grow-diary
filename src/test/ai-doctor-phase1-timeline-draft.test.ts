import { describe, it, expect } from "vitest";
import {
  buildAiDoctorPhase1TimelineDraft,
  isOkPhase1TimelineDraft,
  AI_DOCTOR_PHASE1_EVIDENCE_LABEL,
  AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER,
  AI_DOCTOR_PHASE1_TIMELINE_SOURCE,
} from "@/lib/aiDoctorPhase1TimelineDraft";
import type { AiDoctorDiagnosisResult } from "@/lib/aiDoctorEnginePhase1Foundation";

const sampleResult: AiDoctorDiagnosisResult = {
  summary: "Plant context is incomplete. Add more evidence.",
  likely_issue: "Insufficient context for a confident diagnosis",
  confidence: "low",
  evidence: ["No fresh sensor snapshot"],
  missing_information: ["Recent photo", "Sensor snapshot"],
  possible_causes: ["Unknown — insufficient evidence"],
  immediate_action: "Add a recent photo and a sensor snapshot.",
  what_not_to_do: ["Do not adjust nutrients on weak evidence"],
  follow_up_24h: "Re-check after 24 hours.",
  recovery_plan_3_day: "Stabilise environment for 3 days.",
  risk_level: "low",
  action_queue_suggestion: null,
};

const identity = {
  plant_id: "plant-1",
  tent_id: "tent-1",
  grow_id: "grow-1",
  plant_name: "Test Plant",
};
const now = new Date("2026-06-19T12:00:00Z");

describe("aiDoctorPhase1TimelineDraft", () => {
  it("builds a valid evidence draft for a complete input", () => {
    const d = buildAiDoctorPhase1TimelineDraft({
      identity,
      result: sampleResult,
      now,
    });
    expect(isOkPhase1TimelineDraft(d)).toBe(true);
    if (!isOkPhase1TimelineDraft(d)) return;

    expect(d.payload.p_target_type).toBe("plant");
    expect(d.payload.p_target_id).toBe("plant-1");
    expect(d.payload.p_action).toBe("note");
    expect(d.payload.p_volume_ml).toBeNull();
    expect(d.payload.p_temperature_c).toBeNull();
    expect(d.payload.p_humidity_pct).toBeNull();
    expect(d.payload.p_vpd_kpa).toBeNull();
    expect(d.payload.p_occurred_at).toBe(now.toISOString());
    expect(d.payload.p_note).toContain(AI_DOCTOR_PHASE1_EVIDENCE_LABEL);
    expect(d.payload.p_note).toContain(AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER);

    expect(d.details.kind).toBe("ai_doctor_phase1_evidence");
    expect(d.details.source).toBe(AI_DOCTOR_PHASE1_TIMELINE_SOURCE);
    expect(d.details.label).toBe(AI_DOCTOR_PHASE1_EVIDENCE_LABEL);
    expect(d.details.evidence_only).toBe(true);
    expect(d.details.no_action_queue_write).toBe(true);
    expect(d.details.no_alert_write).toBe(true);
    expect(d.details.no_device_control).toBe(true);
    expect(d.details.no_live_ai_model).toBe(true);
    expect(d.details.result.action_queue_suggestion_status).toBe(
      "preview_only",
    );
    expect(d.details.result.risk_level).toBe("low");
    expect(d.details.result.confidence).toBe("low");
    expect(d.details.result.missing_information).toEqual([
      "Recent photo",
      "Sensor snapshot",
    ]);
  });

  it("rejects missing plant_id", () => {
    const d = buildAiDoctorPhase1TimelineDraft({
      identity: { ...identity, plant_id: null },
      result: sampleResult,
      now,
    });
    expect(d.ok).toBe(false);
    if (isOkPhase1TimelineDraft(d)) return;
    expect(d.reasons).toContain("missing_plant_id");
  });

  it("rejects missing grow_id", () => {
    const d = buildAiDoctorPhase1TimelineDraft({
      identity: { ...identity, grow_id: null },
      result: sampleResult,
      now,
    });
    expect(d.ok).toBe(false);
    if (isOkPhase1TimelineDraft(d)) return;
    expect(d.reasons).toContain("missing_grow_id");
  });

  it("rejects missing result", () => {
    const d = buildAiDoctorPhase1TimelineDraft({
      identity,
      result: null,
      now,
    });
    expect(d.ok).toBe(false);
    if (isOkPhase1TimelineDraft(d)) return;
    expect(d.reasons).toContain("missing_result");
  });

  it("is deterministic for the same input", () => {
    const a = buildAiDoctorPhase1TimelineDraft({
      identity,
      result: sampleResult,
      now,
    });
    const b = buildAiDoctorPhase1TimelineDraft({
      identity,
      result: sampleResult,
      now,
    });
    expect(isOkPhase1TimelineDraft(a) && isOkPhase1TimelineDraft(b)).toBe(true);
    if (!isOkPhase1TimelineDraft(a) || !isOkPhase1TimelineDraft(b)) return;
    expect(a.idempotency_key).toBe(b.idempotency_key);
    expect(a.details.context_hash).toBe(b.details.context_hash);
  });

  it("produces different idempotency keys for different results", () => {
    const a = buildAiDoctorPhase1TimelineDraft({
      identity,
      result: sampleResult,
      now,
    });
    const b = buildAiDoctorPhase1TimelineDraft({
      identity,
      result: { ...sampleResult, summary: "Different summary" },
      now,
    });
    if (!isOkPhase1TimelineDraft(a) || !isOkPhase1TimelineDraft(b)) {
      throw new Error("expected ok");
    }
    expect(a.idempotency_key).not.toBe(b.idempotency_key);
  });

  it("does not include executable command or action_queue fields", () => {
    const d = buildAiDoctorPhase1TimelineDraft({
      identity,
      result: sampleResult,
      now,
    });
    if (!isOkPhase1TimelineDraft(d)) return;
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/device_command|execute|approve|send_command/i);
    expect(json).not.toMatch(/"action_queue_id"|"alert_id"/);
  });
});
