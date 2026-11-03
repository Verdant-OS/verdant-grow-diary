/**
 * Whole-tent Note plus a manual climate, on the row quicklog_save_manual
 * actually stores and the environment sibling it writes beside that row.
 *
 * The companion keeps the note marker and provenance. Temperature, humidity,
 * and VPD stay on the environment sibling. Timeline attaches that sibling
 * for display. Classification, Recent quick logs, and the Measurement filter
 * read the attached row. The companion does not grow a second snapshot.
 */
import { describe, expect, it } from "vitest";
import { manualClimateAsSnapshotRows } from "@/components/EcowittTentSnapshotV0Card";
import { normalizeDiaryEntry } from "@/lib/diaryEntryRules";
import { buildEcowittTentSnapshotV0ViewModel } from "@/lib/ecowittTentSnapshotV0ViewModel";
import { snapshotPersistenceBlockReason } from "@/lib/environmentAlertPersistence";
import { resolveEffectiveQuickLogCareType } from "@/lib/environmentCheckTimelineViewModel";
import { buildPlantQuickLogV2SavePayload } from "@/lib/plantQuickLogV2SaveAdapter";
import type { RawGrowEventRow } from "@/lib/quickLogGroupedTimelineRowAdapter";
import { buildMeasurementHistory, buildRecentQuickLogActivity } from "@/lib/quickLogHistoryRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import {
  snapshotFromDiary,
  snapshotFromManualSensorSnapshot,
  snapshotFromReadings,
} from "@/lib/sensorSnapshot";
import { collectSensorsQuickLogManualReadings } from "@/lib/sensorsQuickLogManualSeriesRules";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";
import { dropEventsMirroredByDiaryRows } from "@/lib/tentManualEnvironmentEventRules";
import { diaryEntryBelongsInTimelineMeasurements } from "@/lib/timelineManualSensorMeasurementRules";
import { TimelineQuickLogEnvironmentSnapshotReadback } from "@/lib/timelineQuickLogEnvironmentSnapshotReadback";

const TEMP_C = fahrenheitToCelsius(76);
const OBSERVED_AT = "2026-11-02T20:34:00.000Z";
const CREATED_AT = "2026-11-02T20:34:05.000Z";
const NOW = new Date("2026-11-02T20:40:00.000Z");

function tentNotePayload(vpdKpa = "") {
  return buildQuickLogV2SavePayload({
    resolved: {
      ok: true,
      targetType: "tent",
      targetId: "tent-1",
      tentId: "tent-1",
      plantId: null,
    },
    action: "note",
    volumeMl: "",
    note: "QA-SYNTH 2733 r1",
    temperatureC: String(TEMP_C),
    humidityPct: "55",
    vpdKpa,
    idempotencyKey: "quicklog-v2-2733-tent",
  });
}

function rpcDetails(vpdKpa = ""): Record<string, unknown> {
  const saved = tentNotePayload(vpdKpa);
  if (!saved.ok) throw new Error(saved.reason);
  return {
    ...saved.payload.p_details,
    linked_grow_event_id: "observation-parent",
  };
}

function siblingEvents(vpd: number | null) {
  return [
    {
      id: "observation-parent",
      event_type: "observation",
      source: "manual",
      plant_id: null,
      occurred_at: OBSERVED_AT,
      created_at: CREATED_AT,
    },
    {
      id: "env-sibling",
      event_type: "environment",
      source: "manual",
      plant_id: null,
      occurred_at: OBSERVED_AT,
      created_at: CREATED_AT,
      environment_events: {
        temperature_c: TEMP_C,
        humidity_pct: 55,
        vpd_kpa: vpd,
      },
    },
  ];
}

describe("whole-tent note reads climate from the environment sibling", () => {
  it("does not write a diary snapshot beside the sibling", () => {
    const details = rpcDetails("1.1");
    expect(details.quick_log_activity).toBe("note");
    expect(details).not.toHaveProperty("sensor_snapshot");
    expect(details).not.toHaveProperty("manual_sensor_snapshot");
    expect(snapshotFromDiary(OBSERVED_AT, undefined)).toBeNull();
  });

  it("classifies the attached sibling as a measurement and counts it", () => {
    const [row] = TimelineQuickLogEnvironmentSnapshotReadback.attach(
      [
        {
          id: "diary-1",
          tent_id: "tent-1",
          entry_at: OBSERVED_AT,
          details: rpcDetails(),
        },
      ],
      siblingEvents(null),
    );
    expect(resolveEffectiveQuickLogCareType({ details: row?.details })).toBe("measurement");
    expect(
      diaryEntryBelongsInTimelineMeasurements({
        id: "diary-1",
        details: row?.details,
        note: "QA-SYNTH 2733 r1",
        entry_at: OBSERVED_AT,
      }),
    ).toBe(true);
    const snap = row?.details?.sensor_snapshot as Record<string, unknown>;
    expect(snap.temp_c).toBeCloseTo(TEMP_C, 5);
    expect(snap).not.toHaveProperty("temp");
  });

  it("keeps a note with no climate as a note", () => {
    expect(
      resolveEffectiveQuickLogCareType({
        details: { quick_log_activity: "note", linked_grow_event_id: "observation-parent" },
      }),
    ).toBe("note");
  });

  it("shows the sibling values on Recent quick logs", () => {
    const [row] = TimelineQuickLogEnvironmentSnapshotReadback.attach(
      [
        {
          id: "diary-1",
          tent_id: "tent-1",
          entry_at: OBSERVED_AT,
          note: "QA-SYNTH 2733 r1",
          details: rpcDetails(),
        },
      ],
      siblingEvents(null),
    );
    const entry = normalizeDiaryEntry(row!);
    expect(entry).not.toBeNull();
    if (!entry) return;
    const recent = buildRecentQuickLogActivity([entry]);
    expect(recent[0]?.climate?.rh).toBe(55);
    expect(recent[0]?.climate?.tempC).toBeCloseTo(TEMP_C, 5);
    expect(buildMeasurementHistory([entry]).map((item) => item.id)).toEqual(["diary-1"]);
  });

  it("keeps the sibling manual and alert-eligible, and keeps a typed plant temp_f", () => {
    const sibling = snapshotFromReadings([
      {
        ts: OBSERVED_AT,
        metric: "temperature_c",
        value: TEMP_C,
        source: "manual",
      },
      { ts: OBSERVED_AT, metric: "humidity_pct", value: 55, source: "manual" },
    ]);
    expect(sibling?.source).toBe("manual");
    expect(sibling).not.toHaveProperty("alert_persistence_eligible");
    expect(
      snapshotPersistenceBlockReason({ snapshot: sibling, quality: "good", now: NOW.getTime() }),
    ).toBeNull();

    const plant = buildPlantQuickLogV2SavePayload({
      plantId: "plant-1",
      growId: "grow-1",
      tentId: "tent-1",
      note: "typed seventy six",
      sensors: { temp: "76", humidity: "55", ph: "", ec: "" },
      idempotencyKey: "plant-typed-temp-f",
    });
    expect(plant.ok).toBe(true);
    if (!plant.ok) return;
    const manual = plant.payload.p_details?.manual_sensor_snapshot as Record<string, unknown>;
    expect(manual.temp_f).toBe(76);
    expect(plant.payload.p_details).not.toHaveProperty("sensor_snapshot");
    expect(snapshotFromManualSensorSnapshot(OBSERVED_AT, manual)?.source).toBe("manual");
    expect(snapshotFromDiary(OBSERVED_AT, undefined)?.source).toBeUndefined();
  });

  it("lists a VPD sibling once and does not double the manual series", () => {
    const details = rpcDetails("1.1");
    const kept = dropEventsMirroredByDiaryRows(
      [
        {
          id: "env-sibling",
          tentId: "tent-1",
          plantId: null,
          occurredAt: OBSERVED_AT,
          temperatureC: TEMP_C,
          humidityPct: 55,
          vpdKpa: 1.1,
        },
      ],
      [
        {
          details,
          tent_id: "tent-1",
          plant_id: null,
          entry_at: OBSERVED_AT,
        },
      ],
    );
    expect(kept.map((event) => event.id)).toEqual(["env-sibling"]);

    const growEvents: RawGrowEventRow[] = [
      {
        id: "env-sibling",
        plant_id: null,
        tent_id: "tent-1",
        occurred_at: OBSERVED_AT,
        event_type: "environment",
        source: "manual",
        note: null,
        environment_events: {
          temperature_c: TEMP_C,
          humidity_pct: 55,
          vpd_kpa: 1.1,
        },
      },
    ];
    const mirror = {
      id: "diary-1",
      tent_id: "tent-1",
      entry_at: OBSERVED_AT,
      details: {
        manual_sensor_snapshot: { source: "manual", temp_f: 76, humidity_percent: 55 },
      },
    };
    const deduped = collectSensorsQuickLogManualReadings({
      tentId: "tent-1",
      growEvents,
      diaryEntries: [mirror],
      now: NOW,
    });
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.vpd).toBeCloseTo(1.1, 5);
    expect(deduped[0]?.source).toBe("manual");
  });

  it("badges a newer manual temp beside an older live RH as mixed", () => {
    const manuals = manualClimateAsSnapshotRows(
      [
        {
          ts: OBSERVED_AT,
          tentId: "tent-1",
          temp: TEMP_C,
          rh: 0,
          vpd: 0,
          co2: 0,
          soil: 0,
          source: "manual",
          status: "usable",
          capturedAt: OBSERVED_AT,
          observedMetrics: ["temp"],
        },
      ],
      "tent-1",
    );
    const vm = buildEcowittTentSnapshotV0ViewModel(
      [
        {
          source: "live",
          ts: "2026-11-02T20:30:00.000Z",
          metric: "humidity_pct",
          value: 40,
          tent_id: "tent-1",
        },
        ...manuals,
      ],
      { tentId: "tent-1", now: NOW },
    );
    expect(vm.metrics.find((metric) => metric.key === "temp")?.truthSource).toBe("manual");
    expect(vm.metrics.find((metric) => metric.key === "rh")?.truthSource).toBe("live");
    expect(vm.overallTruthSource).toBe("mixed");
    expect(vm.overallBadgeLabel).toBe("Mixed");
  });
});
