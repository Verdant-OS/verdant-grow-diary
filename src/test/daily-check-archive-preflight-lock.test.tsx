/**
 * A slow archive preflight must not let a second click on a guarded save
 * replay too. That replay would run the same save twice.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const saveInsert = vi.hoisted(() => vi.fn());
const archiveReads = vi.hoisted(() => ({
  pending: [] as Array<(value: { data: { is_archived: boolean }; error: null }) => void>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "plants") {
        return {
          insert: (...args: unknown[]) => {
            saveInsert(...args);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () =>
          new Promise<{ data: { is_archived: boolean }; error: null }>((resolve) => {
            archiveReads.pending.push(resolve);
          }),
      };
      return builder;
    },
    rpc: (...args: unknown[]) => {
      saveInsert(...args);
      return Promise.resolve({ data: null, error: null });
    },
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
  usePlants: () => ({
    data: [
      {
        id: "P",
        name: "Plant P",
        strain: null,
        grow_id: "g1",
        tent_id: "t1",
        is_archived: false,
      },
    ],
    isLoading: false,
  }),
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
vi.mock("@/components/QuickLog", () => ({
  default: () => (
    <button
      type="button"
      data-testid="quick-log-save"
      data-daily-check-save-plant="P"
      onClick={() => saveInsert("quicklog_save_manual")}
    >
      Save
    </button>
  ),
}));
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: () => <div data-testid="daily-check-all-activities" />,
}));
vi.mock("@/components/PlantStatusStrip", () => ({ default: () => <div /> }));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => <div /> }));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({ default: () => <div /> }));

import DailyCheck from "@/pages/DailyCheck";

function renderCheck() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/daily-check"]}>
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function reachQuickLogSave() {
  const trigger = screen.getByTestId("daily-grow-check-plant-select");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name: /Plant P/ }));
  fireEvent.click(screen.getByTestId("daily-grow-check-start"));
  fireEvent.click(screen.getByTestId("daily-grow-check-next"));
  fireEvent.click(screen.getByTestId("daily-grow-check-skip-manual"));
  fireEvent.click(screen.getByTestId("daily-grow-check-open-quicklog"));
}

describe("Daily Check archive preflight", () => {
  beforeEach(() => {
    saveInsert.mockClear();
    archiveReads.pending = [];
    const proto = window.HTMLElement.prototype;
    proto.scrollIntoView = () => {};
    proto.hasPointerCapture = () => false;
    proto.releasePointerCapture = () => {};
    proto.setPointerCapture = () => {};
  });

  it("runs one preflight and one save when a guarded save is clicked twice", async () => {
    renderCheck();
    await reachQuickLogSave();
    const save = await screen.findByTestId("quick-log-save");

    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(archiveReads.pending).toHaveLength(1));
    expect(saveInsert).not.toHaveBeenCalled();
    archiveReads.pending[0]?.({ data: { is_archived: false }, error: null });

    await waitFor(() => expect(saveInsert).toHaveBeenCalledTimes(1));
    expect(saveInsert).toHaveBeenCalledWith("quicklog_save_manual");
    expect(archiveReads.pending).toHaveLength(1);
  });
});
