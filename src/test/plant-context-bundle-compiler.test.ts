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

  it("falls back to the supplied grow stage when the plant row lacks one", () => {
    const c = compile({
      plant: { id: PLANT, grow_id: GROW, tent_id: TENT },
      grow: { id: GROW, stage: "flower" },
    });
    expect(c.bundle.stage).toBe("flower");
    expect(c.missingInformation).not.toContain("stage");
  });

  it("normalizes persisted stage aliases instead of failing the compile", () => {
    // "flush" is written by the app and accepted by the DB trigger, but
    // is not in the canonical skill vocabulary.
    const flush = compile({
      plant: { id: PLANT, grow_id: GROW, tent_id: TENT, stage: "flush" },
    });
    expect(flush.bundle.stage).toBe("late_flower");
    const cure = compile({
      plant: { id: PLANT, grow_id: GROW, tent_id: TENT, stage: "cure" },
    });
    expect(cure.bundle.stage).toBe("curing");
    // An unrecognized stage is REPORTED, not fatal.
    const weird = compile({
      plant: { id: PLANT, grow_id: GROW, tent_id: TENT, stage: "moon phase" },
    });
    expect(weird.bundle.stage).toBeNull();
    expect(weird.missingInformation).toContain("stage");
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

describe("snapshot coherence", () => {
  it("never mixes another source or moment into one snapshot", () => {
    const c = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
        },
        // Usable (manual is fresh for 24h) but two hours older and from a
        // different source — it must not ride inside the live snapshot.
        {
          metric: "humidity_pct",
          value: 58,
          unit: "%",
          captured_at: hoursAgo(2),
          source: "manual",
        },
      ],
    });
    expect(c.bundle.latestSnapshot?.source).toBe("live");
    expect(c.bundle.latestSnapshot?.temperatureC).toBe(25);
    expect(c.bundle.latestSnapshot?.humidityPct).toBeNull();
    // The manual value is still available with its own provenance.
    const rh = c.sensorSummary.metrics.find((m) => m.metric === "humidity_pct");
    expect(rh?.latestValue).toBe(58);
    expect(rh?.latestSource).toBe("manual");
  });

  it("keeps degraded readings out of values labeled ok", () => {
    const c = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
        },
        // Stuck at 100 → degraded, not excluded. Must not become part of
        // an "ok" snapshot.
        {
          metric: "humidity_pct",
          value: 100,
          unit: "%",
          captured_at: hoursAgo(0.1),
          source: "live",
        },
      ],
    });
    expect(c.bundle.latestSnapshot?.quality).toBe("ok");
    expect(c.bundle.latestSnapshot?.humidityPct).toBeNull();
    const rh = c.sensorSummary.metrics.find((m) => m.metric === "humidity_pct");
    expect(rh?.degradedCount).toBe(1);
    expect(rh?.usableCount).toBe(0);
    expect(rh?.latestValue).toBeNull();
  });
});

describe("snapshot coherence, continued", () => {
  it("omits a conflicted metric instead of picking one side as healthy", () => {
    const c = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 20,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
          device_id: "dev-a",
        },
        {
          metric: "temperature_c",
          value: 28,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
          device_id: "dev-b",
        },
      ],
    });
    expect(c.sensorSummary.conflicts.length).toBeGreaterThan(0);
    // The conflict is visible, but no arbitrary healthy value is stamped.
    expect(c.bundle.latestSnapshot?.temperatureC ?? null).toBeNull();
    const temp = c.sensorSummary.metrics.find((m) => m.metric === "temperature_c");
    expect(temp?.conflicted).toBe(true);
  });

  it("reports no target deviation for a conflicted metric", () => {
    const c = compile({
      targets: { temperatureC: { min: 22, max: 26 } },
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 20,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
          device_id: "dev-a",
        },
        {
          metric: "temperature_c",
          value: 28,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
          device_id: "dev-b",
        },
      ],
    });
    expect(c.sensorSummary.conflicts.length).toBeGreaterThan(0);
    // Neither "below target" nor "above target" may be asserted from an
    // arbitrarily chosen side of the conflict.
    expect(c.notableDeviations).toEqual([]);
  });

  it("does not assign tent-scoped root-zone readings to the compiled plant", () => {
    const c = compile({
      sensorReadings: [
        // Tent-scoped row: plant ownership was never established.
        {
          metric: "soil_moisture_pct",
          value: 30,
          unit: "%",
          captured_at: hoursAgo(0.1),
          source: "live",
        },
        {
          metric: "soil_moisture_pct",
          value: 65,
          unit: "%",
          captured_at: hoursAgo(0.1),
          source: "live",
          plant_id: "other-plant",
        },
      ],
    });
    // The tent-scoped and other-plant rows are grouped apart, so they do
    // not become a conflict attributed to this plant.
    expect(c.sensorSummary.conflicts).toEqual([]);
  });

  it("never adopts another plant's or a tent-scoped root-zone value", () => {
    const c = compile({
      sensorReadings: [
        // Newer, but belongs to a different plant.
        {
          metric: "soil_moisture_pct",
          value: 65,
          unit: "%",
          captured_at: hoursAgo(0.05),
          source: "live",
          plant_id: "other-plant",
        },
        // Newer than ours, but tent-scoped: ownership never established.
        {
          metric: "soil_moisture_pct",
          value: 70,
          unit: "%",
          captured_at: hoursAgo(0.08),
          source: "live",
        },
        // Ours.
        {
          metric: "soil_moisture_pct",
          value: 35,
          unit: "%",
          captured_at: hoursAgo(0.2),
          source: "live",
          plant_id: PLANT,
        },
      ],
    });
    const soil = c.sensorSummary.metrics.find((m) => m.metric === "soil_moisture_pct");
    expect(soil?.latestValue).toBe(35);
    expect(soil?.usableCount).toBe(1);
    // With no plant-scoped root reading at all, the plant gets none.
    const tentOnly = compile({
      sensorReadings: [
        {
          metric: "soil_moisture_pct",
          value: 70,
          unit: "%",
          captured_at: hoursAgo(0.1),
          source: "live",
        },
      ],
    });
    expect(
      tentOnly.sensorSummary.metrics.find((m) => m.metric === "soil_moisture_pct"),
    ).toBeUndefined();
  });

  it("scopes root-zone means and conflicts to the compiled plant", () => {
    const other = (value: number, device: string) => ({
      metric: "soil_moisture_pct",
      value,
      unit: "%",
      captured_at: hoursAgo(0.1),
      source: "live",
      plant_id: "other-plant",
      device_id: device,
    });
    const c = compile({
      sensorReadings: [
        // Another plant's two devices disagree wildly — not our conflict,
        // and not our mean.
        other(10, "o-1"),
        other(90, "o-2"),
        {
          metric: "soil_moisture_pct",
          value: 40,
          unit: "%",
          captured_at: hoursAgo(0.1),
          source: "live",
          plant_id: PLANT,
          device_id: "mine",
        },
      ],
    });
    expect(c.sensorSummary.conflicts).toEqual([]);
    expect(c.conflictingEvidence).toEqual([]);
    const soil = c.sensorSummary.metrics.find((m) => m.metric === "soil_moisture_pct");
    expect(soil?.mean).toBe(40);
    expect(soil?.conflicted).toBe(false);
  });

  it("drops readings owned by another tent instead of re-homing them", () => {
    const c = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 40,
          unit: "°C",
          captured_at: hoursAgo(0.05),
          source: "live",
          tent_id: "other-tent",
        },
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
          tent_id: TENT,
        },
      ],
    });
    const temp = c.sensorSummary.metrics.find((m) => m.metric === "temperature_c");
    expect(temp?.latestValue).toBe(25);
    expect(temp?.usableCount).toBe(1);
  });

  it("does not resurrect an older healthy sample behind a bad newest one", () => {
    const c = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: hoursAgo(0.2),
          source: "live",
          device_id: "dev-1",
        },
        // Same device, newer, invalid: the device contributes nothing.
        {
          metric: "temperature_c",
          value: 999,
          unit: "°C",
          captured_at: hoursAgo(0.05),
          source: "live",
          device_id: "dev-1",
        },
      ],
    });
    const temp = c.sensorSummary.metrics.find((m) => m.metric === "temperature_c");
    expect(temp?.latestValue).toBeNull();
    expect(temp?.usableCount).toBe(0);
    expect(c.bundle.latestSnapshot?.temperatureC ?? null).toBeNull();
  });

  it("keeps out-of-scope telemetry counted as a missing sensor gap", () => {
    const c = compile({
      sensorReadings: [
        // Only another plant's root-zone reading: this plant has no
        // sensor context, and completeness must say so.
        {
          metric: "soil_moisture_pct",
          value: 40,
          unit: "%",
          captured_at: hoursAgo(0.1),
          source: "live",
          plant_id: "other-plant",
        },
      ],
    });
    expect(c.sensorSummary.includedCount).toBe(0);
    expect(c.missingInformation).toContain("sensor_readings");
  });

  it("omits a snapshot whose every metric was filtered out", () => {
    const c = compile({
      sensorReadings: [
        // Only a root-zone reading, and it belongs to another plant: the
        // anchor would have no represented metric.
        {
          metric: "soil_moisture_pct",
          value: 40,
          unit: "%",
          captured_at: hoursAgo(0.1),
          source: "live",
          plant_id: "other-plant",
        },
      ],
    });
    expect(c.bundle.latestSnapshot).toBeNull();
  });

  it("stamps the weakest included metric's confidence, not the anchor's", () => {
    const c = compile({
      sensorReadings: [
        {
          metric: "humidity_pct",
          value: 55,
          unit: "%",
          captured_at: hoursAgo(0.05),
          source: "live",
          confidence: 1,
        },
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: hoursAgo(0.15),
          source: "live",
          confidence: 0.2,
        },
      ],
    });
    expect(c.bundle.latestSnapshot?.humidityPct).toBe(55);
    expect(c.bundle.latestSnapshot?.temperatureC).toBe(25);
    expect(c.bundle.latestSnapshot?.confidence).toBe(0.2);
  });

  it("selects the latest reading deterministically when timestamps tie", () => {
    const rows = [
      {
        metric: "temperature_c",
        value: 24,
        unit: "°C",
        captured_at: hoursAgo(0.1),
        source: "manual",
        device_id: "dev-b",
      },
      {
        metric: "temperature_c",
        value: 26,
        unit: "°C",
        captured_at: hoursAgo(0.1),
        source: "manual",
        device_id: "dev-a",
      },
    ];
    const forward = compile({ sensorReadings: rows });
    const reversed = compile({ sensorReadings: [...rows].reverse() });
    // Row order must not change which reading anchors the snapshot.
    expect(serializeSkillContract(forward.bundle.latestSnapshot)).toBe(
      serializeSkillContract(reversed.bundle.latestSnapshot),
    );
  });
});

describe("persisted row fields the gate needs", () => {
  it("falls back to the legacy ts column when captured_at is absent", () => {
    const c = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: null,
          ts: hoursAgo(0.1),
          source: "live",
        },
      ],
    });
    expect(c.sensorSummary.includedCount).toBe(1);
    expect(c.bundle.latestSnapshot?.temperatureC).toBe(25);
  });

  it("passes stored confidence through, including from raw_payload", () => {
    const direct = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
          confidence: 0.3,
        },
      ],
    });
    expect(direct.bundle.latestSnapshot?.confidence).toBe(0.3);
    const nested = compile({
      sensorReadings: [
        {
          metric: "temperature_c",
          value: 25,
          unit: "°C",
          captured_at: hoursAgo(0.1),
          source: "live",
          raw_payload: { confidence: 0.4, token: "sk-NEVERSURVIVE1234" },
        },
      ],
    });
    expect(nested.bundle.latestSnapshot?.confidence).toBe(0.4);
    expect(serializeSkillContract(nested)).not.toContain("NEVERSURVIVE");
  });

  it("forwards device identity so one device's samples are not a conflict", () => {
    const sample = (value: number, hours: number) => ({
      metric: "temperature_c",
      value,
      unit: "°C",
      captured_at: hoursAgo(hours),
      source: "live",
      device_id: "dev-1",
    });
    const c = compile({ sensorReadings: [sample(21, 0.2), sample(27, 0.05)] });
    expect(c.sensorSummary.conflicts).toEqual([]);
    expect(c.conflictingEvidence).toEqual([]);
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
      { nowMs: NOW_MS, windowDays: 7, tentId: TENT },
    );
    expect(summary.includedCount).toBe(0);
  });

  it("orders tied actions deterministically regardless of row order", () => {
    const rows = [
      { id: "ge-2", occurred_at: hoursAgo(2), event_type: "watering", note: "b" },
      { id: "ge-1", occurred_at: hoursAgo(2), event_type: "watering", note: "a" },
      { id: "ge-3", occurred_at: hoursAgo(2), event_type: "watering", note: "c" },
    ];
    const forward = summarizeRecentActions(rows, {
      nowMs: NOW_MS,
      windowDays: 14,
      immediateHours: 48,
    });
    const reversed = summarizeRecentActions([...rows].reverse(), {
      nowMs: NOW_MS,
      windowDays: 14,
      immediateHours: 48,
    });
    expect(serializeSkillContract(forward)).toBe(serializeSkillContract(reversed));
    expect(forward.map((a) => a.note)).toEqual(["a", "b", "c"]);
  });

  it("does not let one device's sample count dominate the mean", () => {
    const chatty = Array.from({ length: 10 }, (_, i) => ({
      metric: "temperature_c",
      value: 20,
      unit: "°C",
      captured_at: hoursAgo(0.1 + i * 0.001),
      source: "live",
      device_id: "chatty",
    }));
    const quiet = {
      metric: "temperature_c",
      value: 30,
      unit: "°C",
      captured_at: hoursAgo(0.1),
      source: "live",
      device_id: "quiet",
    };
    const summary = summarizeSensorWindow([...chatty, quiet], {
      nowMs: NOW_MS,
      windowDays: 7,
      tentId: TENT,
    });
    const temp = summary.metrics.find((m) => m.metric === "temperature_c");
    // Latest-per-device grouping first: 20 and 30 weigh equally (25),
    // rather than the chatty device's ten samples pulling toward 20.
    expect(temp?.mean).toBe(25);
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
      plant_type: true,
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

  it("reports irrigation architecture and plant type, and CARRIES them when known", () => {
    const unknown = compile();
    expect(unknown.missingInformation).toContain("irrigation_architecture");
    expect(unknown.missingInformation).toContain("plant_type");
    expect(unknown.irrigationArchitecture).toBeNull();
    expect(unknown.plantType).toBeNull();

    const known = compile({
      identity: {
        irrigationArchitecture: "top-feed drain-to-waste",
        plantType: "photoperiod",
      },
    });
    expect(known.missingInformation).not.toContain("irrigation_architecture");
    expect(known.missingInformation).not.toContain("plant_type");
    // Clearing the gap flag without emitting the value would be worse
    // than reporting it missing — assert the values actually ship.
    expect(known.irrigationArchitecture).toBe("top-feed drain-to-waste");
    expect(known.plantType).toBe("photoperiod");
    const serialized = serializeSkillContract(known);
    expect(serialized).toContain("top-feed drain-to-waste");
    expect(serialized).toContain("photoperiod");
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

  it("keeps the photo summary internally consistent past the cap", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `p-${i}`,
      captured_at: hoursAgo(i + 1),
      quality_score: 0.5,
      angle: "canopy",
    }));
    const c = compile({ photos: many });
    expect(c.photoSummary.count).toBe(PLANT_CONTEXT_CAPS.photos);
    // Derived metadata must describe the SAME selection as `count`.
    expect(c.photoSummary.withQualityScore).toBeLessThanOrEqual(c.photoSummary.count);
    expect(c.photoSummary.latestCapturedAt).toBe(hoursAgo(1));
  });

  it("reports the true recent diary count, not the truncated one", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `de-${i}`,
      entry_at: hoursAgo(i + 1),
      note: `note ${i}`,
    }));
    const c = compile({ diaryEntries: many });
    expect(c.observations.length).toBe(PLANT_CONTEXT_CAPS.observations);
    expect(c.bundle.recentDiaryEntryCount).toBe(40);
  });

  it("orders tied observations deterministically before truncating", () => {
    const rows = [
      { id: "de-2", entry_at: hoursAgo(2), note: "b" },
      { id: "de-1", entry_at: hoursAgo(2), note: "a" },
      { id: "de-3", entry_at: hoursAgo(2), note: "c" },
    ];
    const forward = compile({ diaryEntries: rows });
    const reversed = compile({ diaryEntries: [...rows].reverse() });
    expect(serializeSkillContract(forward.observations)).toBe(
      serializeSkillContract(reversed.observations),
    );
    expect(forward.observations.map((o) => o.note)).toEqual(["a", "b", "c"]);
  });

  it("orders tied recommendations and follow-ups deterministically", () => {
    const recs = [
      { id: "r-2", created_at: hoursAgo(3), summary: "b", risk_level: "low" },
      { id: "r-1", created_at: hoursAgo(3), summary: "a", risk_level: "low" },
      { id: "r-3", created_at: hoursAgo(3), summary: "c", risk_level: "low" },
    ];
    const ups = [
      { id: "f-2", due_at: hoursAgo(-6), question: "b?", status: "pending" },
      { id: "f-1", due_at: hoursAgo(-6), question: "a?", status: "pending" },
      { id: "f-3", due_at: hoursAgo(-6), question: "c?", status: "pending" },
    ];
    const forward = compile({ previousRecommendations: recs, followUps: ups });
    const reversed = compile({
      previousRecommendations: [...recs].reverse(),
      followUps: [...ups].reverse(),
    });
    expect(serializeSkillContract(forward.previousRecommendations)).toBe(
      serializeSkillContract(reversed.previousRecommendations),
    );
    expect(serializeSkillContract(forward.unresolvedFollowUps)).toBe(
      serializeSkillContract(reversed.unresolvedFollowUps),
    );
    expect(forward.previousRecommendations.map((r) => r.summary)).toEqual(["a", "b", "c"]);
    expect(forward.unresolvedFollowUps.map((f) => f.question)).toEqual(["a?", "b?", "c?"]);
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
