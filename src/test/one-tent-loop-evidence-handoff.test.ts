/**
 * One-Tent Loop Evidence Handoff — chain fixture test.
 *
 * Fixture-driven walk of a single plant/tent loop:
 *   Timeline diary note + photo metadata + manual sensor snapshot
 *     + stale/invalid sensor reading
 *   → AI Doctor sensor context (per reading)
 *   → Alert candidate (manually constructed, never auto-persisted)
 *   → Action Suggestion (pure handoff)
 *   → Approval / Rejection (pure transitions, no I/O)
 *
 * Invariants pinned:
 *   - plant_id / tent_id / grow_id stay consistent through every hop.
 *   - source labels stay visible and never collapse to "live" for
 *     manual / demo / stale / invalid evidence.
 *   - stale / invalid / demo evidence is never presented as trusted live.
 *   - AI Doctor stays cautious (no certainty, missing context surfaced).
 *   - Action suggestions are approval-required and non-executable.
 *   - No device-control / command / setpoint fields on the suggestion
 *     or approved queued action.
 *   - Output is deterministic across two runs of the same fixture.
 *
 * Pure: no Supabase, no fetch, no React, no hooks.
 */

import { describe, it, expect } from "vitest";

import {
  type NormalizedSensorReading,
  type ReadingSource,
} from "@/lib/sensorReadingNormalizationRules";
import {
  mapSensorReadingToAiDoctorContext,
  type AiDoctorSensorContext,
} from "@/lib/aiDoctorSensorContextRules";
import {
  createActionSuggestion,
  approveSuggestion,
  rejectSuggestion,
  type ActionSuggestion,
  type ApprovedQueuedAction,
} from "@/lib/alertActionQueueHandoffRules";
import type { AlertLike } from "@/lib/alertToActionQueueRules";

// ---------------------------------------------------------------------------
// Fixture — single tent, single plant, single grow.
// ---------------------------------------------------------------------------

const GROW_ID = "grow-onetent-001";
const TENT_ID = "tent-onetent-001";
const PLANT_ID = "plant-onetent-001";

const FIXED_NOW = "2026-06-27T12:00:00.000Z";
const READING_AT = "2026-06-27T11:55:00.000Z";

interface TimelineEvidence {
  type: "diary_note" | "photo" | "manual_snapshot" | "sensor_reading";
  id: string;
  grow_id: string;
  tent_id: string;
  plant_id: string;
  source: ReadingSource | "manual_entry" | "user_photo";
  captured_at: string;
}

const timeline: TimelineEvidence[] = [
  {
    type: "diary_note",
    id: "diary-001",
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    source: "manual_entry",
    captured_at: "2026-06-27T11:30:00.000Z",
  },
  {
    type: "photo",
    id: "photo-001",
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    source: "user_photo",
    captured_at: "2026-06-27T11:45:00.000Z",
  },
  {
    type: "manual_snapshot",
    id: "manual-snap-001",
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    source: "manual",
    captured_at: "2026-06-27T11:50:00.000Z",
  },
  {
    type: "sensor_reading",
    id: "reading-stale-001",
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    source: "stale",
    captured_at: "2026-06-27T08:00:00.000Z",
  },
  {
    type: "sensor_reading",
    id: "reading-invalid-001",
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    source: "invalid",
    captured_at: READING_AT,
  },
];

function makeReading(source: ReadingSource, capturedAt: string): NormalizedSensorReading {
  return {
    captured_at: capturedAt,
    source,
    temperature_c: source === "invalid" ? null : 27.4,
    humidity_pct: source === "invalid" ? null : 55,
    vpd_kpa: source === "invalid" ? null : 1.45,
    co2_ppm: null,
    soil_moisture_pct: null,
    raw_payload: { fixture: true, source },
  };
}

function openAlert(metric: string, reason: string): AlertLike {
  return {
    id: `alert-${metric}`,
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    status: "open",
    severity: "warning",
    metric,
    reason,
    title: `Review ${metric}`,
    source: "environment",
  };
}

// ---------------------------------------------------------------------------
// Forbidden surface tokens for suggestion outputs.
// ---------------------------------------------------------------------------

const FORBIDDEN_COMMAND_FIELDS = [
  "command",
  "device_command",
  "deviceCommand",
  "setpoint",
  "set_point",
  "controller",
  "controllerId",
  "actuator",
  "execute",
  "executed",
];

const FORBIDDEN_OUTPUT_PHRASES = [
  "automatically applied",
  "executed",
  "device command sent",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "apply pesticide",
];

function flatStrings(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flatStrings);
  if (typeof value === "object") return Object.values(value as object).flatMap(flatStrings);
  return [];
}

function expectNoForbiddenCopy(strings: string[]) {
  const haystack = strings.join("\n").toLowerCase();
  for (const phrase of FORBIDDEN_OUTPUT_PHRASES) {
    // "Executed" alone appears legitimately only inside negation copy ("do not execute...").
    // Per-line check: skip lines containing a negation marker.
    const lines = haystack.split("\n");
    for (const line of lines) {
      if (!line.includes(phrase)) continue;
      const negated =
        line.includes("do not") ||
        line.includes("never") ||
        line.includes("must not") ||
        line.includes("no automated") ||
        line.includes("without grower") ||
        line.includes("without manual");
      if (!negated) {
        throw new Error(`Forbidden output phrase "${phrase}" appeared in: "${line}"`);
      }
    }
  }
}

function expectNoForbiddenFields(obj: object) {
  const keys = Object.keys(obj);
  for (const k of keys) {
    expect(
      FORBIDDEN_COMMAND_FIELDS.includes(k),
      `Suggestion/queued-action exposes forbidden field "${k}"`,
    ).toBe(false);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("One-Tent Loop Evidence Handoff — chain invariants", () => {
  it("timeline fixture keeps grow/tent/plant IDs consistent across every event", () => {
    expect(timeline.length).toBeGreaterThan(0);
    for (const ev of timeline) {
      expect(ev.grow_id).toBe(GROW_ID);
      expect(ev.tent_id).toBe(TENT_ID);
      expect(ev.plant_id).toBe(PLANT_ID);
    }
  });

  it("preserves distinct source labels (manual / stale / invalid) — no collapse to 'live'", () => {
    const sources = new Set(timeline.map((e) => e.source));
    expect(sources.has("manual")).toBe(true);
    expect(sources.has("stale")).toBe(true);
    expect(sources.has("invalid")).toBe(true);
    expect(sources.has("live" as ReadingSource)).toBe(false);
  });

  it("manual snapshot → AI Doctor context preserves source and adds cautious safety note", () => {
    const reading = makeReading("manual", "2026-06-27T11:50:00.000Z");
    const ctx: AiDoctorSensorContext = mapSensorReadingToAiDoctorContext(reading);
    expect(ctx.sourceState).toBe("manual");
    expect(ctx.isStale).toBe(false);
    expect(ctx.isInvalid).toBe(false);
    expect(ctx.safetyNotes.join(" ")).toMatch(/cannot confirm or deny plant health with certainty/i);
  });

  it("stale reading → AI Doctor context flags stale and reduces confidence", () => {
    const reading = makeReading("stale", "2026-06-27T08:00:00.000Z");
    const ctx = mapSensorReadingToAiDoctorContext(reading);
    expect(ctx.isStale).toBe(true);
    expect(ctx.isInvalid).toBe(false);
    expect(["reduced", "severely-reduced", "untrusted"]).toContain(ctx.confidenceImpact);
    // never healthy near stale
    expect(ctx.contextSummary.toLowerCase()).not.toMatch(/\bhealthy\b/);
  });

  it("invalid reading → AI Doctor context marks invalid and untrusted", () => {
    const reading = makeReading("invalid", READING_AT);
    const ctx = mapSensorReadingToAiDoctorContext(reading);
    expect(ctx.isInvalid).toBe(true);
    expect(ctx.confidenceImpact).toBe("untrusted");
    expect(ctx.contextSummary.toLowerCase()).not.toMatch(/\bhealthy\b/);
  });

  it("alert + manual context → suggestion is approval-required, non-executable, source-truthful", () => {
    const reading = makeReading("manual", "2026-06-27T11:50:00.000Z");
    const ctx = mapSensorReadingToAiDoctorContext(reading);
    const result = createActionSuggestion({
      alert: openAlert("temperature_c", "Temperature trending high"),
      sensorContext: ctx,
      sensorContextId: "ctx-manual-001",
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s: ActionSuggestion = result.suggestion;
    expect(s.status).toBe("pending_approval");
    expect(s.sourceContext.sourceState).toBe("manual");
    expect(s.sensorContextId).toBe("ctx-manual-001");
    expect(s.originatingAlertId).toBe("alert-temperature_c");
    expectNoForbiddenFields(s);
    expectNoForbiddenCopy(flatStrings(s));
  });

  it("invalid telemetry → suggestion caps risk at 'low' and adds invalid-telemetry caution", () => {
    const reading = makeReading("invalid", READING_AT);
    const ctx = mapSensorReadingToAiDoctorContext(reading);
    const result = createActionSuggestion({
      alert: openAlert("temperature_c", "Sensor failure suspected"),
      sensorContext: ctx,
      sensorContextId: "ctx-invalid-001",
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.riskLevel).toBe("low");
    expect(result.suggestion.cautionNotes.join(" ").toLowerCase()).toMatch(/invalid/);
    // Healthy must never appear near invalid telemetry copy.
    const haystack = flatStrings(result.suggestion).join("\n").toLowerCase();
    expect(haystack).not.toMatch(/\bhealthy\b/);
  });

  it("demo source surfaces a demo-data caution and is never trusted as live", () => {
    const reading = makeReading("demo", READING_AT);
    const ctx = mapSensorReadingToAiDoctorContext(reading);
    const result = createActionSuggestion({
      alert: openAlert("humidity_pct", "Humidity above target"),
      sensorContext: ctx,
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.sourceContext.sourceState).toBe("demo");
    expect(
      result.suggestion.cautionNotes.some((n) => /demo/i.test(n)),
      "expected at least one demo-data caution",
    ).toBe(true);
  });

  it("approveSuggestion → queued, non-executable, no command/setpoint fields", () => {
    const reading = makeReading("manual", "2026-06-27T11:50:00.000Z");
    const ctx = mapSensorReadingToAiDoctorContext(reading);
    const created = createActionSuggestion({
      alert: openAlert("vpd_kpa", "VPD drifting high"),
      sensorContext: ctx,
      now: FIXED_NOW,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const approval = approveSuggestion(created.suggestion, "Reviewed and accepted", FIXED_NOW);
    expect(approval.ok).toBe(true);
    if (!approval.ok) return;
    const q: ApprovedQueuedAction = approval.queuedAction;
    expect(q.status).toBe("queued_non_executable");
    expectNoForbiddenFields(q);
    expectNoForbiddenCopy(flatStrings(q));
  });

  it("rejectSuggestion → grower-attributed audit record, no execution side effects", () => {
    const reading = makeReading("stale", "2026-06-27T08:00:00.000Z");
    const ctx = mapSensorReadingToAiDoctorContext(reading);
    const created = createActionSuggestion({
      alert: openAlert("temperature_c", "Temperature out of band"),
      sensorContext: ctx,
      now: FIXED_NOW,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const rejected = rejectSuggestion(created.suggestion, "Will verify manually", FIXED_NOW);
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.record.rejectedBy).toBe("grower");
    expect(rejected.record.reason).toMatch(/manually/i);
  });

  it("same fixture → deterministic suggestion output across two runs", () => {
    const reading = makeReading("manual", "2026-06-27T11:50:00.000Z");
    const ctx1 = mapSensorReadingToAiDoctorContext(reading);
    const ctx2 = mapSensorReadingToAiDoctorContext(reading);
    const r1 = createActionSuggestion({
      alert: openAlert("humidity_pct", "Humidity above target"),
      sensorContext: ctx1,
      sensorContextId: "ctx-det-001",
      now: FIXED_NOW,
    });
    const r2 = createActionSuggestion({
      alert: openAlert("humidity_pct", "Humidity above target"),
      sensorContext: ctx2,
      sensorContextId: "ctx-det-001",
      now: FIXED_NOW,
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.suggestion).toEqual(r2.suggestion);
  });

  it("missing sensor context → fallback still emits cautious telemetry note", () => {
    const result = createActionSuggestion({
      alert: openAlert("temperature_c", "Temperature trending high"),
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.status).toBe("pending_approval");
    expect(
      result.suggestion.sourceContext.safetyNotes.some((n) =>
        /cannot confirm or deny plant health with certainty/i.test(n),
      ),
    ).toBe(true);
  });

  it("no AI Doctor or suggestion output recommends a device/automation action", () => {
    const sources: ReadingSource[] = ["manual", "stale", "invalid", "demo", "live"];
    for (const src of sources) {
      const reading = makeReading(src, READING_AT);
      const ctx = mapSensorReadingToAiDoctorContext(reading);
      const result = createActionSuggestion({
        alert: openAlert("temperature_c", "Temperature trending high"),
        sensorContext: ctx,
        now: FIXED_NOW,
      });
      if (!result.ok) continue;
      expectNoForbiddenCopy(flatStrings(result.suggestion));
    }
  });
});
