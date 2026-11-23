import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WateringHistoryPanel from "@/components/WateringHistoryPanel";
import { WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY } from "@/lib/waterVolumeEntryUnitPreference";
import {
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

afterEach(() => {
  removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
});

describe("Watering history feeding envelope", () => {
  it("keeps a typeless feeding envelope in ml while the water unit is L", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "L");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <WateringHistoryPanel
          rawEntries={[
            {
              id: "f1",
              grow_id: "g1",
              plant_id: "p1",
              tent_id: "t1",
              entry_at: "2026-11-19T12:00:00.000Z",
              note: "Fed",
              details: { feeding: { ec_in: 1.2 }, watering_amount_ml: 750, runoff_ml: 250 },
            },
          ]}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Volume").parentElement).toHaveTextContent("750 ml");
    expect(screen.getByText("Runoff").parentElement).toHaveTextContent("250 ml");
  });
});
