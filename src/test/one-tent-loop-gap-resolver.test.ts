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
  buildOneTentLoopGapEvidenceChecklist,
  buildOneTentLoopTopGapTextBlock,
  rankOneTentLoopGaps,
  resolveTopOneTentLoopGap,
  type OneTentLoopGapEvidenceState,
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
      has_device_control_marker: false,
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
      has_device_control_marker: true,
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

const FORBIDDEN_DOWNSTREAM_WORDS = [
  "proven",
  "verified",
  "healthy",
  "\\bok\\b",
  "success",
  "all good",
  "no issues detected",
  "confirmed safe",
  "validated live",
];

function scrubHonestNegations(input: string): string {
  return input
    .toLowerCase()
    .replace(/cannot be (proven|verified|confirmed)/g, "")
    .replace(/not (proven|verified|healthy|ok|success|confirmed safe|validated live)/g, "")
    .replace(/never (proven|verified|healthy|ok|success)/g, "")
    .replace(/no (proof|success)/g, "");
}

function assertNoUnsafeDownstreamWording(text: string): void {
  const scrubbed = scrubHonestNegations(text);
  for (const w of FORBIDDEN_DOWNSTREAM_WORDS) {
    expect(new RegExp(w, "i").test(scrubbed)).toBe(false);
  }
}

interface WeakTelemetryCase {
  label: string;
  mutate: (ev: LoopEvidence) => void;
  expectedGapStatus: OneTentLoopGapEvidenceState | string;
}

const WEAK_CASES: WeakTelemetryCase[] = [
  {
    label: "demo-only sensor",
    mutate: (ev) => {
      ev.latest_sensor_snapshot = {
        source: "demo",
        captured_at: "2026-06-09T11:59:00.000Z",
        confidence: 0.5,
        metric: "temperature",
      };
    },
    expectedGapStatus: "demo_only",
  },
  {
    label: "stale sensor",
    mutate: (ev) => {
      ev.latest_sensor_snapshot = {
        source: "live",
        captured_at: "2026-06-01T00:00:00.000Z",
        confidence: 0.9,
        metric: "temperature",
      };
    },
    expectedGapStatus: "stale",
  },
  {
    label: "invalid sensor",
    mutate: (ev) => {
      ev.latest_sensor_snapshot = {
        source: "invalid",
        captured_at: "2026-06-09T11:59:00.000Z",
        confidence: 0,
        metric: "temperature",
      };
    },
    expectedGapStatus: "invalid",
  },
  {
    label: "unknown/malformed sensor",
    mutate: (ev) => {
      ev.latest_sensor_snapshot = {
        // Coerced by the presenter to "invalid" upstream; simulate here.
        source: "invalid",
        captured_at: null,
        confidence: null,
        metric: null,
      };
    },
    expectedGapStatus: "invalid",
  },
  {
    label: "missing sensor",
    mutate: (ev) => {
      ev.latest_sensor_snapshot = null;
    },
    expectedGapStatus: "missing",
  },
];

describe("downstream-blocked wording is safe for weak telemetry gaps", () => {
  for (const c of WEAK_CASES) {
    it(`${c.label}: downstream list uses cautious wording only`, () => {
      const ev = baseEvidence();
      c.mutate(ev);
      const rows = evaluateLoop(ev);
      const gap = resolveTopOneTentLoopGap(rows);
      expect(gap.step_key).toBe("sensor-snapshot");
      expect(gap.blocked_downstream_steps.length).toBeGreaterThan(0);
      // Downstream is emitted as bare step ids — assert no unsafe words leak.
      const downstreamText = gap.blocked_downstream_steps.join(" ");
      assertNoUnsafeDownstreamWording(downstreamText);
      // The text block also renders downstream + header.
      const textBlock = buildOneTentLoopTopGapTextBlock(gap);
      assertNoUnsafeDownstreamWording(textBlock);
    });
  }
});

describe("buildOneTentLoopGapEvidenceChecklist", () => {
  it("returns empty checklist when no blocking gap", () => {
    const rows = evaluateLoop(baseEvidence());
    const gap = resolveTopOneTentLoopGap(rows);
    expect(gap.evidence_checklist).toEqual([]);
  });

  it("missing sensor gap: downstream AI Doctor/Alert/Action Queue are not present", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = null;
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    expect(gap.step_key).toBe("sensor-snapshot");
    const byStep = new Map(gap.evidence_checklist.map((i) => [i.step_key, i]));
    expect(byStep.get("sensor-snapshot")?.state).toBe("missing");
    for (const s of ["ai-doctor", "alert", "action-queue"] as const) {
      const item = byStep.get(s);
      expect(item).toBeDefined();
      expect(item!.state).not.toBe("present");
    }
    expect(byStep.get("grow")?.state).toBe("present");
    expect(byStep.get("tent")?.state).toBe("present");
    expect(byStep.get("plant")?.state).toBe("present");
  });

  it("demo-only sensor gap: downstream marked weak, not present", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = {
      source: "demo",
      captured_at: "2026-06-09T11:59:00.000Z",
      confidence: 0.5,
      metric: "temperature",
    };
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    const byStep = new Map(gap.evidence_checklist.map((i) => [i.step_key, i]));
    expect(byStep.get("sensor-snapshot")?.state).toBe("demo_only");
    for (const s of ["ai-doctor", "alert", "action-queue"] as const) {
      expect(byStep.get(s)?.state).toBe("weak");
    }
  });

  it("invalid sensor gap: downstream marked blocked", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = {
      source: "invalid",
      captured_at: "2026-06-09T11:59:00.000Z",
      confidence: 0,
      metric: "temperature",
    };
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    const byStep = new Map(gap.evidence_checklist.map((i) => [i.step_key, i]));
    expect(byStep.get("sensor-snapshot")?.state).toBe("invalid");
    for (const s of ["ai-doctor", "alert", "action-queue"] as const) {
      expect(byStep.get(s)?.state).toBe("blocked");
    }
  });

  it("missing quick-log gap: timeline blocked, sensor still present, later steps weakened", () => {
    const ev = baseEvidence();
    ev.latest_quick_log = null;
    ev.timeline = null;
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    expect(gap.step_key).toBe("quick-log");
    const byStep = new Map(gap.evidence_checklist.map((i) => [i.step_key, i]));
    expect(byStep.get("grow")?.state).toBe("present");
    expect(byStep.get("tent")?.state).toBe("present");
    expect(byStep.get("plant")?.state).toBe("present");
    expect(byStep.get("quick-log")?.state).toBe("missing");
    expect(byStep.get("timeline")?.state).not.toBe("present");
  });

  it("never emits unsafe healthy/ok/verified wording in checklist", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = null;
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    for (const item of gap.evidence_checklist) {
      expect(hasUnsafeHealthyClaim(item.label)).toBe(false);
      expect(hasUnsafeHealthyClaim(item.why_it_matters)).toBe(false);
    }
  });

  it("never exposes secret markers in checklist", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = null;
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    const dumped = JSON.stringify(gap.evidence_checklist);
    expect(dumped).not.toMatch(/service_role/i);
    expect(dumped).not.toMatch(/bridge_token/i);
    expect(dumped).not.toMatch(/api_key/i);
    expect(dumped).not.toMatch(/access_token/i);
    expect(dumped).not.toMatch(/raw_payload/i);
    // No JWT-shaped strings.
    expect(dumped).not.toMatch(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\./);
  });

  it("is deterministic across runs (also for direct helper)", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = null;
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    const a = buildOneTentLoopGapEvidenceChecklist(rows, gap);
    const b = buildOneTentLoopGapEvidenceChecklist(rows, gap);
    expect(a).toEqual(b);
  });
});

describe("text-block report parity", () => {
  it("contains every top-gap field exactly (label + values)", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = null;
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    const text = buildOneTentLoopTopGapTextBlock(gap);
    expect(text).toContain(`- Step: ${gap.step_key}`);
    expect(text).toContain(`- Title: ${gap.title}`);
    expect(text).toContain(`- Status: ${gap.status}`);
    expect(text).toContain(`- Evidence kind: ${gap.evidence_kind}`);
    expect(text).toContain(`- Why it matters: ${gap.why_it_matters}`);
    expect(text).toContain(`- Where to resolve: ${gap.where_to_resolve}`);
    expect(text).toContain(`- Suggested next observation: ${gap.suggested_next_observation}`);
    expect(text).toContain(`- Safety note: ${gap.safety_note}`);
    for (const step of gap.blocked_downstream_steps) {
      expect(text).toContain(`    - ${step}`);
    }
    for (const item of gap.evidence_checklist) {
      expect(text).toContain(item.label);
      expect(text).toContain(`[${item.state}]`);
      expect(text).toContain(item.why_it_matters);
    }
    // No unsafe wording, no secrets.
    assertNoUnsafeDownstreamWording(text);
    expect(text).not.toMatch(/service_role|bridge_token|api_key|access_token|raw_payload/i);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\./);
  });

  it("includes source label in checklist line when present", () => {
    const ev = baseEvidence();
    ev.latest_sensor_snapshot = {
      source: "demo",
      captured_at: "2026-06-09T11:59:00.000Z",
      confidence: 0.5,
      metric: "temperature",
    };
    const rows = evaluateLoop(ev);
    const gap = resolveTopOneTentLoopGap(rows);
    const text = buildOneTentLoopTopGapTextBlock(gap);
    const sensorItem = gap.evidence_checklist.find((i) => i.step_key === "sensor-snapshot");
    if (sensorItem?.source_label) {
      expect(text).toContain(`source=${sensorItem.source_label}`);
    }
  });
});
