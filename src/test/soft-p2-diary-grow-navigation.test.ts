import { describe, expect, it } from "vitest";
import { buildGuidedActionChecklist } from "@/lib/guidedActionChecklistRules";
import {
  buildDailyCheckEntryHref,
  buildDailyCheckPostSubmitActions,
  resolveDailyCheckPostSubmitHref,
} from "@/lib/dailyCheckPostSubmitRules";
import { buildPlantDetailQuickActions } from "@/lib/plantDetailQuickActions";
import { buildGrowRoomQuickActionLinks } from "@/lib/growRoomQuickActionRules";
import { buildOnboardingChecklistViewModel } from "@/lib/onboardingChecklistViewModel";
import { withGrowId } from "@/lib/routes";

const GROW = "00000000-0000-4000-8000-000000000001";
const PLANT = "00000000-0000-4000-8000-000000000002";
const TENT = "00000000-0000-4000-8000-000000000003";
const fixture = {
  now: Date.parse("2026-09-10T12:00:00Z"),
  scopedGrowId: GROW,
  plants: [{ id: PLANT, name: "Fixture plant", tentId: TENT, stage: "veg" }],
  tents: [],
  diaryEntries: [],
  latestReadingByTent: {},
  openAlerts: [],
  dismissedIds: [],
};

describe("Soft P2 weekly batch: diary navigation", () => {
  it("retains query values and the anchor while carrying one encoded growId", () => {
    const href = withGrowId("/daily-check?plantId=plant%20one&method=note#entry", "grow & two");
    const url = new URL(href, "https://fixture.invalid");
    expect(url.searchParams.get("plantId")).toBe("plant one");
    expect(url.searchParams.get("method")).toBe("note");
    expect(url.searchParams.getAll("growId")).toEqual(["grow & two"]);
    expect(url.hash).toBe("#entry");
    expect(withGrowId(href, "grow & two")).toBe(href);
  });

  it.each([null, undefined, ""])("does not invent a grow for %s", (growId) => {
    const href = `/daily-check?plantId=${PLANT}#entry`;
    expect(withGrowId(href, growId)).toBe(href);
  });

  it("uses the carried grow on source-aware return destinations", () => {
    for (const source of ["dashboard", "plant-detail", "plants", null] as const) {
      const input = { source, growId: GROW, plantId: PLANT };
      expect(
        new URL(resolveDailyCheckPostSubmitHref(input), "https://fixture.invalid").searchParams.get(
          "growId",
        ),
      ).toBe(GROW);
      for (const action of buildDailyCheckPostSubmitActions(input)) {
        expect(new URL(action.href, "https://fixture.invalid").searchParams.get("growId")).toBe(
          GROW,
        );
      }
    }
  });
  it.each([
    ["A", "water"],
    ["B", "photo"],
  ])("%s dashboard diary %s CTA retains the same growId", (_pin, action) => {
    const item = buildGuidedActionChecklist(fixture).find(
      (entry) => entry.id === `cadence:${action}:${PLANT}`,
    )!;
    const url = new URL(item.ctaHref, "https://fixture.invalid");
    expect(url.pathname).toBe("/daily-check");
    expect(url.searchParams.get("plantId")).toBe(PLANT);
    expect(url.searchParams.get("from")).toBe("dashboard");
    expect(url.searchParams.get("growId")).toBe(GROW);
  });

  it("preserves existing entry and return contracts when no growId was supplied", () => {
    expect(
      buildDailyCheckEntryHref({ plantId: PLANT, source: "plant-detail", method: "note" }),
    ).toBe(`/daily-check?plantId=${PLANT}&from=plant-detail&method=note`);
    expect(resolveDailyCheckPostSubmitHref({ plantId: PLANT, source: "plant-detail" })).toBe(
      `/plants/${PLANT}`,
    );
    expect(buildDailyCheckPostSubmitActions({ plantId: null })).toEqual([
      { key: "dashboard", label: "Back to Dashboard", href: "/", primary: true },
    ]);
  });

  it("keeps working plant Quick Log and photo prefills scoped", () => {
    const entries = buildPlantDetailQuickActions({ plantId: PLANT, growId: GROW, tentId: TENT });
    for (const kind of ["quicklog", "upload_photo"]) {
      expect(entries.find((entry) => entry.kind === kind)?.eventPayload).toMatchObject({
        plantId: PLANT,
        growId: GROW,
        tentId: TENT,
      });
    }
  });

  it("keeps working dashboard main Quick Log scoped", () => {
    const vm = buildOnboardingChecklistViewModel({
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      diaryEntryCount: 0,
      sensorReadingCount: 0,
      connectedScope: { growId: GROW, tentId: TENT, plantId: PLANT },
    });
    const firstLog = vm.steps.find((step) => step.key === "first_log")!;
    expect(new URL(firstLog.href, "https://fixture.invalid").searchParams.get("growId")).toBe(GROW);
    expect(firstLog.quickLogPrefill).toMatchObject({ growId: GROW, plantId: PLANT, tentId: TENT });
  });

  it("keeps working tent Quick Log, photo and feeding prefills scoped", () => {
    const entries = buildGrowRoomQuickActionLinks({
      tent: { id: TENT, name: "Fixture tent", grow_id: GROW },
      plantId: PLANT,
    });
    for (const kind of ["quick_log", "photo", "feeding"]) {
      expect(entries.find((entry) => entry.kind === kind)?.quickLogPrefill).toMatchObject({
        plantId: PLANT,
        tentId: TENT,
        growId: GROW,
      });
    }
  });
});
