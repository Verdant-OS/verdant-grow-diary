/**
 * QuickLog v2 → AI Doctor Context readiness — extended scope contract.
 *
 * Adds regression coverage for the plant-scope predicate that also accepts
 * a tent-level (plant_id = null) environment event when the current
 * plant's tentId is provided.
 *
 * Contract under test:
 *   plant scope counts when:
 *     r.plant_id === plantId
 *     OR (r.plant_id == null AND r.tent_id === currentPlantTentId)
 *   plant scope does NOT count when:
 *     r.tent_id !== currentPlantTentId
 *     OR r.plant_id is another (non-null) plant id
 *   shared recentManualSnapshotMs constant is used (no duplicated 48h).
 *   invalid telemetry never classifies as healthy.
 *   snapshot with no valid temp/humidity/vpd does not satisfy readiness.
 */
import { describe, it, expect } from "vitest";
import {
  quickLogV2EnvironmentRowToManualSnapshotRecord,
  quickLogV2EnvironmentRowsToManualSnapshotRecords,
  filterQuickLogV2EnvironmentRowsByScope,
  type QuickLogV2EnvironmentRow,
} from "@/lib/quickLogV2ManualSnapshotAdapter";
import { buildManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";
import {
  evaluateAiDoctorContextFromSources,
} from "@/lib/aiDoctorContextViewModel";
import { buildAiDoctorContextQuickActions } from "@/lib/aiDoctorContextQuickActionsViewModel";
import type {
  TimelineMemoryItem,
  TimelineManualSnapshotItem,
} from "@/lib/timelineFilterRules";
import { AI_DOCTOR_CONTEXT_READINESS_CONFIG } from "@/constants/aiDoctorContextReadiness";

const NOW = Date.UTC(2026, 5, 2, 12, 0, 0);
const HOUR = 3_600_000;
const isoAt = (delta: number) => new Date(NOW - delta).toISOString();

const PLANT_ID = "11111111-1111-1111-1111-111111111111";
const TENT_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_TENT = "44444444-4444-4444-4444-444444444444";
const OTHER_PLANT_SAME_TENT = "55555555-5555-5555-5555-555555555555";

function makeRow(over: Partial<QuickLogV2EnvironmentRow> = {}): QuickLogV2EnvironmentRow {
  return {
    id: "evt",
    plant_id: PLANT_ID,
    tent_id: TENT_ID,
    occurred_at: isoAt(6 * HOUR),
    event_type: "environment",
    source: "manual",
    environment: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 },
    ...over,
  };
}

function asSnapshotItem(row: QuickLogV2EnvironmentRow): TimelineManualSnapshotItem {
  const rec = quickLogV2EnvironmentRowToManualSnapshotRecord(row);
  if (!rec) throw new Error("expected a record");
  const card = buildManualSnapshotTimelineCard(rec);
  return { kind: "manual_sensor_snapshot", key: card.id, occurredAt: card.capturedAt, card };
}

function activity(extra: TimelineMemoryItem[] = []): TimelineMemoryItem[] {
  return [
    { kind: "diary", key: "d1", occurredAt: isoAt(2 * HOUR), eventType: "watering", hasPhoto: false, note: "watered" },
    { kind: "diary", key: "d2", occurredAt: isoAt(3 * HOUR), eventType: "note", hasPhoto: false, note: "ok" },
    ...extra,
  ];
}

function plant() {
  return { id: PLANT_ID, name: "P", strain: "OG", stage: "veg", medium: "coco", hasPlantPhoto: true };
}

describe("QuickLog v2 scope predicate (extended)", () => {
  it("recent tent-level row (plant_id=null) satisfies readiness for a plant in that tent", () => {
    const row = makeRow({ id: "tent-lvl", plant_id: null });
    const scoped = filterQuickLogV2EnvironmentRowsByScope([row], {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });
    expect(scoped.map((r) => r.id)).toEqual(["tent-lvl"]);

    const snap = asSnapshotItem(row);
    const r = evaluateAiDoctorContextFromSources({
      plant: plant(),
      timelineItems: activity([snap]),
      now: NOW,
    });
    expect(r.missing).not.toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).toContain("recent-manual-sensor-snapshot");
    const actions = buildAiDoctorContextQuickActions({ missing: r.missing, plantId: PLANT_ID });
    expect(actions.some((a) => a.kind === "add_manual_sensor_snapshot")).toBe(false);
  });

  it("recent row from a DIFFERENT tent does NOT satisfy readiness for the plant", () => {
    const row = makeRow({ id: "other-tent", plant_id: null, tent_id: OTHER_TENT });
    const scoped = filterQuickLogV2EnvironmentRowsByScope([row], {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });
    expect(scoped).toHaveLength(0);
  });

  it("recent row scoped to a DIFFERENT plant in the same tent does NOT satisfy readiness", () => {
    const row = makeRow({ id: "other-plant", plant_id: OTHER_PLANT_SAME_TENT, tent_id: TENT_ID });
    const scoped = filterQuickLogV2EnvironmentRowsByScope([row], {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });
    expect(scoped).toHaveLength(0);
  });

  it("plant scope without tentId does not accept tent-level rows (defense in depth)", () => {
    const row = makeRow({ id: "tent-lvl", plant_id: null });
    const scoped = filterQuickLogV2EnvironmentRowsByScope([row], {
      kind: "plant",
      plantId: PLANT_ID,
    });
    expect(scoped).toHaveLength(0);
  });

  it("stale tent-level snapshot does NOT satisfy readiness", () => {
    const stale = makeRow({
      id: "stale-tent",
      plant_id: null,
      occurred_at: isoAt(30 * 24 * HOUR),
    });
    const snap = asSnapshotItem(stale);
    const r = evaluateAiDoctorContextFromSources({
      plant: plant(),
      timelineItems: activity([snap]),
      now: NOW,
    });
    expect(r.missing).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).not.toContain("recent-manual-sensor-snapshot");
  });

  it("row with no valid temp/humidity/vpd does not produce a snapshot record", () => {
    const empty = makeRow({
      id: "empty",
      environment: { temperature_c: null, humidity_pct: null, vpd_kpa: null },
    });
    expect(quickLogV2EnvironmentRowToManualSnapshotRecord(empty)).toBeNull();
  });

  it("invalid telemetry (out-of-range humidity) does not classify as healthy", () => {
    const bad = makeRow({
      id: "bad",
      environment: { humidity_pct: 250, temperature_c: 24, vpd_kpa: 1.0 },
    });
    const rec = quickLogV2EnvironmentRowToManualSnapshotRecord(bad);
    expect(rec).not.toBeNull();
    const card = buildManualSnapshotTimelineCard(rec!);
    expect(card.severity).toBe("invalid");
  });

  it("uses the shared recentManualSnapshotMs constant (boundary, no duplicated 48h)", () => {
    const justInside = makeRow({
      id: "edge-in",
      plant_id: null,
      occurred_at: new Date(
        NOW - (AI_DOCTOR_CONTEXT_READINESS_CONFIG.recentEventWindowMs - 60_000),
      ).toISOString(),
    });
    const snapIn = asSnapshotItem(justInside);
    const rIn = evaluateAiDoctorContextFromSources({
      plant: plant(),
      timelineItems: activity([snapIn]),
      now: NOW,
    });
    expect(rIn.evidence).toContain("recent-manual-sensor-snapshot");

    const justOutside = makeRow({
      id: "edge-out",
      plant_id: null,
      occurred_at: new Date(
        NOW - (AI_DOCTOR_CONTEXT_READINESS_CONFIG.recentEventWindowMs + 60_000),
      ).toISOString(),
    });
    const snapOut = asSnapshotItem(justOutside);
    const rOut = evaluateAiDoctorContextFromSources({
      plant: plant(),
      timelineItems: activity([snapOut]),
      now: NOW,
    });
    expect(rOut.missing).toContain("recent-manual-sensor-snapshot");
  });

  it("tent scope accepts any plant_id in the same tent (including null and other plants)", () => {
    const rows: QuickLogV2EnvironmentRow[] = [
      makeRow({ id: "a", plant_id: PLANT_ID, tent_id: TENT_ID }),
      makeRow({ id: "b", plant_id: OTHER_PLANT_SAME_TENT, tent_id: TENT_ID }),
      makeRow({ id: "c", plant_id: null, tent_id: TENT_ID }),
      makeRow({ id: "d", plant_id: null, tent_id: OTHER_TENT }),
    ];
    const scoped = filterQuickLogV2EnvironmentRowsByScope(rows, {
      kind: "tent",
      tentId: TENT_ID,
    });
    expect(scoped.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("bulk adapter applies plant+tent predicate end-to-end", () => {
    const rows: QuickLogV2EnvironmentRow[] = [
      makeRow({ id: "own", plant_id: PLANT_ID }),
      makeRow({ id: "tent-lvl", plant_id: null }),
      makeRow({ id: "other-plant", plant_id: OTHER_PLANT_SAME_TENT }),
      makeRow({ id: "other-tent", plant_id: null, tent_id: OTHER_TENT }),
    ];
    const recs = quickLogV2EnvironmentRowsToManualSnapshotRecords(rows, {
      kind: "plant",
      plantId: PLANT_ID,
      tentId: TENT_ID,
    });
    expect(recs.map((r) => r.id).sort()).toEqual(["own", "tent-lvl"]);
  });
});
