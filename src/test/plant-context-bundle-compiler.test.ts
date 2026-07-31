/**
 * Plant Context Compiler (Build 3) — deterministic context assembly.
 *
 * Locks: the canonical Build 1 bundle as the identity core, sensor
 * summarization routed exclusively through the Build 2 truth gate,
 * reuse of the canonical timeline merge/ordering, honest gap reporting
 * (never inference), window boundaries, caps, and determinism.
 */

import { describe, it, expect } from "vitest";
import {
  PLANT_CONTEXT_CAPS,
  PLANT_CONTEXT_WINDOWS,
  buildCompactTimeline,
  compilePlantContextBundle,
  identifyContextGaps,
  summarizeRecentActions,
  summarizeSensorWindow,
  type CompilePlantContextBundleInput,
} from "@/lib/plantContextBundleCompiler";
import { serializeSkillContract } from "@/lib/verdantSkillSchemas";
import { AI_DOCTOR_SNAPSHOT_FRESH_HOURS } from "@/constants/aiDoctorContextReadiness";

const NOW_MS = Date.parse("2026-07-30T12:00:00.000Z");
const GROW = "11111111-1111-4111-8111-111111111111";
const TENT = "22222222-2222-4222-8222-222222222222";
const PLANT = "33333333-3333-4333-8333-333333333333";
const CTX = "ctx-2026-07-30.1";

function hoursAgo(h: number): string {
  return new Date(NOW_MS - h * 60 * 60 * 1000).toISOString();
}
function daysAgo(d: number): string {
  return hoursAgo(d * 24);
}

function makeInput(
  overrides: Partial<CompilePlantContextBundleInput> = {},
): CompilePlantContextBundleInput {
  return {
    plant: {
      id: PLANT,
      grow_id: GROW,
      tent_id: TENT,
      strain: "Sour Ishizaka",
      stage: "late_flower",
      medium: "coco",
      pot_size: "11L",
    },
    growEvents: [
      { id: "ge-1", occurred_at: hoursAgo(6), event_type: "watering", source: "manual" },
    ],
    diaryEntries: [{ id: "de-1", entry_at: hoursAgo(5), note: "Leaves look fine." }],
    sensorReadings: [
      {
        metric: "temperature_c",
        value: 25,
        unit: "°C",
        captured_at: hoursAgo(0.1),
        source: "live",
        quality: "ok",
      },
      {
        metric: "humidity_pct",
        value: 62,
        unit: "%",
        captured_at: hoursAgo(0.1),
        source: "live",
        quality: "ok",
      },
    ],
    ...overrides,
  };
}

function compile(overrides: Partial<CompilePlantContextBundleInput> = {}) {
  const r = compilePlantContextBundle(makeInput(overrides), {
    nowMs: NOW_MS,
    contextVersion: CTX,
  });
  if (r.ok === false) throw new Error(`compile failed: ${r.issues.join("; ")}`);
  return r.compilation;
}

describe("canonical bundle core", () => {
  it("produces the Build 1 PlantContextBundle as its identity core", () => {
    const c = compile();
    expect(c.bundle.contractVersion).toBe("1.0.0");
    expect(c.bundle.growId).toBe(GROW);
    expect(c.bundle.tentId).toBe(TENT);
    expect(c.bundle.plantId).toBe(PLANT);
    expect(c.bundle.stage).toBe("late_flower");
    expect(c.bundle.medium).toBe("coco");
    expect(c.contextVersion).toBe(CTX);
  });

  it("reuses the established windows rather than inventing new ones", () => {
    expect(PLANT_CONTEXT_WINDOWS.actionDays).toBe(14);
    expect(PLANT_CONTEXT_WINDOWS.sensorDays).toBe(7);
    // The build sketch suggested 72h; the repo already exports 48h for
    // the AI-context freshness tier, so that established value wins.
    expect(PLANT_CONTEXT_WINDOWS.immediateHours).toBe(AI_DOCTOR_SNAPSHOT_FRESH_HOURS);
    expect(PLANT_CONTEXT_WINDOWS.immediateHours).toBe(48);
  });

  it("rejects compilation without plant and grow identity", () => {
    const noPlant = compilePlantContextBundle(
      { ...makeInput(), plant: null },
      { nowMs: NOW_MS, contextVersion: CTX },
    );
    expect(noPlant.ok).toBe(false);
    const noGrow = compilePlantContextBundle(
      { ...makeInput(), plant: { id: PLANT }, grow: null },
      { nowMs: NOW_MS, contextVersion: CTX },
    );
    expect(noGrow.ok).toBe(false);
  });
});

describe("empty and partial histories", () => {
  it("compiles an empty plant history and reports every gap", () => {
    const c = compile({
      plant: { id: PLANT, grow_id: GROW, tent_id: TENT },
      growEvents: [],
      diaryEntries: [],
      sensorReadings: [],
    });
    expect(c.recentActions).toEqual([]);
    expect(c.compactTimeline).toEqual([]);
    expect(c.sensorSummary.includedCount).toBe(0);
    expect(c.bundle.latestSnapshot).toBeNull();
    expect(c.completenessScore).toBe(0);
    for (const slot of ["stage", "strain", "medium", "pot_size", "targets"]) {
      expect(c.missingInformation).toContain(slot);
    }
  });

  it("compiles logs-only and sensors-only histories", () => {
    const logsOnly = compile({ sensorReadings: [] });
    expect(logsOnly.recentActions.length).toBeGreaterThan(0);
    expect(logsOnly.sensorSummary.includedCount).toBe(0);
    expect(logsOnly.missingInformation).toContain("sensor_readings");
    const sensorsOnly = compile({ growEvents: [], diaryEntries: [] });
    expect(sensorsOnly.recentActions).toEqual([]);
    expect(sensorsOnly.sensorSummary.includedCount).toBeGreaterThan(0);
    expect(sensorsOnly.missingInformation).toContain("recent_actions");
  });

  it("reports a missing stage instead of inferring one", () => {
    const c = compile({
      plant: { id: PLANT, grow_id: GROW, tent_id: TENT, strain: "Sour Ishizaka" },
    });
    expect(c.bundle.stage).toBeNull();
    expect(c.missingInformation).toContain("stage");
  });

  it("never infers grower actions that were not recorded", () => {
    const c = compile({ growEvents: [] });
    expect(c.recentActions).toEqual([]);
    expect(c.missingInformation).toContain("recent_actions");
  });
});

describe("sensor summarization routes through the truth gate", () => {
  it("excludes stale, invalid, and demo readings from healthy evidence", () => {
    const c = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
        },
        // Live but well past the 15-minute live window → stale.
        {
          metric: "temperature_c",
          value: 40,
          unit: "°C",
          captured_at: hoursAgo(5),
          source: "live",
        },
        // Out of range → invalid.
        {
          metric: "humidity_pct",
          value: 900,
          unit: "%",
          captured_at: hoursAgo(0.1),
          source: "live",
        },
        // Demo never counts as evidence.
        {
          metric: "co2_ppm",
          value: 800,
          unit: "ppm",
          captured_at: hoursAgo(0.1),
          source: "demo",
        },
      ],
    });
    const temp = c.sensorSummary.metrics.find((m) => m.metric === "temperature_c");
    expect(temp?.usableCount).toBe(1);
    expect(temp?.latestValue).toBe(25);
    expect(c.sensorSummary.excludedCount).toBeGreaterThan(0);
    const co2 = c.sensorSummary.metrics.find((m) => m.metric === "co2_ppm");
    expect(co2?.usableCount).toBe(0);
    expect(c.sourceWarnings.join(" ")).toContain("demo");
  });

  it("keeps mixed-source readings distinguishable in the source counts", () => {
    const c = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
        },
        {
          metric: "humidity_pct",
          value: 60,
          unit: "%",
          captured_at: hoursAgo(2),
          source: "manual",
        },
        {
          metric: "co2_ppm",
          value: 700,
          unit: "ppm",
          captured_at: hoursAgo(3),
          source: "csv",
        },
      ],
    });
    const labels = c.sensorSummary.sourceCounts.map((s) => s.source);
    expect(labels).toContain("live");
    expect(labels).toContain("manual");
    expect(labels).toContain("csv");
  });

  it("surfaces conflicting readings without flattening them", () => {
    const reading = (value: number, deviceSuffix: string) => ({
      metric: "temperature_c",
      value,
      unit: "°C",
      captured_at: hoursAgo(0.1),
      source: `live${deviceSuffix}`.slice(0, 4),
    });
    const c = compile({
      sensorReadings: [reading(20, "a"), reading(28, "b")],
    });
    expect(c.sensorSummary.conflicts.length).toBeGreaterThan(0);
    expect(c.conflictingEvidence.join(" ")).toContain("disagree");
  });

  it("stamps the canonical snapshot only from gate-usable values", () => {
    const usable = compile();
    expect(usable.bundle.latestSnapshot?.source).toBe("live");
    expect(usable.bundle.latestSnapshot?.temperatureC).toBe(25);
    // All readings excluded → no snapshot at all, not a hopeful one.
    const none = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "demo",
        },
      ],
    });
    expect(none.bundle.latestSnapshot).toBeNull();
  });
});

describe("windows and caps", () => {
  it("honors the action window boundary", () => {
    const inside = summarizeRecentActions([{ occurred_at: daysAgo(13), event_type: "watering" }], {
      nowMs: NOW_MS,
      windowDays: 14,
      immediateHours: 48,
    });
    expect(inside).toHaveLength(1);
    const outside = summarizeRecentActions([{ occurred_at: daysAgo(15), event_type: "watering" }], {
      nowMs: NOW_MS,
      windowDays: 14,
      immediateHours: 48,
    });
    expect(outside).toEqual([]);
  });

  it("marks actions inside the immediate-change window", () => {
    const actions = summarizeRecentActions(
      [
        { occurred_at: hoursAgo(6), event_type: "watering" },
        { occurred_at: hoursAgo(100), event_type: "feeding" },
      ],
      { nowMs: NOW_MS, windowDays: 14, immediateHours: 48 },
    );
    expect(actions.find((a) => a.eventType === "watering")?.immediate).toBe(true);
    expect(actions.find((a) => a.eventType === "feeding")?.immediate).toBe(false);
  });

  it("honors the sensor window boundary", () => {
    const summary = summarizeSensorWindow(
      [
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: daysAgo(9),
          source: "manual",
        },
      ],
      { nowMs: NOW_MS, windowDays: 7, tentId: TENT, plantId: PLANT },
    );
    expect(summary.includedCount).toBe(0);
  });

  it("caps recent actions and the compact timeline", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `ge-${i}`,
      occurred_at: hoursAgo(i + 1),
      event_type: "watering",
    }));
    const c = compile({ growEvents: many, diaryEntries: [] });
    expect(c.recentActions.length).toBeLessThanOrEqual(PLANT_CONTEXT_CAPS.recentActions);
    expect(c.compactTimeline.length).toBeLessThanOrEqual(PLANT_CONTEXT_CAPS.timeline);
  });
});

describe("timeline ordering and dedup", () => {
  it("orders newest first and drops the diary mirror of a linked grow event", () => {
    const timeline = buildCompactTimeline(
      {
        growEvents: [
          { id: "ge-1", occurred_at: hoursAgo(3), event_type: "watering" },
          { id: "ge-2", occurred_at: hoursAgo(1), event_type: "feeding" },
        ],
        diaryEntries: [
          // Mirror row of ge-1 — must be deduped away by the canonical rule.
          { id: "de-1", entry_at: hoursAgo(3), note: "watered", grow_event_id: "ge-1" },
          { id: "de-2", entry_at: hoursAgo(2), note: "standalone note" },
        ],
      },
      { nowMs: NOW_MS, windowDays: 14 },
    );
    expect(timeline.map((t) => t.occurredAt)).toEqual([hoursAgo(1), hoursAgo(2), hoursAgo(3)]);
    expect(timeline.filter((t) => t.detail === "watered")).toEqual([]);
  });

  it("drops entries with unusable timestamps from the compact view", () => {
    const timeline = buildCompactTimeline(
      {
        growEvents: [
          { id: "ge-1", occurred_at: "not-a-time", event_type: "watering" },
          // Timezone-less: rejected for the same determinism reason the
          // sensor gate rejects it.
          { id: "ge-2", occurred_at: "2026-07-30T09:00:00", event_type: "feeding" },
        ],
        diaryEntries: [],
      },
      { nowMs: NOW_MS, windowDays: 14 },
    );
    expect(timeline).toEqual([]);
  });
});

describe("gaps and completeness", () => {
  it("scores completeness from present slots only", () => {
    const none = identifyContextGaps({});
    expect(none.completenessScore).toBe(0);
    expect(none.missingInformation.length).toBeGreaterThan(0);
    const all = identifyContextGaps({
      stage: true,
      strain: true,
      medium: true,
      pot_size: true,
      irrigation_architecture: true,
      targets: true,
      recent_actions: true,
      sensor_readings: true,
      photos: true,
    });
    expect(all.completenessScore).toBe(1);
    expect(all.missingInformation).toEqual([]);
  });

  it("reports irrigation architecture as missing when unknown", () => {
    const c = compile();
    expect(c.missingInformation).toContain("irrigation_architecture");
    const known = compile({ identity: { irrigationArchitecture: "top-feed drain-to-waste" } });
    expect(known.missingInformation).not.toContain("irrigation_architecture");
  });

  it("reports deviations only against caller-supplied targets", () => {
    const noTargets = compile();
    expect(noTargets.notableDeviations).toEqual([]);
    const withTargets = compile({ targets: { humidityPct: { min: 40, max: 55 } } });
    expect(withTargets.notableDeviations.join(" ")).toContain("humidity above target");
  });
});

describe("photos, recommendations, follow-ups", () => {
  it("summarizes photo metadata without carrying image references", () => {
    const c = compile({
      photos: [
        { id: "p1", captured_at: hoursAgo(2), quality_score: 0.8, angle: "canopy" },
        { id: "p2", captured_at: hoursAgo(30), quality_score: 0.4, angle: "leaf" },
      ],
    });
    expect(c.photoSummary.count).toBe(2);
    expect(c.photoSummary.bestQualityScore).toBe(0.8);
    expect(c.photoSummary.angles).toEqual(["canopy", "leaf"]);
    expect(serializeSkillContract(c.photoSummary)).not.toContain("p1");
  });

  it("keeps only unresolved follow-ups", () => {
    const c = compile({
      followUps: [
        { id: "f1", due_at: hoursAgo(-24), question: "Did humidity drop?", status: "pending" },
        { id: "f2", due_at: hoursAgo(-24), question: "Already answered", status: "recorded" },
      ],
    });
    expect(c.unresolvedFollowUps).toHaveLength(1);
    expect(c.unresolvedFollowUps[0].question).toBe("Did humidity drop?");
  });
});

describe("safety and determinism", () => {
  it("never includes raw payload content in the compilation", () => {
    const c = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
          raw_payload: { token: "sk-NEVERSURVIVE1234", nested: { secret: "leak-me" } },
        },
      ],
    });
    const serialized = serializeSkillContract(c);
    expect(serialized).not.toContain("NEVERSURVIVE");
    expect(serialized).not.toContain("leak-me");
    expect(serialized).not.toContain("raw_payload");
  });

  it("is deterministic: same rows and injected time produce identical output", () => {
    const input = makeInput({
      photos: [{ id: "p1", captured_at: hoursAgo(2), quality_score: 0.8, angle: "canopy" }],
      followUps: [{ id: "f1", due_at: hoursAgo(-12), question: "Check RH", status: "pending" }],
    });
    const a = compilePlantContextBundle(input, { nowMs: NOW_MS, contextVersion: CTX });
    const b = compilePlantContextBundle(input, { nowMs: NOW_MS, contextVersion: CTX });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(serializeSkillContract(a.compilation)).toBe(serializeSkillContract(b.compilation));
    }
  });

  it("truncates long notes rather than emitting unbounded text", () => {
    const c = compile({
      growEvents: [
        {
          id: "ge-1",
          occurred_at: hoursAgo(1),
          event_type: "watering",
          note: "x".repeat(5000),
        },
      ],
    });
    const note = c.recentActions[0]?.note ?? "";
    expect(note.length).toBeLessThanOrEqual(PLANT_CONTEXT_CAPS.noteChars);
  });
});
