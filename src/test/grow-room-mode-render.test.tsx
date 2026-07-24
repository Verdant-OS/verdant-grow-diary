/**
 * Grow-Room Mode lightweight page-render smoke test.
 * Confirms the page mounts without throwing when data hooks return empty.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const EMPTY_ALERTS: never[] = [];
const TENT_ID = "tent-1";
const PLANT_ID = "plant-1";
let tentRows: Array<{
  id: string;
  name: string;
  grow_id: string;
  stage: string;
}> = [];
let plantRows: Array<{
  id: string;
  name: string;
  grow_id: string;
  tent_id: string;
  is_archived: boolean;
  created_at: string;
}> = [];

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: tentRows, isLoading: false, error: null }),
}));

vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ alerts: EMPTY_ALERTS, isLoading: false, error: null }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: plantRows, isLoading: false, error: null }),
}));

vi.mock("@/components/DailyGrowCheckStatusCard", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="grow-room-legacy-quick-log">Legacy Quick Log</div> : null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        const query = {
          in: () => query,
          order: () => query,
          limit: () => Promise.resolve({ data: [], error: null }),
        };
        return query;
      },
    }),
  },
}));

import GrowRoomMode from "@/pages/GrowRoomMode";
import { QUICK_LOG_V2_OPEN_EVENT } from "@/lib/quickLogV2OpenIntent";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

beforeEach(() => {
  tentRows = [];
  plantRows = [];
});

describe("GrowRoomMode page render smoke", () => {
  it("mounts without throwing and shows the header", () => {
    render(
      <MemoryRouter>
        <GrowRoomMode />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/grow.?room/i).length).toBeGreaterThan(0);
  });

  it("dispatches one exact typed Water intent without opening legacy Quick Log", async () => {
    tentRows = [
      { id: TENT_ID, name: "Tent One", grow_id: "grow-1", stage: "veg" },
    ];
    plantRows = [
      {
        id: PLANT_ID,
        name: "Plant One",
        grow_id: "grow-1",
        tent_id: TENT_ID,
        is_archived: false,
        created_at: "2026-07-20T12:00:00.000Z",
      },
    ];
    const typedListener = vi.fn();
    const legacyListener = vi.fn();
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, typedListener);
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, legacyListener);

    render(
      <MemoryRouter>
        <GrowRoomMode />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId("grow-room-action-watering"));

    window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, typedListener);
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, legacyListener);
    expect(typedListener).toHaveBeenCalledTimes(1);
    const event = typedListener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ targetKey: `plant:${PLANT_ID}`, action: "water" });
    expect(legacyListener).not.toHaveBeenCalled();
    expect(screen.queryByTestId("grow-room-legacy-quick-log")).toBeNull();
  });
});
