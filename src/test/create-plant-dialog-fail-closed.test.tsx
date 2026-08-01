import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  growsState: {
    grows: [] as Array<{ id: string; name: string }>,
    activeGrowId: null as string | null,
    loading: false,
  },
  tents: [] as Array<{ id: string; name: string; grow_id: string | null }>,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => mocks.growsState,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: mocks.tents }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({
  trackFunnelEvent: vi.fn(),
}));

vi.mock("@/components/CreateTentDialog", () => ({
  default: () => <button type="button">Add new tent</button>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (payload: unknown) => {
        mocks.insert(payload);
        return {
          select: () => ({
            single: async () => ({
              data: { id: "plant-new", name: "Plant A" },
              error: null,
            }),
          }),
        };
      },
    }),
  },
}));

import CreatePlantDialog from "@/components/CreatePlantDialog";

function renderDialog(
  props: {
    defaultGrowId?: string;
    defaultTentId?: string;
    initiallyOpen?: boolean;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CreatePlantDialog initiallyOpen={props.initiallyOpen ?? true} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.insert.mockClear();
  mocks.growsState.grows = [];
  mocks.growsState.activeGrowId = null;
  mocks.growsState.loading = false;
  mocks.tents = [];
});

describe("CreatePlantDialog fail-closed", () => {
  it("zero-grow renders hard stop and blocks submit", async () => {
    renderDialog();
    expect(screen.getByTestId("create-plant-hard-stop")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-start-room-cta")).toHaveAttribute(
      "href",
      "/grows?intent=one_tent_activation",
    );
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "My Plant" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => {
      expect(mocks.insert).not.toHaveBeenCalled();
    });
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
  });

  it("with an active grow, submit includes grow_id", async () => {
    const growId = "aaaaaaaa-bbbb-cccc-dddd-111111111111";
    const tentId = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
    mocks.growsState.grows = [{ id: growId, name: "Room A" }];
    mocks.growsState.activeGrowId = growId;
    mocks.tents = [{ id: tentId, name: "Tent A", grow_id: growId }];
    renderDialog({ defaultTentId: tentId });
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "My Plant" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => {
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          grow_id: growId,
          name: "My Plant",
          tent_id: tentId,
        }),
      );
    });
  });

  it("orphan/mismatched tent guard blocks submit and shows finish-setup CTA", async () => {
    const growA = "aaaaaaaa-bbbb-cccc-dddd-111111111111";
    const growB = "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee";
    const tentOrphan = "bbbbbbbb-bbbb-cccc-dddd-111111111111";
    mocks.growsState.grows = [
      { id: growA, name: "Room A" },
      { id: growB, name: "Room B" },
    ];
    mocks.growsState.activeGrowId = growA;
    mocks.tents = [
      { id: tentOrphan, name: "Orphan Tent", grow_id: null },
      { id: "dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee", name: "Other Tent", grow_id: growB },
    ];
    renderDialog({ defaultTentId: tentOrphan, defaultGrowId: undefined });
    expect(screen.getByTestId("create-plant-tent-mismatch")).toBeInTheDocument();
    const finishSetup = screen.getByTestId("create-plant-finish-setup-cta");
    expect(finishSetup).toHaveAttribute("href", "/grow-lineage");
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "My Plant" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => {
      expect(mocks.insert).not.toHaveBeenCalled();
    });
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
  });

  it("cancel then reopen starts clean", async () => {
    mocks.growsState.grows = [{ id: "aaaaaaaa-bbbb-cccc-dddd-111111111111", name: "Room A" }];
    mocks.growsState.activeGrowId = "aaaaaaaa-bbbb-cccc-dddd-111111111111";
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Stale name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: /New plant/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Plant A")).toHaveValue("");
    });
  });
});
