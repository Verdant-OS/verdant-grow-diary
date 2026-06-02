/**
 * QuickLog v2 → AI Doctor Context readiness regression.
 *
 * Proves that a manual sensor snapshot entered through QuickLog v2 (saved
 * as a sibling event_type='environment' parent grow_event + child
 * environment_events row, source='manual') flows through the existing
 * AI Doctor Context readiness pipeline and:
 *   • clears the missing "recent-manual-sensor-snapshot" row
 *   • appears in the evidence list
 *   • removes the "Add sensor snapshot" quick action
 *   • does NOT satisfy readiness when stale
 *   • does NOT satisfy readiness when the row belongs to a different plant/tent
 *   • does NOT classify malformed/invalid telemetry as healthy
 */
import { describe, it, expect } from "vitest";
import {
  quickLogV2EnvironmentRowsToManualSnapshotRecords,
  quickLogV2EnvironmentRowToManualSnapshotRecord,
  filterQuickLogV2EnvironmentRowsByScope,
  type QuickLogV2EnvironmentRow,
} from "@/lib/quickLogV2ManualSnapshotAdapter";
import { buildManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";
import type {
  TimelineMemoryItem,
  TimelineManualSnapshotItem,
} from "@/lib/timelineFilterRules";
import { evaluateAiDoctorContextFromSources } from "@/lib/aiDoctorContextViewModel";
import { buildAiDoctorContextQuickActions } from "@/lib/aiDoctorContextQuickActionsViewModel";

const NOW = Date.UTC(2026, 5, 2, 12, 0, 0);
const HOUR_MS = 3_600_000;

function isoAt(deltaMs: number): string {
  return new Date(NOW - deltaMs).toISOString();
}

const PLANT_ID = "11111111-1111-1111-1111-111111111111";
const TENT_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_PLANT = "33333333-3333-3333-3333-333333333333";
const OTHER_TENT = "44444444-4444-4444-4444-444444444444";

function makeRow(over: Partial<QuickLogV2EnvironmentRow> = {}): QuickLogV2EnvironmentRow {
  return {
    id: "evt-1",
    plant_id: PLANT_ID,
    tent_id: TENT_ID,
    occurred_at: isoAt(HOUR_MS),
    event_type: "environment",
    source: "manual",
    environment: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 },
    ...over,
  };
}

function plantWithStage() {
  return {
    id: PLANT_ID,
    name: "Test",
    strain: "OG",
    stage: "veg",
    medium: "coco",
    hasPlantPhoto: true,
  };
}

function timelineWithActivity(extra: TimelineMemoryItem[] = []): TimelineMemoryItem[] {
  // Two recent diary entries so "recent-timeline-activity" + watering pass.
  return [
    {
      kind: "diary",
      key: "d1",
      occurredAt: isoAt(2 * HOUR_MS),
      eventType: "watering",
      hasPhoto: false,
      note: "watered",
    },
    {
      kind: "diary",
      key: "d2",
      occurredAt: isoAt(3 * HOUR_MS),
      eventType: "note",
      hasPhoto: false,
      note: "looks good",
    },
    ...extra,
  ];
}

function asSnapshotItem(row: QuickLogV2EnvironmentRow): TimelineManualSnapshotItem | null {
  const rec = quickLogV2EnvironmentRowToManualSnapshotRecord(row);
  if (!rec) return null;
  const card = buildManualSnapshotTimelineCard(rec);
  return { kind: "manual_sensor_snapshot", key: card.id, occurredAt: card.capturedAt, card };
}

describe("QuickLog v2 environment row → AI Doctor context readiness", () => {
  it("recent sibling environment event clears 'recent-manual-sensor-snapshot' missing row", () => {
    const snap = asSnapshotItem(makeRow());
    expect(snap).not.toBeNull();
    const r = evaluateAiDoctorContextFromSources({
      plant: plantWithStage(),
      timelineItems: timelineWithActivity([snap!]),
      now: NOW,
    });
    expect(r.missing).not.toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).toContain("fresh-manual-sensor-snapshot");
    expect(r.readiness).toBe("strong");
  });

  it("recent sibling environment event removes 'Add sensor snapshot' quick action", () => {
    const snap = asSnapshotItem(makeRow())!;
    const ctx = evaluateAiDoctorContextFromSources({
      plant: plantWithStage(),
      timelineItems: timelineWithActivity([snap]),
      now: NOW,
    });
    const actions = buildAiDoctorContextQuickActions({ context: ctx });
    const kinds = actions.map((a) => a.kind);
    expect(kinds).not.toContain("add_manual_sensor_snapshot");
  });

  it("stale sibling environment event does NOT satisfy readiness", () => {
    const stale = makeRow({ occurred_at: isoAt(30 * 24 * HOUR_MS) }); // 30d
    const snap = asSnapshotItem(stale)!;
    const r = evaluateAiDoctorContextFromSources({
      plant: plantWithStage(),
      timelineItems: timelineWithActivity([snap]),
      now: NOW,
    });
    expect(r.missing).toContain("recent-manual-sensor-snapshot");
    expect(r.evidence).not.toContain("recent-manual-sensor-snapshot");
    expect(r.readiness).not.toBe("strong");
  });

  it("recent environment event on a DIFFERENT plant does NOT satisfy readiness for this plant", () => {
    const otherRow = makeRow({ id: "evt-other", plant_id: OTHER_PLANT, tent_id: OTHER_TENT });
    const records = quickLogV2EnvironmentRowsToManualSnapshotRecords(
      [otherRow],
      { kind: "plant", plantId: PLANT_ID },
    );
    expect(records).toHaveLength(0);
    const r = evaluateAiDoctorContextFromSources({
      plant: plantWithStage(),
      timelineItems: timelineWithActivity(),
      now: NOW,
    });
    expect(r.missing).toContain("recent-manual-sensor-snapshot");
  });

  it("recent environment event on a DIFFERENT tent does NOT satisfy readiness for this tent", () => {
    const otherRow = makeRow({ id: "evt-other", plant_id: null, tent_id: OTHER_TENT });
    const records = quickLogV2EnvironmentRowsToManualSnapshotRecords(
      [otherRow],
      { kind: "tent", tentId: TENT_ID },
    );
    expect(records).toHaveLength(0);
  });

  it("malformed/invalid telemetry does not classify as healthy", () => {
    const bad = makeRow({
      id: "evt-bad",
      environment: { humidity_pct: 250, temperature_c: 24, vpd_kpa: -1 },
    });
    const rec = quickLogV2EnvironmentRowToManualSnapshotRecord(bad);
    expect(rec).not.toBeNull();
    expect(rec!.validation.errors.length).toBeGreaterThan(0);
    const card = buildManualSnapshotTimelineCard(rec!);
    expect(card.severity).toBe("invalid");
  });

  it("rejects rows with wrong event_type or non-manual source (defense in depth)", () => {
    expect(
      quickLogV2EnvironmentRowToManualSnapshotRecord(
        makeRow({ event_type: "watering" }),
      ),
    ).toBeNull();
    expect(
      quickLogV2EnvironmentRowToManualSnapshotRecord(
        makeRow({ source: "live" as unknown as string }),
      ),
    ).toBeNull();
    expect(
      quickLogV2EnvironmentRowToManualSnapshotRecord(
        makeRow({ source: "demo" as unknown as string }),
      ),
    ).toBeNull();
  });

  it("rejects rows with no usable telemetry", () => {
    expect(
      quickLogV2EnvironmentRowToManualSnapshotRecord(
        makeRow({ environment: { temperature_c: null, humidity_pct: null, vpd_kpa: null } }),
      ),
    ).toBeNull();
  });

  it("scope filter is plant-scoped and tent-scoped independently", () => {
    const rows: QuickLogV2EnvironmentRow[] = [
      makeRow({ id: "a", plant_id: PLANT_ID, tent_id: TENT_ID }),
      makeRow({ id: "b", plant_id: OTHER_PLANT, tent_id: TENT_ID }),
      makeRow({ id: "c", plant_id: null, tent_id: OTHER_TENT }),
    ];
    const plantScoped = filterQuickLogV2EnvironmentRowsByScope(rows, { kind: "plant", plantId: PLANT_ID });
    expect(plantScoped.map((r) => r.id)).toEqual(["a"]);
    const tentScoped = filterQuickLogV2EnvironmentRowsByScope(rows, { kind: "tent", tentId: TENT_ID });
    expect(tentScoped.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });
});
