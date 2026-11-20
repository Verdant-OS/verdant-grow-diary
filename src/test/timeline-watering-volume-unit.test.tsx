import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import { buildRecentQuickLogActivity } from "@/lib/quickLogHistoryRules";
import { resolveQuickLogEventIdentity } from "@/lib/quickLogEventIdentityRules";
import { formatStoredWaterVolume } from "@/lib/quickLogWaterVolumeUnitRules";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";
import {
  saveWaterVolumeEntryUnit,
  WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY,
} from "@/lib/waterVolumeEntryUnitPreference";
import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";
import { mapGrowEventsToRecentRawEntries } from "@/lib/growEventToDiaryRawEntry";

// #3041: Timeline reads a stored ml watering amount back in the grower's Quick Log Water unit.

const wateringRow = (volumeMl: number) =>
  normalizeDiaryEntries({
    rawEntries: [
      {
        id: "water-1",
        grow_id: "g1",
        plant_id: "p1",
        tent_id: "t1",
        entry_at: "2026-11-19T12:00:00.000Z",
        note: "(quick log)",
        details: {
          event_type: "watering",
          quick_log_version: 2,
          watering: { volume_ml: volumeMl },
        },
      },
    ],
  });

describe("formatStoredWaterVolume", () => {
  it("shows a stored ml amount in the chosen unit with its symbol", () => {
    expect(formatStoredWaterVolume(1500, "L")).toBe("1.5 L");
    expect(formatStoredWaterVolume(3785, "gal")).toBe("1 gal");
    expect(formatStoredWaterVolume(1500, "ml")).toBe("1500 ml");
  });

  it("keeps the ml text when the unit display rejects the value", () => {
    expect(formatStoredWaterVolume(-5, "L")).toBe("-5 ml");
  });
});

describe("Quick Log history summary follows the water unit", () => {
  it("shows 1.5 L for 1500 ml stored when the unit is L", () => {
    const [row] = buildRecentQuickLogActivity(wateringRow(1500), 10, { waterUnit: "L" });
    expect(row.summarySuffix).toBe("1.5 L");
  });

  it("stays ml when no unit is passed", () => {
    const [row] = buildRecentQuickLogActivity(wateringRow(1500), 10);
    expect(row.summarySuffix).toBe("1500 ml");
  });

  it("keeps a feeding volume in ml", () => {
    const identity = resolveQuickLogEventIdentity(
      { eventType: "feeding", details: { wateringAmountMl: 750 } as never },
      { waterUnit: "L" },
    );
    expect(identity.summarySuffix).toBe("750 ml");
  });
});

describe("Timeline card detail lines follow the water unit", () => {
  it("shows Water Volume and Runoff in L", () => {
    const { detailLines } = presentTimelineDiaryEntryDetails(
      { event_type: "watering", watering: { volume_ml: 1500, runoff_ml: 250 } },
      "celsius",
      { waterUnit: "L" },
    );
    expect(detailLines).toContainEqual({
      key: "watering.volume_ml",
      label: "Water Volume",
      value: "1.5 L",
    });
    expect(detailLines).toContainEqual({
      key: "watering.runoff_ml",
      label: "Runoff",
      value: "0.25 L",
    });
  });

  it("converts a flat watering amount, including text saved by the edit dialog", () => {
    for (const amount of [1500, "1500"]) {
      const { detailLines } = presentTimelineDiaryEntryDetails(
        { event_type: "watering", watering_amount_ml: amount },
        "celsius",
        { waterUnit: "gal" },
      );
      expect(detailLines).toContainEqual({
        key: "watering.volume_ml",
        label: "Water Volume",
        value: "0.4 gal",
      });
    }
  });

  it("keeps Feed Volume in ml", () => {
    const { detailLines } = presentTimelineDiaryEntryDetails(
      { event_type: "feeding", feeding: { volume_ml: 750 } },
      "celsius",
      { waterUnit: "L" },
    );
    expect(detailLines).toContainEqual({
      key: "feeding.volume_ml",
      label: "Feed Volume",
      value: "750 ml",
    });
  });
});

describe("Timeline Recent Quick Logs badge", () => {
  beforeEach(() => window.localStorage.removeItem(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY));
  afterEach(() => window.localStorage.removeItem(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY));

  function renderPanel() {
    const rawEntries = mapGrowEventsToRecentRawEntries([
      {
        id: "ge-water-1500",
        grow_id: "g1",
        plant_id: "p1",
        tent_id: "t1",
        event_type: "watering",
        occurred_at: "2026-11-19T12:00:00.000Z",
        note: "Watered plant",
        source: "manual",
        is_deleted: false,
        watering_events: [{ volume_ml: 1500 }],
      },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <RecentQuickLogActivityPanel rawEntries={rawEntries} />
      </QueryClientProvider>,
    );
    const section = screen.getByTestId("quicklog-history-section-recent");
    return within(section).getByTestId("quicklog-history-row");
  }

  it("shows Watering · 1.5 L with the default unit (L)", () => {
    expect(renderPanel()).toHaveTextContent("Watering · 1.5 L");
  });

  it("follows a unit change made in this tab", () => {
    const row = renderPanel();
    act(() => {
      saveWaterVolumeEntryUnit("ml");
    });
    expect(row).toHaveTextContent("Watering · 1500 ml");
  });
});
