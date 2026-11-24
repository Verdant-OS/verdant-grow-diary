import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WateringHistoryPanel from "@/components/WateringHistoryPanel";
import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";
import { useWaterVolumeEntryUnit } from "@/hooks/useWaterVolumeEntryUnit";
import { mapGrowEventsToRecentRawEntries } from "@/lib/growEventToDiaryRawEntry";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";
import {
  saveWaterVolumeEntryUnit,
  WATER_VOLUME_ENTRY_UNIT_CHANGE_EVENT,
  WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY,
} from "@/lib/waterVolumeEntryUnitPreference";
import {
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

afterEach(() => {
  removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
});

const diaryRow = (details: Record<string, unknown>) => [
  {
    id: "w1",
    grow_id: "g1",
    plant_id: "p1",
    tent_id: "t1",
    entry_at: "2026-11-19T12:00:00.000Z",
    entry_type: "watering",
    note: "Watered",
    details,
  },
];

function renderHistory(details: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <WateringHistoryPanel rawEntries={diaryRow(details)} />
    </QueryClientProvider>,
  );
}

describe("Watering history uses the remembered water unit", () => {
  it("shows 1.5 L on the history chips when the unit is L", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "L");
    renderHistory({ watering_amount_ml: 1500, runoff_ml: 250 });
    expect(screen.getByText("Volume").parentElement).toHaveTextContent("1.5 L");
    expect(screen.getByText("Runoff").parentElement).toHaveTextContent("0.25 L");
  });

  it("shows an em dash when the volume is missing and 0 L for a zero volume", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "L");
    const { unmount } = renderHistory({ event_type: "watering" });
    expect(screen.getByText("Volume").parentElement).toHaveTextContent("—");
    unmount();
    renderHistory({ watering_amount_ml: 0 });
    expect(screen.getByText("Volume").parentElement).toHaveTextContent("0 L");
  });
});

describe("mounted Recent Quick Logs badge in gallons", () => {
  it("shows Watering · 0.4 gal", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "gal");
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
    expect(screen.getByTestId("quicklog-history-row")).toHaveTextContent("Watering · 0.4 gal");
  });
});

describe("legacy flat runoff_ml", () => {
  it("formats like the enveloped runoff and does not leave a raw chip", () => {
    const { detailLines, extra } = presentTimelineDiaryEntryDetails(
      { event_type: "watering", runoff_ml: 250 },
      "celsius",
      { waterUnit: "L" },
    );
    expect(detailLines).toContainEqual({
      key: "watering.runoff_ml",
      label: "Runoff",
      value: "0.25 L",
    });
    expect(extra.map(([key]) => key)).not.toContain("runoff_ml");
  });
});

describe("useWaterVolumeEntryUnit storage listener", () => {
  it("follows the storage event and removes both listeners on cleanup", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { result, unmount } = renderHook(() => useWaterVolumeEntryUnit());
    act(() => {
      saveWaterVolumeEntryUnit("gal");
    });
    expect(result.current).toBe("gal");
    act(() => {
      setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "L");
      window.dispatchEvent(
        new StorageEvent("storage", { key: WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY }),
      );
    });
    expect(result.current).toBe("L");
    unmount();
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(remove).toHaveBeenCalledWith(WATER_VOLUME_ENTRY_UNIT_CHANGE_EVENT, expect.any(Function));
    remove.mockRestore();
  });
});
