/**
 * Tests for oneTentLoopGapResolver — the top real-data gap picker.
 *
 * Guardrails:
 *  - Deterministic across runs.
 *  - Never labels missing / stale / invalid / demo-only / unknown as healthy.
 *  - Never emits raw payloads, tokens, or secret markers.
 */
import { describe, expect, it } from "vitest";
import { evaluateLoop, type LoopEvidence } from "@/lib/oneTentLoopProofRules";
import {
  buildOneTentLoopTopGapTextBlock,
  rankOneTentLoopGaps,
  resolveTopOneTentLoopGap,
} from "@/lib/oneTentLoopGapResolver";

const NOW_MS = Date.parse("2026-06-09T12:00:00.000Z");

function baseEvidence(): LoopEvidence {
  return {
    grow: { id: "g1", name: "Grow 1" },
    tent: { id: "t1", name: "Tent 1", grow_id: "g1", has_environment_target: true },
    plant: {
      id: "p1",
      name: "Plant 1",
      stage: "veg",
      medium: "coco",
      pot_size: "5gal",
      tent_id: "t1",
    },
    latest_quick_log: {
      id: "d1",
      entry_at: "2026-06-09T11:58:00.000Z",
      entry_type: "note",
      has_note: true,
      has_photo: true,
      plant_id: "p1",
      tent_id: "t1",
    },
    timeline: { event_count: 3, latest_entry_id: "d1", linked_directly: true },
    latest_sensor_snapshot: {
      source: "live",
      captured_at: "2026-06-09T11:59:00.000Z",
      confidence: 0.9,
      metric: "temperature",
    },
    latest_ai_doctor: {
      session_id: "s1",
      created_at: "2026-06-09T11:55:00.000Z",
      had_plant_stage: true,
      had_medium: true,
      had_pot_size: true,
      had_recent_log: true,
      had_recent_photo: true,
      had_recent_sensor_snapshot: true,
      had_alerts: true,
    },
    latest_alert: {
      id: "a1",
      metric: "vpd",
      severity: "warning",
      reason: "reason",
      status: "active",
      created_at: "2026-06-09T11:50:00.000Z",
    },
    latest_action_queue: {
      id: "aq1",
      status: "pending_approval",
      approval_required: true,
      has_device_command: false,
      reason: "review",
      risk_level: "low",
      linked_alert_id: null,
    },
    latest_follow_up: {
      id: "f1",
      kind: "diary",
      entry_at: "2026-06-09T11:59:30.000Z",
    },
    now_ms: NOW_MS,
  };
}

function hasUnsafeHealthyClaim(text: string): boolean {
  const forbidden = /\b(healthy|ok|success|verified|all[- ]green|safe)\b/i;
  if (!forbidden.test(text)) return false;
  // Allow honest negations like "not healthy" / "never healthy".
  if (/\b(not|never|no|non-)\s+(healthy|ok|success|verified|safe)\b/i.test(text)) {
    return false;
  }
  return true;
}

describe("resolveTopOneTentLoopGap", () => {
  it("returns 'no blocking gap' when every step is passed", () => {
    const rows = evaluateLoop(baseEvidence());
    const gap = resolveTopOneTentLoopGap(rows);
    expect(gap.step_key).toBe("none");
    expect(gap.status).toBe("resolved");
    expect(gap.is_real_data_gap).toBe(false);
    expect(gap.blocked_downstream_steps).toEqual([]);
    expect(Number.isFinite(gap.priority)).toBe(false);
  });

  it("picks missing Grow above every other missing step", () => {
    const ev = baseEvidence();
    ev.grow = null;
    ev.tent = null;
    ev.plant = null;
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    expect(gap.step_key).toBe("grow");
    expect(gap.status).toBe("missing");
    expect(gap.blocked_downstream_steps).toContain("tent");
    expect(gap.blocked_downstream_steps).toContain("ai-doctor");
    expect(gap.is_real_data_gap).toBe(true);
  });

  it("picks missing Tent when Grow present but Tent missing", () => {
    const ev = baseEvidence();
    ev.tent = null;
    ev.plant = null;
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    expect(gap.step_key).toBe("tent");
    expect(gap.blocked_downstream_steps).toContain("plant");
  });

  it("stale sensor snapshot outranks missing AI Doctor", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = {
      source: "live",
      captured_at: "2026-06-09T00:00:00.000Z", // very old
      confidence: 0.9,
      metric: "temperature",
    };
    ev.latest_ai_doctor = null;
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    expect(gap.step_key).toBe("sensor-snapshot");
    expect(["stale", "invalid"]).toContain(gap.status);
    expect(gap.blocked_downstream_steps).toContain("ai-doctor");
  });

  it("demo-only sensor snapshot is treated as a real-data gap", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = {
      source: "demo",
      captured_at: "2026-06-09T11:59:00.000Z",
      confidence: 0.5,
      metric: "temperature",
    };
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    expect(gap.step_key).toBe("sensor-snapshot");
    expect(gap.status).toBe("demo_only");
    expect(gap.is_real_data_gap).toBe(true);
    expect(gap.evidence_kind).toBe("demo_only");
  });

  it("unsafe Action Queue outranks missing follow-up", () => {
    const ev = baseEvidence();
    ev.latest_follow_up = null;
    ev.latest_action_queue = {
      id: "aq1",
      status: "auto_execute",
      approval_required: false,
      has_device_command: true,
      reason: "should not run",
      risk_level: "high",
      linked_alert_id: null,
    };
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    expect(gap.step_key).toBe("action-queue");
    expect(gap.status).toBe("blocked");
    expect(gap.priority).toBeLessThan(10);
  });

  it("missing plant context does not outrank missing Quick Log", () => {
    const ev = baseEvidence();
    ev.plant = { id: "p1", name: "Plant 1", tent_id: "t1" }; // no stage/medium/pot
    ev.latest_quick_log = null;
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    expect(gap.step_key).toBe("quick-log");
  });

  it("is deterministic across runs", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = null;
    const rows = evaluateLoop(ev);
    const a = resolveTopOneTentLoopGap(rows);
    const b = resolveTopOneTentLoopGap(rows);
    expect(a).toEqual(b);
  });

  it("never uses unsafe healthy/ok/verified/success wording", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = {
      source: "demo",
      captured_at: "2026-06-09T11:59:00.000Z",
      confidence: 0.5,
      metric: "temperature",
    };
    const rows = evaluateLoop(ev);
    const ranked = rankOneTentLoopGaps(rows);
    for (const g of ranked) {
      expect(hasUnsafeHealthyClaim(g.title)).toBe(false);
      expect(hasUnsafeHealthyClaim(g.why_it_matters)).toBe(false);
      expect(hasUnsafeHealthyClaim(g.where_to_resolve)).toBe(false);
      expect(hasUnsafeHealthyClaim(g.suggested_next_observation)).toBe(false);
      expect(hasUnsafeHealthyClaim(g.safety_note)).toBe(false);
    }
  });

  it("text block never leaks secret markers", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = null;
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    const text = buildOneTentLoopTopGapTextBlock(gap);
    expect(text).not.toMatch(/service_role/i);
    expect(text).not.toMatch(/bridge_token/i);
    expect(text).not.toMatch(/api_key/i);
    expect(text).not.toMatch(/access_token/i);
  });

  it("resolved gap text block does not claim health", () => {
    const rows = evaluateLoop(baseEvidence());
    const gap = resolveTopOneTentLoopGap(rows);
    const text = buildOneTentLoopTopGapTextBlock(gap);
    expect(hasUnsafeHealthyClaim(text)).toBe(false);
    expect(text).toContain("No blocking real-data gap");
  });
});
