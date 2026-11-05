/**
 * #2733 / VER-404 follow-up: the Timeline "Filter by log type" dropdown must
 * count and filter a whole-tent Quick Log note with a manual climate under
 * Measurement, the same way the card badge and the Measurements chip do.
 *
 * Before the fix the dropdown read the stored `details.event_type` only. The
 * note's linked observation spine stamps that as "observation", so each save
 * moved Observation +1 and left Measurement unchanged (QA recheck on
 * 72e17e5d1d18: Measurement stayed at 8 while Observation went 23 -> 24 -> 25).
 *
 * The fixture is the real save payload plus the linked observation parent and
 * the environment sibling, run through the same Timeline display steps.
 */
import { describe, expect, it } from "vitest";
import { resolveEffectiveQuickLogCareType } from "@/lib/environmentCheckTimelineViewModel";
import { applyLinkedEventTypes } from "@/lib/diaryLinkedEventTypeRules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";
import {
  deriveTimelineEventTypeOptions,
  filterTimelineEvidenceRows,
  timelineEvidenceRowMatches,
} from "@/lib/timelineEvidenceFilterRules";
import { diaryEntryBelongsInTimelineMeasurements } from "@/lib/timelineManualSensorMeasurementRules";
import { TimelineQuickLogEnvironmentSnapshotReadback } from "@/lib/timelineQuickLogEnvironmentSnapshotReadback";

const TEMP_C = fahrenheitToCelsius(76);
const TENT = "tent-1";

interface Row {
  id: string;
  tent_id: string;
  plant_id: string | null;
  note: string;
  stage: string | null;
  entry_at: string;
  details: Record<string, unknown>;
}

function savedDetails(note: string, key: string, climate: boolean): Record<string, unknown> {
  const saved = buildQuickLogV2SavePayload({
    resolved: { ok: true, targetType: "tent", targetId: TENT, tentId: TENT, plantId: null },
    action: "note",
    volumeMl: "",
    note,
    temperatureC: climate ? String(TEMP_C) : "",
    humidityPct: climate ? "55" : "",
    vpdKpa: "",
    idempotencyKey: `quicklog-v2-${key}-tent`,
  });
  if (!saved.ok) throw new Error(saved.reason);
  return { ...(saved.payload.p_details ?? {}) };
}

/** One Quick Log save as the Timeline loads it: diary companion + spine + sibling. */
function save(n: number, opts: { climate: boolean }) {
  const parentId = `00000000-0000-4000-8000-00000000000${n}`;
  const at = `2026-11-03T22:4${n}:00.000Z`;
  const diary: Row = {
    id: `diary-${n}`,
    tent_id: TENT,
    plant_id: null,
    note: `QA-SYNTH 2733 r${n}`,
    stage: null,
    entry_at: at,
    details: {
      ...savedDetails(`QA-SYNTH 2733 r${n}`, `2733-r${n}`, opts.climate),
      linked_grow_event_id: parentId,
    },
  };
  const events: Record<string, unknown>[] = [
    {
      id: parentId,
      event_type: "observation",
      source: "manual",
      plant_id: null,
      occurred_at: at,
      created_at: at,
    },
  ];
  if (opts.climate) {
    events.push({
      id: `env-${n}`,
      event_type: "environment",
      source: "manual",
      plant_id: null,
      occurred_at: at,
      created_at: at,
      environment_events: { temperature_c: TEMP_C, humidity_pct: 55, vpd_kpa: null },
    });
  }
  return { diary, parentId, events };
}

/** The Timeline display steps the dropdown sees (spine type stamp, sibling attach). */
function display(saves: ReturnType<typeof save>[]): Row[] {
  const spine = new Map(saves.map((s) => [s.parentId, "observation"] as const));
  const typed = applyLinkedEventTypes(
    saves.map((s) => s.diary),
    spine,
  );
  return TimelineQuickLogEnvironmentSnapshotReadback.attach(
    typed as never,
    saves.flatMap((s) => s.events) as never,
  ) as unknown as Row[];
}

function countOf(rows: Row[], token: string): number {
  return deriveTimelineEventTypeOptions(rows).find((o) => o.id === token)?.count ?? 0;
}

describe("Timeline log-type dropdown counts a noted tent climate as Measurement (#2733)", () => {
  it("counts and filters the note with temperature and humidity under Measurement", () => {
    const rows = display([save(1, { climate: true })]);
    const [row] = rows;
    // The card and the chip already say Measurement; the stored token does not.
    expect(row.details.event_type).toBe("observation");
    expect(resolveEffectiveQuickLogCareType({ details: row.details })).toBe("measurement");
    expect(diaryEntryBelongsInTimelineMeasurements(row)).toBe(true);

    expect(countOf(rows, "measurement")).toBe(1);
    expect(countOf(rows, "observation")).toBe(0);
    expect(filterTimelineEvidenceRows(rows, { eventType: "measurement" })).toHaveLength(1);
    expect(filterTimelineEvidenceRows(rows, { eventType: "observation" })).toHaveLength(0);
  });

  it("keeps a note without readings under Observation", () => {
    const rows = display([save(2, { climate: false })]);
    const [row] = rows;
    expect(resolveEffectiveQuickLogCareType({ details: row.details })).not.toBe("measurement");
    expect(countOf(rows, "observation")).toBe(1);
    expect(countOf(rows, "measurement")).toBe(0);
    expect(timelineEvidenceRowMatches(row, { eventType: "observation" })).toBe(true);
    expect(timelineEvidenceRowMatches(row, { eventType: "measurement" })).toBe(false);
  });

  it("moves Measurement by one per repeated save and lists each save once", () => {
    const one = display([save(1, { climate: true }), save(9, { climate: false })]);
    const three = display([
      save(1, { climate: true }),
      save(2, { climate: true }),
      save(3, { climate: true }),
      save(9, { climate: false }),
    ]);
    expect(countOf(one, "measurement")).toBe(1);
    expect(countOf(three, "measurement")).toBe(3);
    expect(countOf(three, "observation")).toBe(1);
    expect(three.map((r) => r.id)).toEqual(["diary-1", "diary-2", "diary-3", "diary-9"]);
  });

  it("gives the same counts on a hard reload and does not mutate the rows", () => {
    const build = () => display([save(1, { climate: true }), save(2, { climate: false })]);
    const first = build();
    const before = JSON.stringify(first);
    const firstOptions = deriveTimelineEventTypeOptions(first);
    filterTimelineEvidenceRows(first, { eventType: "measurement" });
    expect(JSON.stringify(first)).toBe(before);
    // A reload re-reads the same persisted rows into fresh objects.
    expect(deriveTimelineEventTypeOptions(build())).toEqual(firstOptions);
    expect(deriveTimelineEventTypeOptions(first)).toEqual(firstOptions);
  });

  it("keeps the original readings, manual attribution, and a snapshot-free save payload", () => {
    const s = save(1, { climate: true });
    expect(s.diary.details).not.toHaveProperty("sensor_snapshot");
    expect(s.diary.details).not.toHaveProperty("manual_sensor_snapshot");
    const [row] = display([s]);
    const snap = row.details.sensor_snapshot as Record<string, unknown>;
    expect(snap.temp_c).toBeCloseTo(TEMP_C, 6);
    expect(snap.rh).toBe(55);
    expect(snap.source).toBe("manual");
  });

  it("leaves every other stored log type unchanged", () => {
    const rows: Row[] = [
      {
        id: "w1",
        tent_id: TENT,
        plant_id: null,
        note: "watered",
        stage: null,
        entry_at: "2026-11-03T20:00:00.000Z",
        details: { event_type: "watering", ph: 6.2, sensor_snapshot: { temp_c: 24, rh: 55 } },
      },
      {
        id: "f1",
        tent_id: TENT,
        plant_id: null,
        note: "fed",
        stage: null,
        entry_at: "2026-11-03T20:01:00.000Z",
        details: { event_type: "feeding" },
      },
    ];
    expect(deriveTimelineEventTypeOptions(rows).map((o) => [o.id, o.count])).toEqual([
      ["feeding", 1],
      ["watering", 1],
    ]);
  });
});
