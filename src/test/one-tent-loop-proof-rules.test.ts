/**
 * One-Tent Loop Proof — pure rules tests.
 *
 * Covers happy path, missing/blocked propagation, stale/invalid/demo
 * telemetry safety, Action Queue approval-required guard, device-command
 * safety flag, and AI Doctor missing-context enumeration.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateLoop,
  evaluateSensorSnapshot,
  evaluateActionQueue,
  evaluateAiDoctor,
  enrichLoopStepRow,
  LOOP_STEP_IDS,
  type LoopEvidence,
  type LoopStepRow,
  type SensorSourceLabel,
} from "@/lib/oneTentLoopProofRules";


const NOW = Date.parse("2026-06-09T12:00:00.000Z");

function fresh(): LoopEvidence {
  return {
    grow: { id: "g1", name: "Grow A", stage: "veg", status: "active" },
    tent: { id: "t1", name: "Tent A", grow_id: "g1", has_environment_target: true },
    plant: {
      id: "p1",
      name: "Plant A",
      stage: "veg",
      medium: "coco",
      pot_size: "3 gal",
      tent_id: "t1",
    },
    latest_quick_log: {
      id: "d1",
      entry_at: "2026-06-09T11:00:00.000Z",
      entry_type: "note",
      has_note: true,
      has_photo: true,
      has_action_context: false,
      plant_id: "p1",
      tent_id: "t1",
    },
    timeline: { event_count: 5, latest_entry_id: "d1", linked_directly: true },
    latest_sensor_snapshot: {
      source: "live",
      captured_at: "2026-06-09T11:55:00.000Z",
      confidence: 0.9,
      metric: "temp",
    },
    latest_ai_doctor: {
      session_id: "s1",
      created_at: "2026-06-09T11:30:00.000Z",
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
      metric: "temp",
      severity: "warning",
      reason: "temp above target",
      status: "open",
      created_at: "2026-06-09T11:00:00.000Z",
    },
    latest_action_queue: {
      id: "aq1",
      status: "pending_approval",
      approval_required: true,
      has_device_command: false,
      reason: "raise humidity",
      risk_level: "low",
      linked_alert_id: "a1",
    },
    latest_follow_up: { id: "f1", kind: "diary", entry_at: "2026-06-09T11:40:00.000Z" },
    now_ms: NOW,
  };
}

describe("oneTentLoopProofRules — evaluateLoop", () => {
  it("returns all 10 loop steps in canonical order", () => {
    const rows = evaluateLoop(fresh());
    expect(rows.map((r) => r.id)).toEqual([...LOOP_STEP_IDS]);
  });

  it("complete fresh evidence marks all steps passed", () => {
    const rows = evaluateLoop(fresh());
    for (const r of rows) expect(r.status).toBe("passed");
  });

  it("missing grow blocks tent and plant downstream", () => {
    const rows = evaluateLoop({ ...fresh(), grow: null, tent: null, plant: null });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(byId["grow"]).toBe("missing");
    expect(byId["tent"]).toBe("blocked");
    expect(byId["plant"]).toBe("blocked");
  });

  it("missing tent blocks plant + quick log evaluation", () => {
    const ev = fresh();
    ev.tent = null;
    ev.plant = null;
    ev.latest_quick_log = null;
    const rows = evaluateLoop(ev);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(byId["tent"]).toBe("missing");
    expect(byId["plant"]).toBe("blocked");
    expect(byId["quick-log"]).toBe("blocked");
  });

  it("plant with missing stage/medium/pot_size returns needs_review", () => {
    const ev = fresh();
    ev.plant = { id: "p1", name: "P", tent_id: "t1" };
    const rows = evaluateLoop(ev);
    const plant = rows.find((r) => r.id === "plant")!;
    expect(plant.status).toBe("needs_review");
    expect(plant.missing_info.join(" ")).toMatch(/Stage unknown/);
    expect(plant.missing_info.join(" ")).toMatch(/Medium unknown/);
    expect(plant.missing_info.join(" ")).toMatch(/Pot size unknown/);
  });
});

describe("evaluateSensorSnapshot — never healthy for bad data", () => {
  it("missing snapshot is missing (never passed)", () => {
    const row = evaluateSensorSnapshot(null, NOW);
    expect(row.status).toBe("missing");
    expect(row.safety_note.toLowerCase()).toMatch(/never shown as healthy/);
  });
  it("invalid source is invalid", () => {
    const row = evaluateSensorSnapshot(
      { source: "invalid", captured_at: "2026-06-09T11:59:00.000Z" },
      NOW,
    );
    expect(row.status).toBe("invalid");
  });
  it("demo source is demo_only", () => {
    const row = evaluateSensorSnapshot(
      { source: "demo", captured_at: "2026-06-09T11:59:00.000Z" },
      NOW,
    );
    expect(row.status).toBe("demo_only");
  });
  it("live snapshot older than 15 min is stale", () => {
    const row = evaluateSensorSnapshot(
      { source: "live", captured_at: "2026-06-09T11:30:00.000Z" },
      NOW,
    );
    expect(row.status).toBe("stale");
  });
  it("manual snapshot within 24h is needs_review (not live)", () => {
    const row = evaluateSensorSnapshot(
      { source: "manual", captured_at: "2026-06-09T05:00:00.000Z" },
      NOW,
    );
    expect(row.status).toBe("needs_review");
    expect(row.safety_note.toLowerCase()).toMatch(/manual reading/);
  });
  it("fresh live snapshot is passed", () => {
    const row = evaluateSensorSnapshot(
      { source: "live", captured_at: "2026-06-09T11:55:00.000Z" },
      NOW,
    );
    expect(row.status).toBe("passed");
  });
});

describe("evaluateAiDoctor — missing context enumerated", () => {
  it("missing session is missing", () => {
    const row = evaluateAiDoctor(null);
    expect(row.status).toBe("missing");
  });
  it("lists exactly which context pieces are missing", () => {
    const row = evaluateAiDoctor({
      session_id: "s1",
      created_at: "2026-06-09T11:00:00.000Z",
      had_plant_stage: false,
      had_medium: false,
      had_pot_size: true,
      had_recent_log: true,
      had_recent_photo: false,
      had_recent_sensor_snapshot: true,
      had_alerts: false,
    });
    expect(row.status).toBe("needs_review");
    const joined = row.missing_info.join(" ");
    expect(joined).toMatch(/plant stage/);
    expect(joined).toMatch(/medium/);
    expect(joined).toMatch(/recent photo/);
    expect(joined).toMatch(/alerts/);
    expect(joined).not.toMatch(/pot size/);
  });
});

describe("evaluateActionQueue — approval-required and no device command", () => {
  it("missing row is missing", () => {
    const row = evaluateActionQueue(null);
    expect(row.status).toBe("missing");
    expect(row.safety_note.toLowerCase()).toMatch(/approval required/);
    expect(row.safety_note.toLowerCase()).toMatch(/no device command/);
  });
  it("row with device command is blocked as unsafe", () => {
    const row = evaluateActionQueue({
      id: "aq1",
      status: "pending_approval",
      approval_required: true,
      has_device_command: true,
    });
    expect(row.status).toBe("blocked");
    expect(row.missing_info.join(" ").toLowerCase()).toMatch(/executable device command/);
  });
  it("row not marked approval_required is blocked", () => {
    const row = evaluateActionQueue({
      id: "aq1",
      status: "queued",
      approval_required: false,
      has_device_command: false,
    });
    expect(row.status).toBe("blocked");
  });
  it("approval-required row without device command is passed", () => {
    const row = evaluateActionQueue({
      id: "aq1",
      status: "pending_approval",
      approval_required: true,
      has_device_command: false,
      reason: "raise rh",
      risk_level: "low",
      linked_alert_id: "a1",
    });
    expect(row.status).toBe("passed");
    expect(row.evidence.join(" ").toLowerCase()).toMatch(/approval required/);
    expect(row.evidence.join(" ").toLowerCase()).toMatch(/no device command/);
  });
});
