/**
 * Tests for buildAiDoctorManualSaveDraft — pure draft builder, no writes.
 */
import { describe, it, expect } from "vitest";
import {
  AI_DOCTOR_MANUAL_SAVE_KIND,
  AI_DOCTOR_MANUAL_SAVE_SOURCE,
  buildAiDoctorManualSaveDraft,
  type AiDoctorManualSavePlantIdentity,
} from "@/lib/aiDoctorManualSaveDraft";
import type { AiDoctorCheckInPreviewView } from "@/lib/aiDoctorCheckInPreviewViewModel";

const NOW = new Date("2026-06-10T12:00:00.000Z");

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
    evidence: ["Sensor group live: 3 readings"],
    missingInformation: ["No recent grow events."],
    possibleCauses: ["Environmental drift."],
    immediateAction: "Observe and re-check.",
    whatNotToDo: ["Do not adjust nutrients."],
    followUp24h: "Re-check sensors.",
    recoveryPlan3Day: "Log daily.",
    riskLevel: "low",
    limitations: [],
    actionQueueSuggestion: null,
    ...overrides,
  };
}

const IDENTITY: AiDoctorManualSavePlantIdentity = {
  plant_id: "p1",
  tent_id: "t1",
  grow_id: "g1",
  plant_name: "Plant A",
  stage: "veg",
};

const RECEIPT = "Receipt body text for note.";

describe("buildAiDoctorManualSaveDraft", () => {
  it("builds an observation draft with correct source and note", () => {
    const r = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.event_type).toBe("observation");
    expect(r.draft.source).toBe(AI_DOCTOR_MANUAL_SAVE_SOURCE);
    expect(r.draft.note).toBe(RECEIPT);
    expect(r.draft.plant_id).toBe("p1");
    expect(r.draft.tent_id).toBe("t1");
    expect(r.draft.grow_id).toBe("g1");
    expect(r.draft.occurred_at).toBe("2026-06-10T12:00:00.000Z");
  });

  it("includes required safety labels in details", () => {
    const r = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    if (!r.ok) throw new Error("expected ok");
    const d = r.draft.details;
    expect(d.kind).toBe(AI_DOCTOR_MANUAL_SAVE_KIND);
    expect(d.preview_only).toBe(true);
    expect(d.manual_save).toBe(true);
    expect(d.deterministic_engine).toBe(true);
    expect(d.no_live_ai_model).toBe(true);
    expect(d.engine_version).toBeTruthy();
    expect(d.receipt_version).toBeTruthy();
    expect(d.context_hash).toBeTruthy();
  });

  it("includes only redacted engine_output fields", () => {
    const r = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    if (!r.ok) throw new Error("expected ok");
    const eo = r.draft.details.engine_output;
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
  });

  it("excludes raw payloads, secrets, tokens, env vars, prompts", () => {
    const r = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    if (!r.ok) throw new Error("expected ok");
    const json = JSON.stringify(r.draft);
    expect(json).not.toMatch(/eyJ[\w-]+\.eyJ[\w-]+/);
    expect(json).not.toMatch(/service[_-]?role/i);
    expect(json).not.toMatch(/api[_-]?key/i);
    expect(json).not.toMatch(/secret/i);
    expect(json).not.toMatch(/bearer/i);
    expect(json).not.toMatch(/raw_payload/i);
    expect(json).not.toMatch(/prompt/i);
    expect(json).not.toMatch(/process\.env/);
  });

  it("generates a deterministic context_hash", () => {
    const a = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    const b = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.draft.details.context_hash).toBe(b.draft.details.context_hash);
    const c = buildAiDoctorManualSaveDraft({
      view: makeView({ summary: "Different summary." }),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    if (!c.ok) throw new Error("expected ok");
    expect(c.draft.details.context_hash).not.toBe(a.draft.details.context_hash);
  });

  it("generates a deterministic idempotency key", () => {
    const a = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    const b = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.idempotency_key).toBe(b.idempotency_key);
    expect(a.idempotency_key).toContain("p1");
  });

  it("returns blocked draft with reasons when identity is missing", () => {
    const r = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: { plant_id: null, tent_id: null, grow_id: null },
      receiptText: RECEIPT,
      now: NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked"); const blocked = r;
    expect(blocked.reasons).toContain("missing_plant_id");
    expect(blocked.reasons).toContain("missing_tent_id");
    expect(blocked.reasons).toContain("missing_grow_id");
  });

  it("returns blocked when receipt text is empty", () => {
    const r = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: "   ",
      now: NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected blocked"); const blocked = r;
    expect(blocked.reasons).toContain("missing_note");
  });

  it("preserves demo/stale/invalid limitations in details", () => {
    const r = buildAiDoctorManualSaveDraft({
      view: makeView({
        limitations: [
          { code: "demo_only", message: "Demo." },
          { code: "stale_or_invalid", message: "Stale." },
        ],
      }),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    if (!r.ok) throw new Error("expected ok");
    const codes = r.draft.details.limitations.map((l) => l.code);
    expect(codes).toContain("demo_only");
    expect(codes).toContain("stale_or_invalid");
  });

  it("stores action queue suggestion as status-only metadata", () => {
    const r = buildAiDoctorManualSaveDraft({
      view: makeView({
        actionQueueSuggestion: {
          action_type: "advisory",
          status: "pending_approval",
          reason: "Observe environment drift",
          risk_level: "low",
        },
      }),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    if (!r.ok) throw new Error("expected ok");
    const eo = r.draft.details.engine_output;
    expect(eo.action_queue_suggestion_status).toBe("pending_approval");
    // No queue row payload leaked
    const json = JSON.stringify(r.draft);
    expect(json).not.toMatch(/queue_id/i);
    expect(json).not.toMatch(/action_queue_item/i);
  });

  it("same input returns identical draft (deep)", () => {
    const a = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    const b = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("returned draft is frozen", () => {
    const r = buildAiDoctorManualSaveDraft({
      view: makeView(),
      identity: IDENTITY,
      receiptText: RECEIPT,
      now: NOW,
    });
    if (!r.ok) throw new Error("expected ok");
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.draft)).toBe(true);
    expect(Object.isFrozen(r.draft.details)).toBe(true);
  });

  it("static guard: source has no Supabase/write/model/action/alert imports", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/aiDoctorManualSaveDraft.ts", "utf8");
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']@?\/?.*supabase/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/functions\s*\.\s*invoke/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/createAlert|insertAlert|alertMutation/i);
    expect(src).not.toMatch(/actionQueue(Writer|Insert|Create|Mutation|Append)/i);
    expect(src).not.toMatch(/useQuickLogV2Save|quicklog_save_manual/);
    expect(src).not.toMatch(/openai|anthropic|gemini|model\.invoke/i);
  });
});
