import { describe, expect, it } from "vitest";
import {
  buildDiaryCalendarViewModel,
  type DiaryCalendarRawEntry,
} from "@/lib/diaryCalendarViewModel";
import { DeletedPlantDisplayRules } from "@/lib/plantLifecycleWriteRules";

/**
 * The calendar's detailed history must only say "Deleted plant" when the
 * owner's plant directory has loaded and the row's plant id is not in it.
 * Most save paths never store details.plant_name, so a missing stored name
 * alone says nothing about whether the plant still exists.
 */

const LIVE_ID = "11111111-1111-4111-8111-111111111111";
const GONE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_OWNER_ID = "33333333-3333-4333-8333-333333333333";

function watering(id: string, extra: Partial<DiaryCalendarRawEntry>): DiaryCalendarRawEntry {
  return {
    id,
    entry_at: "2026-11-10T12:00:00Z",
    event_type: "watering",
    details: { event_type: "watering" },
    ...extra,
  };
}

function plantNameOf(
  entry: DiaryCalendarRawEntry,
  plantNamesById: ReadonlyMap<string, string> | null | undefined,
): string | null {
  const groups = buildDiaryCalendarViewModel([entry], "celsius", { plantNamesById });
  expect(groups).toHaveLength(1);
  expect(groups[0].events).toHaveLength(1);
  return groups[0].events[0].plantName;
}

const directory: ReadonlyMap<string, string> = new Map([[LIVE_ID, "Gelato #3"]]);

describe("diary calendar plant name uses the owner's plant directory", () => {
  it("shows a live plant's name when the row stored no plant_name", () => {
    expect(plantNameOf(watering("e1", { plant_id: LIVE_ID }), directory)).toBe("Gelato #3");
  });

  it("labels a plant the loaded directory does not have as deleted", () => {
    expect(plantNameOf(watering("e2", { plant_id: GONE_ID }), directory)).toBe(
      DeletedPlantDisplayRules.LABEL,
    );
  });

  it("labels a plant id as deleted against a loaded but empty directory", () => {
    expect(plantNameOf(watering("e3", { plant_id: GONE_ID }), new Map())).toBe(
      DeletedPlantDisplayRules.LABEL,
    );
  });

  it("stays blank, never 'Deleted plant', while the directory is unavailable", () => {
    expect(plantNameOf(watering("e4", { plant_id: LIVE_ID }), null)).toBeNull();
    expect(plantNameOf(watering("e5", { plant_id: LIVE_ID }), undefined)).toBeNull();
    // The default call (no options) is the same unavailable case.
    const groups = buildDiaryCalendarViewModel([watering("e6", { plant_id: LIVE_ID })], "celsius");
    expect(groups[0].events[0].plantName).toBeNull();
  });

  it("has no plant label for a row without a plant id", () => {
    expect(plantNameOf(watering("e7", {}), directory)).toBeNull();
    expect(plantNameOf(watering("e8", { plant_id: null }), directory)).toBeNull();
    expect(plantNameOf(watering("e9", { plant_id: "   " }), directory)).toBeNull();
  });

  it("keeps a stored plant_name ahead of the directory, even for a removed plant", () => {
    expect(
      plantNameOf(
        watering("e10", {
          plant_id: GONE_ID,
          details: { event_type: "watering", plant_name: "Blue Dream" },
        }),
        directory,
      ),
    ).toBe("Blue Dream");
    expect(
      plantNameOf(
        watering("e11", {
          plant_id: LIVE_ID,
          details: { event_type: "watering", plant_name: "Old label" },
        }),
        directory,
      ),
    ).toBe("Old label");
  });

  it("treats a blank stored name as missing and falls back to the directory", () => {
    expect(
      plantNameOf(
        watering("e12", {
          plant_id: LIVE_ID,
          details: { event_type: "watering", plant_name: "   " },
        }),
        directory,
      ),
    ).toBe("Gelato #3");
  });

  it("treats a blank directory name as a live plant with no usable name, not deleted", () => {
    const blank: ReadonlyMap<string, string> = new Map([[LIVE_ID, "   "]]);
    expect(plantNameOf(watering("e13", { plant_id: LIVE_ID }), blank)).toBeNull();
  });

  it("trims a padded plant id before looking it up", () => {
    expect(plantNameOf(watering("e14", { plant_id: `  ${LIVE_ID}  ` }), directory)).toBe(
      "Gelato #3",
    );
  });

  it("handles old rows with null, non-object or non-string-name details", () => {
    expect(plantNameOf(watering("e15", { plant_id: LIVE_ID, details: null }), directory)).toBe(
      "Gelato #3",
    );
    expect(
      plantNameOf(
        watering("e16", {
          event_type: "watering",
          plant_id: LIVE_ID,
          details: { plant_name: 42 } as unknown as Record<string, unknown>,
        }),
        directory,
      ),
    ).toBe("Gelato #3");
    expect(plantNameOf(watering("e17", { plant_id: GONE_ID, details: null }), directory)).toBe(
      DeletedPlantDisplayRules.LABEL,
    );
  });

  it("caps a long directory name like a stored one", () => {
    const long = "x".repeat(120);
    const names: ReadonlyMap<string, string> = new Map([[LIVE_ID, long]]);
    expect(plantNameOf(watering("e18", { plant_id: LIVE_ID }), names)).toBe("x".repeat(80));
  });

  it("never shows a name that is not in the owner's directory", () => {
    // The directory is the owner's plants only; another owner's plant id
    // resolves to the deleted label, never to any name.
    const name = plantNameOf(watering("e19", { plant_id: OTHER_OWNER_ID }), directory);
    expect(name).toBe(DeletedPlantDisplayRules.LABEL);
    expect(name).not.toBe("Gelato #3");
  });

  it("is deterministic for the same input", () => {
    const rows = [
      watering("a", { plant_id: LIVE_ID }),
      watering("b", { plant_id: GONE_ID }),
      watering("c", {}),
    ];
    const first = buildDiaryCalendarViewModel(rows, "celsius", { plantNamesById: directory });
    const second = buildDiaryCalendarViewModel(rows, "celsius", { plantNamesById: directory });
    expect(second).toEqual(first);
    expect(first[0].events.map((e) => [e.id, e.plantName])).toEqual([
      ["a", "Gelato #3"],
      ["b", DeletedPlantDisplayRules.LABEL],
      ["c", null],
    ]);
  });
});
