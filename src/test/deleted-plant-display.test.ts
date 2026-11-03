import { describe, expect, it } from "vitest";
import { buildDiaryCalendarViewModel } from "@/lib/diaryCalendarViewModel";
import { DeletedPlantDisplayRules } from "@/lib/plantLifecycleWriteRules";
import { countsAsNonBlockingTentPlant, evaluateTentDeleteGuard } from "@/lib/tentManagementRules";
import { resolveTimelineCardPlaceLabels } from "@/lib/timelineEvidenceFilterRules";

const MERGED_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("deleted plant labels", () => {
  it("labels a timeline card when the loaded directory has no plant", () => {
    expect(
      resolveTimelineCardPlaceLabels({
        plantId: "gone",
        details: { event_type: "note" },
        plantNamesById: new Map(),
      }).plantName,
    ).toBe(DeletedPlantDisplayRules.LABEL);
  });

  it("keeps a stored diary name and otherwise labels the leftover plant id", () => {
    const kept = buildDiaryCalendarViewModel([
      {
        id: "e1",
        entry_at: "2026-06-10T11:00:00Z",
        event_type: "watering",
        plant_id: "gone",
        details: { event_type: "watering", plant_name: "Blue Dream" },
      },
    ]);
    expect(kept[0].events[0].plantName).toBe("Blue Dream");

    const deleted = buildDiaryCalendarViewModel([
      {
        id: "e2",
        entry_at: "2026-06-10T12:00:00Z",
        event_type: "watering",
        plant_id: "gone",
        details: { event_type: "watering" },
      },
    ]);
    expect(deleted[0].events[0].plantName).toBe("Deleted plant");

    const unnamed = buildDiaryCalendarViewModel([
      {
        id: "e3",
        entry_at: "2026-06-10T13:00:00Z",
        event_type: "watering",
        details: { event_type: "watering" },
      },
    ]);
    expect(unnamed[0].events[0].plantName).toBeNull();
  });
});

describe("legacy merged notes do not block tent delete", () => {
  it("counts an archived flag or a merge marker, and not a plain note", () => {
    expect(countsAsNonBlockingTentPlant({ isArchived: true, lastNote: "kept" })).toBe(true);
    expect(
      countsAsNonBlockingTentPlant({
        isArchived: false,
        lastNote: `Merged into ${MERGED_ID}`,
      }),
    ).toBe(true);
    expect(countsAsNonBlockingTentPlant({ isArchived: false, lastNote: "watered" })).toBe(false);
    expect(
      evaluateTentDeleteGuard({
        tentId: "tent-1",
        assignedPlantCount: 1,
        archivedAssignedPlantCount: 1,
        archiveSupported: true,
      }).canDelete,
    ).toBe(true);
  });
});
