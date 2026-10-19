/**
 * #2015 follow-up: ignore an archive read whose plant changed, and refresh
 * the plant list after an inline activity save.
 */
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

type Plant = {
  id: string;
  name: string;
  strain: string | null;
  grow_id: string;
  tent_id: string;
  is_archived: boolean;
};

const plantsRef = vi.hoisted(() => ({ plants: [] as Plant[] }));
const saveInsert = vi.hoisted(() => vi.fn());
const archiveRead = vi.hoisted(() => ({
  release: null as null | ((byId: Record<string, boolean>) => void),
  settled: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const state = { id: "" };
      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          if (column === "id") state.id = value;
          return builder;
        },
        maybeSingle: () =>
          new Promise((resolve) => {
            archiveRead.release = (byId: Record<string, boolean>) => {
              resolve({
                data: { id: state.id, is_archived: byId[state.id] === true },
                error: null,
              });
              queueMicrotask(() => {
                archiveRead.settled = true;
              });
            };
          }),
      };
      return builder;
    },
    rpc: vi.fn(),
  },
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "t1", name: "Tent A", grow_id: "g1" }],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  PLANTS_QUERY_KEY: ["plants"],
  usePlants: () => ({ data: plantsRef.plants, isLoading: false }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: undefined,
  }),
}));
vi.mock("@/components/ManualSensorReadingCard", () => ({ default: () => <div /> }));
vi.mock("@/components/QuickLog", () => {
  function MockQuickLog() {
    const [plantOnButton, setPlantOnButton] = useState("P");
    return (
      <div>
        <button type="button" onClick={() => setPlantOnButton("Q")}>
          Switch dialog plant
        </button>
        <button
          type="button"
          data-testid="quick-log-save"
          data-daily-check-save-plant={plantOnButton}
          onClick={() => saveInsert("diary_entries")}
        >
          Save
        </button>
      </div>
    );
  }
  return { default: MockQuickLog };
});
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: ({
    onSaveSuccess,
  }: {
    onSaveSuccess?: (result: {
      activityId: "note";
      target: { growId: string; tentId: string; plantId: string };
      growEventId: string;
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="mock-inline-activity-success"
      onClick={() =>
        onSaveSuccess?.({
          activityId: "note",
          target: { growId: "g1", tentId: "t1", plantId: "P" },
          growEventId: "event-1",
        })
      }
    >
      Inline saved
    </button>
  ),
}));
vi.mock("@/components/PlantStatusStrip", () => ({ default: () => <div /> }));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({ default: () => <div /> }));

import DailyCheck from "@/pages/DailyCheck";

const plantP: Plant = {
  id: "P",
  name: "Plant P",
  strain: null,
  grow_id: "g1",
  tent_id: "t1",
  is_archived: false,
};
const plantQ: Plant = {
  id: "Q",
  name: "Other",
  strain: null,
  grow_id: "g1",
  tent_id: "t1",
  is_archived: false,
};

function renderCheck() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateQueries = vi.spyOn(qc, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/daily-check"]}>
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, invalidateQueries };
}

async function choosePlant(name: RegExp) {
  const trigger = screen.getByTestId("daily-grow-check-plant-select");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name }));
}

beforeEach(() => {
  plantsRef.plants = [plantP, plantQ];
  saveInsert.mockClear();
  archiveRead.release = null;
  archiveRead.settled = false;
  const proto = window.HTMLElement.prototype;
  proto.scrollIntoView = () => {};
  proto.hasPointerCapture = () => false;
  proto.releasePointerCapture = () => {};
  proto.setPointerCapture = () => {};
});

describe("Daily Check archive read follows the plant being saved", () => {
  it("ignores an archive read when the selection changes while it is in flight", async () => {
    renderCheck();
    await choosePlant(/Plant P/);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() => expect(archiveRead.release).toBeTypeOf("function"));
    await choosePlant(/Other/);
    archiveRead.release?.({ P: true });
    await waitFor(() => expect(archiveRead.settled).toBe(true));
    expect(
      screen.queryByText("This plant was archived. Pick another plant."),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("daily-grow-check-choose")).toHaveAttribute("data-plant-id", "Q");
    expect(saveInsert).not.toHaveBeenCalled();
  });

  it("re-checks the plant named on the save control", async () => {
    renderCheck();
    await choosePlant(/Other/);
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() => expect(archiveRead.release).toBeTypeOf("function"));
    archiveRead.release?.({ P: true, Q: false });
    await waitFor(() => expect(archiveRead.settled).toBe(true));
    expect(saveInsert).not.toHaveBeenCalled();
    expect(
      await screen.findByText("This plant was archived. Pick another plant."),
    ).toBeInTheDocument();
    expect(saveInsert).not.toHaveBeenCalled();
  });

  it("refreshes the plant list after an inline activity save", async () => {
    const { invalidateQueries } = renderCheck();
    fireEvent.click(screen.getByTestId("mock-inline-activity-success"));
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["plants"] }),
      ),
    );
  });
});
