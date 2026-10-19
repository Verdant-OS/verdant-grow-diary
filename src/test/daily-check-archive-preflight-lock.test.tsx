/**
 * A slow archive preflight must not let a second click on the manual
 * snapshot button replay after review is open. That replay would call the
 * card's save branch without the grower pressing confirm.
 */
import { useState } from "react";
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
vi.mock("@/components/ManualSensorReadingCard", () => {
  function MockManualSensorReadingCard() {
    const [reviewOpen, setReviewOpen] = useState(false);
    return (
      <div>
        <button
          type="button"
          data-testid="manual-reading-save"
          onClick={() => {
            if (!reviewOpen) {
              setReviewOpen(true);
              return;
            }
            saveInsert("doSave");
          }}
        >
          Save reading
        </button>
        {reviewOpen ? <div data-testid="manual-review-open" /> : null}
      </div>
    );
  }
  return { default: MockManualSensorReadingCard };
});
vi.mock("@/components/QuickLog", () => ({ default: () => <div data-testid="mock-quicklog" /> }));
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

async function reachManualSave() {
  const trigger = screen.getByTestId("daily-grow-check-plant-select");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name: /Plant P/ }));
  fireEvent.click(screen.getByTestId("daily-grow-check-start"));
  fireEvent.click(screen.getByTestId("daily-grow-check-next"));
  expect(screen.getByText(/Step 3 · Add Manual Sensor Snapshot/i)).toBeInTheDocument();
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

  it("runs one preflight when the manual snapshot button is clicked twice", async () => {
    renderCheck();
    await reachManualSave();
    const save = screen.getByTestId("manual-reading-save");

    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(archiveReads.pending).toHaveLength(1));
    archiveReads.pending[0]?.({ data: { is_archived: false }, error: null });

    expect(await screen.findByTestId("manual-review-open")).toBeInTheDocument();
    expect(saveInsert).not.toHaveBeenCalled();
    expect(archiveReads.pending).toHaveLength(1);
  });
});
