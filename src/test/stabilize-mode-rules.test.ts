import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateStabilizeMode,
  type StabilizeModeInput,
} from "@/lib/stabilizeModeRules";

const NOW = "2026-06-09T12:00:00.000Z";
const HOUR = 60 * 60 * 1000;
const nowMs = Date.parse(NOW);

function base(overrides: Partial<StabilizeModeInput> = {}): StabilizeModeInput {
  return {
    now: NOW,
    plant_stage: "veg",
    plant_status: "healthy",
    last_log_at: new Date(nowMs - 4 * HOUR).toISOString(),
    recent_action_count_48h: 0,
    recent_major_change_count_48h: 0,
    active_alert_count: 0,
    sensor_source_summary: "live",
    has_stale_or_invalid_sensor_data: false,
    has_demo_or_manual_only_sensor_data: false,
    ai_doctor_confidence_level: "high",
    ai_doctor_missing_info_count: 0,
    ...overrides,
  };
}

const FORBIDDEN_CONFIDENCE = /\b(Guaranteed|Definitely|Certainly)\b/i;
const FORBIDDEN_DEVICE =
  /(turn on|turn off|run pump|run fan|run light|execute|command device|relay|actuator)/i;

function allCopy(r: ReturnType<typeof evaluateStabilizeMode>): string {
  return [
    r.headline,
    r.one_thing_to_watch,
    r.safe_next_log_prompt,
    r.recommended_wait_period,
    ...r.why_now,
    ...r.what_not_to_do,
    ...r.limitations,
  ].join(" | ");
}

describe("evaluateStabilizeMode", () => {
  it("low activity returns off", () => {
    const r = evaluateStabilizeMode(base());
    expect(r.level).toBe("off");
    expect(r.what_not_to_do.length).toBe(0);
    expect(r.action_queue_policy).toBe("review_only");
  });

  it("missing logs returns watch", () => {
    const r = evaluateStabilizeMode(
      base({ last_log_at: new Date(nowMs - 48 * HOUR).toISOString() }),
    );
    expect(r.level).toBe("watch");
    expect(r.what_not_to_do.length).toBeGreaterThan(0);
  });

  it("demo/manual-only sensor context returns watch", () => {
    const r = evaluateStabilizeMode(
      base({
        sensor_source_summary: "manual",
        has_demo_or_manual_only_sensor_data: true,
      }),
    );
    expect(r.level).toBe("watch");
    expect(r.what_not_to_do.join(" ")).toContain("live proof");
  });

  it("stale/invalid sensor with no alerts returns watch", () => {
    const r = evaluateStabilizeMode(
      base({
        sensor_source_summary: "stale",
        has_stale_or_invalid_sensor_data: true,
      }),
    );
    expect(r.level).toBe("watch");
  });

  it("stale/invalid sensor during problem period returns stabilize", () => {
    const r = evaluateStabilizeMode(
      base({
        sensor_source_summary: "invalid",
        has_stale_or_invalid_sensor_data: true,
        active_alert_count: 1,
      }),
    );
    expect(r.level).toBe("stabilize");
  });

  it("3+ actions in 48h returns stabilize with stacked-change warning", () => {
    const r = evaluateStabilizeMode(base({ recent_action_count_48h: 3 }));
    expect(r.level).toBe("stabilize");
    expect(r.what_not_to_do.join(" ")).toContain("stacking");
  });

  it("2+ major changes in 48h returns stabilize", () => {
    const r = evaluateStabilizeMode(
      base({ recent_major_change_count_48h: 2 }),
    );
    expect(r.level).toBe("stabilize");
  });

  it("active alert + low AI confidence returns stabilize", () => {
    const r = evaluateStabilizeMode(
      base({ active_alert_count: 1, ai_doctor_confidence_level: "low" }),
    );
    expect(r.level).toBe("stabilize");
    expect(r.what_not_to_do.join(" ")).toContain("overdiagnose");
  });

  it("high active alerts returns urgent_review without aggressive advice", () => {
    const r = evaluateStabilizeMode(
      base({
        active_alert_count: 3,
        ai_doctor_confidence_level: "low",
        recent_major_change_count_48h: 1,
      }),
    );
    expect(r.level).toBe("urgent_review");
    expect(allCopy(r)).not.toMatch(FORBIDDEN_DEVICE);
    expect(r.safe_next_log_prompt.toLowerCase()).toContain("do not");
  });

  it("autoflower/recovering avoids heavy-stress suggestions", () => {
    const r = evaluateStabilizeMode(
      base({
        plant_stage: "autoflower-flower",
        plant_status: "recovering",
        active_alert_count: 1,
      }),
    );
    expect(r.what_not_to_do.join(" ")).toContain("heavy defoliation");
    expect(r.safety_flags).toContain("prefer_low_stress_path");
  });

  it("what-not-to-do appears for all non-off levels", () => {
    const levels: StabilizeModeInput[] = [
      base({ last_log_at: new Date(nowMs - 72 * HOUR).toISOString() }), // watch
      base({ recent_action_count_48h: 4 }), // stabilize
      base({
        active_alert_count: 3,
        ai_doctor_confidence_level: "low",
      }), // urgent_review
    ];
    for (const input of levels) {
      const r = evaluateStabilizeMode(input);
      expect(r.level).not.toBe("off");
      expect(r.what_not_to_do.length).toBeGreaterThan(0);
    }
  });

  it("action_queue_policy is always review_only — never auto-creates", () => {
    for (const input of [
      base(),
      base({ recent_action_count_48h: 5 }),
      base({ active_alert_count: 5 }),
    ]) {
      const r = evaluateStabilizeMode(input);
      expect(r.action_queue_policy).toBe("review_only");
    }
  });

  it("no device-control copy in any output", () => {
    const inputs = [
      base(),
      base({ recent_action_count_48h: 3 }),
      base({ active_alert_count: 4, ai_doctor_confidence_level: "low" }),
    ];
    for (const input of inputs) {
      const r = evaluateStabilizeMode(input);
      expect(allCopy(r)).not.toMatch(FORBIDDEN_DEVICE);
    }
  });

  it("no aggressive intervention copy from weak context", () => {
    const r = evaluateStabilizeMode(
      base({
        sensor_source_summary: "demo",
        has_demo_or_manual_only_sensor_data: true,
        ai_doctor_confidence_level: "low",
        active_alert_count: 1,
      }),
    );
    const text = allCopy(r).toLowerCase();
    expect(text).not.toMatch(/flush now|defoliate now|transplant now|increase nutrients/);
  });

  it("no forbidden confidence copy", () => {
    const r = evaluateStabilizeMode(
      base({ active_alert_count: 3, ai_doctor_confidence_level: "low" }),
    );
    expect(allCopy(r)).not.toMatch(FORBIDDEN_CONFIDENCE);
  });

  it("deterministic for the same input", () => {
    const input = base({ recent_action_count_48h: 3, active_alert_count: 1 });
    const a = evaluateStabilizeMode(input);
    const b = evaluateStabilizeMode(input);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("source file uses no Date.now and no I/O", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/stabilizeModeRules.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/Date\.now\s*\(/);
    expect(src).not.toMatch(/fetch\(|supabase|service_role|functions\.invoke/);
    expect(src).not.toMatch(/from\(['"]action_queue['"]\)|from\(['"]alerts['"]\)/);
  });

  it("handles null/invalid inputs safely", () => {
    const r = evaluateStabilizeMode({
      now: NOW,
      last_log_at: null,
      recent_action_count_48h: -5 as unknown as number,
      recent_major_change_count_48h: Number.NaN as unknown as number,
      active_alert_count: 0,
      sensor_source_summary: "none",
      has_stale_or_invalid_sensor_data: false,
      has_demo_or_manual_only_sensor_data: false,
    });
    expect(["watch", "off"]).toContain(r.level);
    expect(r.evidence.length).toBeGreaterThan(0);
  });
});
