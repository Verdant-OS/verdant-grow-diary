/**
 * The Quick Log note must stay mounted when the writer's own archive
 * check blocks. Refreshing the active plant list rekeys the dialog.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => harness.rpc(...args),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        limit: async () => ({
          data: table === "plants" ? [{ is_archived: true }] : [],
          error: null,
        }),
        maybeSingle: async () => ({ data: { is_archived: true }, error: null }),
        insert: vi.fn(),
        update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
      return builder;
    },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "Grow One", stage: "veg" }],
    activeGrow: { id: "g1", name: "Grow One", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "p1", name: "Plant One", grow_id: "g1", tent_id: "t1", stage: "veg" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent One", grow_id: "g1" }] }),
}));
vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: { status: "empty", source: null, captured_at: null, metrics: {} },
  }),
}));
vi.mock("@/hooks/usePhenoEvidenceCaptureContext", () => ({
  usePhenoEvidenceCaptureContext: () => ({ status: "disabled", context: null }),
}));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), warning: vi.fn() },
}));

import QuickLog from "@/components/QuickLog";

describe("inner archive check keeps the Quick Log draft", () => {
  beforeEach(() => {
    harness.rpc.mockReset();
  });

  it("does not refresh the plant list when the saved plant is archived", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    render(
      <QueryClientProvider client={client}>
        <QuickLog
          open
          onOpenChange={() => {}}
          prefill={{ plantId: "p1", growId: "g1", tentId: "t1" }}
        />
      </QueryClientProvider>,
    );
    const save = screen.getByTestId("quick-log-save");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "keep this note" } });
    invalidateQueries.mockClear();

    fireEvent.click(save);

    expect(
      await screen.findByText("This plant was archived. Pick another plant."),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("keep this note");
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
