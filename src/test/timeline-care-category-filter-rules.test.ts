/**
 * Care-category chips on the main Grow Timeline: watering, feeding,
 * training, diagnoses (symptoms bucket).
 */
import { describe, expect, it } from "vitest";
import {
  countTimelineCareCategoryBuckets,
  filterTimelineEvidenceRows,
  isTimelineEvidenceFilterActive,
  timelineEvidenceRowMatches,
  type TimelineEvidenceRow,
} from "@/lib/timelineEvidenceFilterRules";

function row(
  overrides: Partial<TimelineEvidenceRow> & { event_type?: string },
): TimelineEvidenceRow {
  const { event_type, details, ...rest } = overrides;
  return {
    id: rest.id ?? "e1",
    note: rest.note ?? null,
    stage: rest.stage ?? null,
    plant_id: rest.plant_id ?? null,
    tent_id: rest.tent_id ?? null,
    entry_at: rest.entry_at ?? "2026-07-15T18:00:00.000Z",
    photo_url: rest.photo_url ?? null,
    details: {
      ...(event_type ? { event_type } : {}),
      ...(details ?? {}),
    },
  };
}

describe("timeline care category filter", () => {
  const rows: TimelineEvidenceRow[] = [
    row({ id: "w1", event_type: "watering" }),
    row({ id: "f1", event_type: "feeding" }),
    row({ id: "t1", event_type: "training" }),
    row({ id: "t2", event_type: "defoliation" }),
    row({ id: "d1", event_type: "diagnosis" }),
    row({ id: "d2", event_type: "pest_disease" }),
    row({ id: "d3", event_type: "symptoms" }),
    row({ id: "n1", event_type: "note" }),
  ];

  it("filters watering / feeding / training via careCategory", () => {
    expect(filterTimelineEvidenceRows(rows, { careCategory: "watering" }).map((r) => r.id)).toEqual(
      ["w1"],
    );
    expect(filterTimelineEvidenceRows(rows, { careCategory: "feeding" }).map((r) => r.id)).toEqual([
      "f1",
    ]);
    expect(filterTimelineEvidenceRows(rows, { careCategory: "training" }).map((r) => r.id)).toEqual(
      ["t1", "t2"],
    );
  });

  it("groups diagnosis + pest_disease + symptoms under Diagnoses (symptoms)", () => {
    expect(filterTimelineEvidenceRows(rows, { careCategory: "symptoms" }).map((r) => r.id)).toEqual(
      ["d1", "d2", "d3"],
    );
  });

  it("accepts diagnoses alias for careCategory", () => {
    expect(
      timelineEvidenceRowMatches(row({ event_type: "diagnosis" }), {
        careCategory: "diagnoses" as never,
      }),
    ).toBe(true);
  });

  it("counts care buckets for chip labels", () => {
    const counts = countTimelineCareCategoryBuckets(rows);
    expect(counts.all).toBe(8);
    expect(counts.watering).toBe(1);
    expect(counts.feeding).toBe(1);
    expect(counts.training).toBe(2);
    expect(counts.symptoms).toBe(3);
  });

  it("marks care category as an active evidence filter", () => {
    expect(isTimelineEvidenceFilterActive({ careCategory: "all" })).toBe(false);
    expect(isTimelineEvidenceFilterActive({ careCategory: "watering" })).toBe(true);
  });

  it("combines care category with date range", () => {
    const mixed = [
      row({ id: "w-early", event_type: "watering", entry_at: "2026-07-10T12:00:00.000Z" }),
      row({ id: "w-mid", event_type: "watering", entry_at: "2026-07-15T12:00:00.000Z" }),
      row({ id: "f-mid", event_type: "feeding", entry_at: "2026-07-15T12:00:00.000Z" }),
    ];
    expect(
      filterTimelineEvidenceRows(mixed, {
        careCategory: "watering",
        startDate: "2026-07-14",
        endDate: "2026-07-16",
      }).map((r) => r.id),
    ).toEqual(["w-mid"]);
  });

  it("combines care category with keyword search", () => {
    const mixed = [
      row({ id: "w-a", event_type: "watering", note: "top water only" }),
      row({ id: "w-b", event_type: "watering", note: "runoff check" }),
    ];
    expect(
      filterTimelineEvidenceRows(mixed, { careCategory: "watering", query: "runoff" }).map(
        (r) => r.id,
      ),
    ).toEqual(["w-b"]);
  });
});
