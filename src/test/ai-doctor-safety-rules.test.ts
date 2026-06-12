/**
 * AI Doctor Safety Rules (Phase 1) — pure tests.
 *
 * No I/O, no Supabase, no model calls. Deterministic.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyAiDoctorSafetyRules,
  assessContextStrength,
  bandForConfidence,
  isLikelyAutoflower,
  AUTOFLOWER_NEVER_DO,
  NEVER_DO_BASELINE,
  type AiDoctorDraft,
} from "../lib/aiDoctorSafetyRules";
import {
  compileAiDoctorContextFromRows,
  generateAiDoctorResult,
  type AiDoctorContext,
} from "../lib/aiDoctorEngine";

const NOW = new Date("2026-06-04T12:00:00Z");
const iso = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const minimalContext = (): AiDoctorContext =>
  compileAiDoctorContextFromRows({
    plant: { id: "p1", tent_id: "t1", grow_id: "g1", stage: "veg" },
    growEvents: [],
    sensorReadings: [],
    now: NOW,
  });

const richContext = (
  overrides: Partial<{ strain: string; stale: boolean; demo: boolean }> = {},
): AiDoctorContext =>
  compileAiDoctorContextFromRows({
    plant: {
      id: "p1",
      tent_id: "t1",
      grow_id: "g1",
      stage: "flower",
      strain: overrides.strain ?? "Northern Lights Photo",
      name: "Plant 1",
    },
    growEvents: [
      { occurred_at: iso(2 * 24 * 60 * 60 * 1000), event_type: "watering", source: "manual" },
    ],
    sensorReadings: [
      { metric: "temperature_c", value: 24, captured_at: iso(60 * 60 * 1000), source: "live" },
      { metric: "humidity_pct", value: 55, captured_at: iso(60 * 60 * 1000), source: "live" },
      ...(overrides.stale
        ? [{ metric: "temperature_c", value: 23, captured_at: iso(60 * 60 * 1000), source: "live", quality: "stale" }]
        : []),
      ...(overrides.demo
        ? [{ metric: "temperature_c", value: 23, captured_at: iso(60 * 60 * 1000), source: "demo" }]
        : []),
    ],
    now: NOW,
  });

const baseDraft = (): AiDoctorDraft => ({
  summary: "draft",
  likely_issue: "",
  confidence: 0.9,
  evidence: [],
  missing_information: [],
  possible_causes: [],
  immediate_action: "Observe and re-check.",
  what_not_to_do: [],
  follow_up_24h: "follow",
  recovery_plan_3_day: "recover",
  risk_level: "low",
  action_queue_suggestion: null,
});

describe("assessContextStrength", () => {
  it("flags missing trustworthy sensors and demo-only state", () => {
    const ctx = compileAiDoctorContextFromRows({
      plant: { id: "p1" },
      growEvents: [],
      sensorReadings: [
        { metric: "temperature_c", value: 22, captured_at: iso(1000), source: "demo" },
      ],
      now: NOW,
    });
    const s = assessContextStrength(ctx);
    expect(s.hasTrustworthySensors).toBe(false);
    expect(s.hasDemoOnly).toBe(true);
  });
});

describe("bandForConfidence", () => {
  it("classifies bands", () => {
    expect(bandForConfidence(0.1)).toBe("low");
    expect(bandForConfidence(0.4)).toBe("medium");
    expect(bandForConfidence(0.7)).toBe("high");
  });
});

describe("isLikelyAutoflower", () => {
  it("matches 'auto' / 'autoflower' in strain or name", () => {
    const ctx = compileAiDoctorContextFromRows({
      plant: { id: "p1", strain: "NL Auto", name: "x" },
      growEvents: [],
      sensorReadings: [],
      now: NOW,
    });
    expect(isLikelyAutoflower(ctx)).toBe(true);
  });
  it("returns false for photoperiod strain", () => {
    const ctx = compileAiDoctorContextFromRows({
      plant: { id: "p1", strain: "Northern Lights", name: "x" },
      growEvents: [],
      sensorReadings: [],
      now: NOW,
    });
    expect(isLikelyAutoflower(ctx)).toBe(false);
  });
});

describe("applyAiDoctorSafetyRules", () => {
  it("caps confidence above medium when only one weak signal exists", () => {
    const draft = baseDraft();
    draft.confidence = 0.95;
    const r = applyAiDoctorSafetyRules(draft, minimalContext());
    expect(r.confidence).toBeLessThanOrEqual(0.5);
    expect(r.confidence_band).not.toBe("high");
    expect(r.applied_safety_rules).toContain(
      "cap_confidence_on_single_weak_signal",
    );
  });

  it("adds missing_information when no recent sensor data exists", () => {
    const r = applyAiDoctorSafetyRules(baseDraft(), minimalContext());
    expect(r.missing_information.join(" ")).toMatch(/no live or manual sensor/i);
    expect(r.applied_safety_rules).toContain(
      "missing_information_when_no_recent_sensor_data",
    );
  });

  it("flags stale/invalid telemetry as a limitation and suggests recheck", () => {
    const ctx = richContext({ stale: true });
    const r = applyAiDoctorSafetyRules(baseDraft(), ctx);
    expect(r.missing_information.some((m) => /stale or invalid/i.test(m))).toBe(true);
    expect(r.applied_safety_rules).toContain("flag_stale_or_invalid_telemetry");
    expect(r.action_queue_suggestion).not.toBeNull();
    expect(r.action_queue_suggestion?.action_type).toBe("advisory");
    expect(r.action_queue_suggestion?.status).toBe("pending_approval");
  });

  it("blocks heavy-stress recovery advice for autoflowers", () => {
    const ctx = richContext({ strain: "Quick Auto" });
    const r = applyAiDoctorSafetyRules(baseDraft(), ctx);
    for (const rule of AUTOFLOWER_NEVER_DO) {
      expect(r.what_not_to_do).toContain(rule);
    }
    expect(r.applied_safety_rules).toContain(
      "autoflower_block_heavy_stress_recovery",
    );
  });

  it("always includes the never-do baseline (no nutrient/irrigation/equipment changes)", () => {
    const r = applyAiDoctorSafetyRules(baseDraft(), minimalContext());
    for (const rule of NEVER_DO_BASELINE) {
      expect(r.what_not_to_do).toContain(rule);
    }
  });

  it("strips device-command wording from immediate_action and what_not_to_do", () => {
    const draft = baseDraft();
    draft.immediate_action = "Turn on the dehumidifier now.";
    draft.what_not_to_do = ["Activate the irrigation pump."];
    const r = applyAiDoctorSafetyRules(draft, minimalContext());
    expect(r.immediate_action).not.toMatch(/turn on/i);
    expect(r.what_not_to_do.some((s) => /activate/i.test(s))).toBe(false);
    expect(r.applied_safety_rules).toContain(
      "stripped_device_command_from_immediate_action",
    );
  });

  it("never returns an executable action queue suggestion", () => {
    const draft = baseDraft();
    draft.action_queue_suggestion = {
      // @ts-expect-error — intentionally test that exec values get normalized
      action_type: "execute_device_command",
      // @ts-expect-error
      status: "auto_executed",
      reason: "x",
      risk_level: "high",
    };
    const r = applyAiDoctorSafetyRules(draft, minimalContext());
    expect(r.action_queue_suggestion?.action_type).toBe("advisory");
    expect(r.action_queue_suggestion?.status).toBe("pending_approval");
  });

  it("is deterministic — same input ⇒ same output", () => {
    const ctx = richContext();
    const a = applyAiDoctorSafetyRules(baseDraft(), ctx);
    const b = applyAiDoctorSafetyRules(baseDraft(), ctx);
    expect(a).toEqual(b);
  });
});

describe("generateAiDoctorResult (engine surface)", () => {
  it("produces cautious result when context is incomplete", () => {
    const r = generateAiDoctorResult(minimalContext());
    expect(r.confidence).toBeLessThan(0.4);
    expect(r.confidence_band).not.toBe("high");
    expect(r.summary).toMatch(/more information is needed|insufficient/i);
    expect(r.likely_issue).toBe("");
    expect(r.action_queue_suggestion).toBeNull();
  });

  it("includes missing_information when sensor data is absent", () => {
    const r = generateAiDoctorResult(minimalContext());
    expect(
      r.missing_information.some((m) => /no live or manual sensor/i.test(m)),
    ).toBe(true);
  });

  it("does not suggest aggressive nutrient/feed changes from environment-only evidence", () => {
    const r = generateAiDoctorResult(richContext());
    const blob = [
      r.summary,
      r.immediate_action,
      r.follow_up_24h,
      r.recovery_plan_3_day,
      ...r.possible_causes,
    ]
      .join(" ")
      .toLowerCase();
    expect(blob).not.toMatch(/increase nutrients|raise ec|boost feed|flush hard/);
    // and "Do not adjust nutrient" must be present
    expect(r.what_not_to_do.some((s) => /adjust nutrient/i.test(s))).toBe(true);
  });

  it("never suggests device control, automation, or executable commands", () => {
    const r = generateAiDoctorResult(richContext({ stale: true }));
    const blob = [r.summary, r.immediate_action, r.follow_up_24h, r.recovery_plan_3_day]
      .join(" ")
      .toLowerCase();
    expect(blob).not.toMatch(
      /turn on|turn off|activate|trigger|automation|execute/,
    );
    if (r.action_queue_suggestion) {
      expect(r.action_queue_suggestion.action_type).toBe("advisory");
      expect(r.action_queue_suggestion.status).toBe("pending_approval");
    }
  });

  it("is deterministic — same context ⇒ same result", () => {
    const ctx = richContext();
    expect(generateAiDoctorResult(ctx)).toEqual(generateAiDoctorResult(ctx));
  });
});

describe("static safety: aiDoctorSafetyRules.ts has no I/O", () => {
  it("does not import Supabase, fetch, or Action Queue writers", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/aiDoctorSafetyRules.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/supabase\.functions\.invoke/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/action_queue.*insert|insert.*action_queue/i);
  });
});
