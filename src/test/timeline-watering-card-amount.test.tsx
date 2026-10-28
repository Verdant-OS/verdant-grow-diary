import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import { buildRecentQuickLogActivity } from "@/lib/quickLogHistoryRules";
import { buildGrowDiaryTimeline } from "@/lib/growDiaryTimelineRules";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";
import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";
import { mapGrowEventsToRecentRawEntries } from "@/lib/growEventToDiaryRawEntry";

describe("Timeline Watering card shows amount (#2180)", () => {
  it("extracts nested details.watering.volume_ml into RecentQuickLogActivity summarySuffix", () => {
    const normalized = normalizeDiaryEntries({
      rawEntries: [
        {
          id: "water-companion-1",
          grow_id: "g1",
          plant_id: "p1",
          tent_id: "t1",
          stage: "veg",
          entry_at: "2026-10-15T12:00:00.000Z",
          note: "(quick log)",
          details: {
            event_type: "watering",
            quick_log_version: 2,
            watering: { volume_ml: 500 },
          },
        },
      ],
    });
    const [row] = buildRecentQuickLogActivity(normalized, 10);
    expect(row).toBeDefined();
    expect(row.summarySuffix).toContain("500 ml");
  });

  it("renders flat watering_amount_ml as a Water Volume detail line on Timeline cards", () => {
    const result = presentTimelineDiaryEntryDetails(
      {
        event_type: "watering",
        watering_amount_ml: 500,
      },
      "celsius",
    );
    expect(result.detailLines).toContainEqual({
      key: "watering.volume_ml",
      label: "Water Volume",
      value: "500 ml",
    });
    expect(result.extra).toEqual([]);
  });

  it("labels flat feeding row volume as Feed Volume instead of Water Volume", () => {
    const result = presentTimelineDiaryEntryDetails(
      {
        event_type: "feeding",
        volume_ml: 750,
      },
      "celsius",
    );
    expect(result.detailLines).toContainEqual({
      key: "feeding.volume_ml",
      label: "Feed Volume",
      value: "750 ml",
    });
    expect(result.detailLines.find((line) => line.label === "Water Volume")).toBeUndefined();
    expect(result.extra).toEqual([]);
  });

  it("keeps feeding volume in the subtitle without adding a watering tag to feeding entries", () => {
    const items = buildGrowDiaryTimeline({
      rawEntries: [
        {
          id: "de-feed-750",
          grow_id: "g1",
          plant_id: "p1",
          tent_id: "t1",
          entry_at: "2026-10-15T12:00:00.000Z",
          note: "Bloom feed",
          details: {
            event_type: "feeding",
            quick_log_version: 2,
            feeding: { volume_ml: 750, products: ["Bloom"] },
          },
        },
      ],
      filter: { includeInvalid: true },
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.subtitle).toContain("750 ml");
    expect(items[0]?.tags).toContain("feeding");
    expect(items[0]?.tags).not.toContain("watering");
  });

  it("renders 500 ml on the Timeline Recent Quick Logs Watering card from a grow_events spine", () => {
    const rawEntries = mapGrowEventsToRecentRawEntries([
      {
        id: "ge-water-500",
        grow_id: "g1",
        plant_id: "p1",
        tent_id: "t1",
        event_type: "watering",
        occurred_at: "2026-10-15T12:00:00.000Z",
        note: "Watered plant",
        source: "manual",
        is_deleted: false,
        watering_events: [{ volume_ml: 500 }],
      },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <RecentQuickLogActivityPanel rawEntries={rawEntries} />
      </QueryClientProvider>,
    );
    const section = screen.getByTestId("quicklog-history-section-recent");
    const row = within(section).getByTestId("quicklog-history-row");
    expect(row).toHaveTextContent("Watering");
    expect(row).toHaveTextContent("500 ml");
  });

  it("renders 500 ml on the Timeline Recent Quick Logs Watering card from a nested details.watering diary companion", () => {
    const rawEntries = [
      {
        id: "de-water-500",
        grow_id: "g1",
        plant_id: "p1",
        tent_id: "t1",
        entry_at: "2026-10-15T12:00:00.000Z",
        note: "Morning water",
        details: {
          event_type: "watering",
          quick_log_version: 2,
          watering: { volume_ml: 500 },
        },
      },
    ];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <RecentQuickLogActivityPanel rawEntries={rawEntries} />
      </QueryClientProvider>,
    );
    const section = screen.getByTestId("quicklog-history-section-recent");
    const row = within(section).getByTestId("quicklog-history-row");
    expect(row).toHaveTextContent("Watering");
    expect(row).toHaveTextContent("500 ml");

    const items = buildGrowDiaryTimeline({ rawEntries, filter: { includeInvalid: true } });
    expect(items[0]?.subtitle).toContain("500 ml");
  });
});
