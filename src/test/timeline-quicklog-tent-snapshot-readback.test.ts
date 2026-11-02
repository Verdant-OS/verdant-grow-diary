import { describe, expect, it } from "vitest";

import { buildGrowDiaryReportModel } from "@/lib/growDiaryPdfExport";
import { buildTimelineEvidenceDetailViewModel } from "@/lib/timelineEvidenceDetailViewModel";
import { diaryEntryBelongsInTimelineMeasurements } from "@/lib/timelineManualSensorMeasurementRules";
import {
  buildTimelineCardSensorSnapshotViewModel,
  resolveTimelineCardSensorResolution,
} from "@/lib/timelineSensorSnapshotViewModel";
import { TimelineQuickLogEnvironmentSnapshotReadback } from "@/lib/timelineQuickLogEnvironmentSnapshotReadback";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";

const TENT = "tent-1";
const WHEN = "2026-11-02T18:00:00.000Z";
const TEMP_C = fahrenheitToCelsius(76);
const NOW = Date.parse(WHEN);

function diary(overrides: Record<string, unknown> = {}) {
  return {
    id: "diary-1",
    plant_id: null,
    tent_id: TENT,
    entry_at: WHEN,
    note: "(quick log)",
    details: { linked_grow_event_id: "obs-1" } as Record<string, unknown>,
    ...overrides,
  };
}

function sibling(overrides: Record<string, unknown> = {}) {
  return {
    id: "env-1",
    plant_id: null,
    tent_id: TENT,
    event_type: "environment",
    source: "manual",
    occurred_at: WHEN,
    environment_events: {
      temperature_c: TEMP_C,
      humidity_pct: 55,
      vpd_kpa: 1.38,
    },
    ...overrides,
  };
}

function chipsOf(details: Record<string, unknown> | null | undefined) {
  const vm = buildTimelineCardSensorSnapshotViewModel(
    resolveTimelineCardSensorResolution(details),
    {
      validateManualCompatibility: true,
      temperatureUnit: "fahrenheit",
    },
  );
  return vm.sensorViewModel.kind === "chips" ? vm.sensorViewModel.chips.map((c) => c.display) : [];
}

describe("TimelineQuickLogEnvironmentSnapshotReadback", () => {
  it("shows the tent Quick Log snapshot on the timeline card, as a measurement, and in the PDF", () => {
    const [attached] = TimelineQuickLogEnvironmentSnapshotReadback.attach([diary()], [sibling()]);
    expect(chipsOf(attached.details)).toEqual(expect.arrayContaining(["76°F", "55%", "1.38 kPa"]));
    expect(diaryEntryBelongsInTimelineMeasurements(attached, new Date(NOW))).toBe(true);
    const evidence = buildTimelineEvidenceDetailViewModel(
      { id: attached.id, note: "(quick log)", entry_at: WHEN, details: attached.details },
      { nowMs: NOW },
    );
    expect(evidence?.contextHint.description).not.toContain("No photo and no sensor snapshot");
    expect(evidence?.sensor?.tempC).toBeCloseTo(TEMP_C, 5);
    expect(evidence?.sensor?.rhPercent).toBe(55);

    const line = TimelineQuickLogEnvironmentSnapshotReadback.pdfReadingLine(attached.details);
    expect(line).toContain("76°F");
    expect(line).toContain("55%");
    const model = buildGrowDiaryReportModel({
      grow: { name: "Diary Summary" },
      counts: { diary: 1, sensorSnapshots: line ? 1 : undefined },
      recent: [
        {
          id: "diary-1",
          kind: "diary",
          ts: WHEN,
          title: "Note",
          detail: line,
        },
      ],
    });
    expect(model.countsRows.find((row) => row.label === "Sensor snapshots")?.value).toBe("1");
    expect(model.events[0]?.detail).toContain("76°F");
  });

  it("ignores a live sibling and does not invent a missing humidity", () => {
    const [live] = TimelineQuickLogEnvironmentSnapshotReadback.attach(
      [diary()],
      [sibling({ source: "live" })],
    );
    expect(chipsOf(live.details)).toEqual([]);

    const [partial] = TimelineQuickLogEnvironmentSnapshotReadback.attach(
      [diary({ id: "diary-temp" })],
      [sibling({ environment_events: [{ temperature_c: String(TEMP_C) }] })],
    );
    const displays = chipsOf(partial.details);
    expect(displays).toContain("76°F");
    expect(displays.some((d) => d.includes("%"))).toBe(false);
  });

  it("uses one environment event once and leaves an existing snapshot in place", () => {
    const rows = TimelineQuickLogEnvironmentSnapshotReadback.attach(
      [diary({ id: "a" }), diary({ id: "b" })],
      [sibling()],
    );
    const attachedCount = rows.filter((row) => chipsOf(row.details).includes("76°F")).length;
    expect(attachedCount).toBe(0);

    const existing = { sensor_snapshot: { source: "manual", ts: WHEN, temp_c: 20, rh: 40 } };
    const [kept] = TimelineQuickLogEnvironmentSnapshotReadback.attach(
      [diary({ details: existing })],
      [sibling()],
    );
    expect(kept.details.sensor_snapshot).toEqual(existing.sensor_snapshot);
  });
});
