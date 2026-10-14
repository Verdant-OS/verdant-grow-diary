import { describe, expect, it } from "vitest";
import { timelineSensorSourceFilterKinds } from "@/constants/sensorSourceLabels";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";
import {
  resolveTimelineCardPlaceLabels,
  withResolvedTimelinePlaceDetails,
} from "@/lib/timelineEvidenceFilterRules";

const PLANTS = new Map([
  ["plant-1", "Blue Dream"],
  ["plant-2", ""],
]);
const TENTS = new Map([["tent-1", "Flower tent"]]);

describe("presentTimelineDiaryEntryDetails grower-facing keys", () => {
  it("renders logged_at as a local label and hides the raw chip", () => {
    const result = presentTimelineDiaryEntryDetails(
      {
        event_type: "photo",
        logged_at: "2026-10-10T09:15:03.000Z",
        attached_to_action: "Photo",
      },
      "fahrenheit",
      { formatTimestamp: () => "Oct 10, 2026, 9:15 AM" },
    );
    expect(result.detailLines).toEqual([
      { key: "logged_at", label: "Logged at", value: "Oct 10, 2026, 9:15 AM" },
      { key: "attached_to_action", label: "Attached to", value: "Photo" },
    ]);
    expect(result.extra).toEqual([]);
  });

  it("drops a null or unreadable logged_at instead of a raw chip", () => {
    expect(
      presentTimelineDiaryEntryDetails(
        { logged_at: null, attached_to_action: "  " },
        "fahrenheit",
        { formatTimestamp: () => "unused" },
      ).extra,
    ).toEqual([]);
    expect(
      presentTimelineDiaryEntryDetails({ logged_at: "not-a-time" }, "fahrenheit", {
        formatTimestamp: () => null,
      }),
    ).toEqual({ detailLines: [], extra: [] });
  });

  it("repeats the same labels for the same details", () => {
    const details = { logged_at: "2026-10-10T09:15:03.000Z", attached_to_action: "photo" };
    const options = { formatTimestamp: () => "Oct 10, 2026, 9:15 AM" };
    const result = presentTimelineDiaryEntryDetails(details, "fahrenheit", options);
    expect(result.detailLines.map((line) => line.label)).toEqual(["Logged at", "Attached to"]);
    expect(result.extra).toEqual([]);
    expect(result).toEqual(presentTimelineDiaryEntryDetails(details, "fahrenheit", options));
  });
});

describe("resolveTimelineCardPlaceLabels", () => {
  it("uses the directory when the diary row has ids but no names", () => {
    expect(
      resolveTimelineCardPlaceLabels({
        plantId: "plant-1",
        tentId: "tent-1",
        details: { event_type: "photo" },
        plantNamesById: PLANTS,
        tentNamesById: TENTS,
      }),
    ).toEqual({ plantName: "Blue Dream", tentName: "Flower tent" });
  });

  it("prefers names already stored on the row", () => {
    expect(
      resolveTimelineCardPlaceLabels({
        plantId: "plant-1",
        tentId: "tent-1",
        details: { plant_name: "OG", tent_name: "Veg tent" },
        plantNamesById: PLANTS,
        tentNamesById: TENTS,
      }),
    ).toEqual({ plantName: "OG", tentName: "Veg tent" });
  });

  it("returns null names when nothing resolves", () => {
    expect(
      resolveTimelineCardPlaceLabels({
        plantId: null,
        tentId: "missing",
        details: null,
        plantNamesById: null,
        tentNamesById: TENTS,
      }),
    ).toEqual({ plantName: null, tentName: null });
  });

  it("fills only blank drawer fields", () => {
    expect(
      withResolvedTimelinePlaceDetails(
        { event_type: "photo", plant_name: "OG" },
        { plantName: "Blue Dream", tentName: "Flower tent" },
      ),
    ).toEqual({ event_type: "photo", plant_name: "OG", tent_name: "Flower tent" });
  });
});

describe("timelineSensorSourceFilterKinds", () => {
  it("hides Demo for a real grower with no demo rows", () => {
    expect(
      timelineSensorSourceFilterKinds({ demoDataPresent: false, demoMode: false }),
    ).not.toContain("demo");
  });

  it("shows Demo when demo rows are loaded or demo mode is on", () => {
    expect(timelineSensorSourceFilterKinds({ demoDataPresent: true })).toContain("demo");
    expect(timelineSensorSourceFilterKinds({ demoDataPresent: false, demoMode: true })).toContain(
      "demo",
    );
  });

  it("keeps Demo visible when it is already selected", () => {
    expect(
      timelineSensorSourceFilterKinds({
        demoDataPresent: false,
        demoMode: false,
        selected: ["demo"],
      }),
    ).toContain("demo");
  });
});
