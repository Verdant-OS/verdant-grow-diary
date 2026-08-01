import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GROW_SETUP_START_ROOM_HREF } from "@/constants/growSetupMessages";
import CreatePlantDialog from "@/components/CreatePlantDialog";

const insertMock = vi.fn();
const singleMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => {
        insertMock(...args);
        return {
          select: () => ({
            single: singleMock,
          }),
        };
      },
    }),
  },
}));

const ids = vi.hoisted(() => ({
  USER_ID: "11111111-1111-4111-8111-111111111111",
  GROW_ACTIVE: "22222222-2222-4222-8222-222222222222",
  GROW_OTHER: "33333333-3333-4333-8333-333333333333",
  TENT_OK: "44444444-4444-4444-8444-444444444444",
  TENT_ORPHAN: "55555555-5555-4555-8555-555555555555",
}));

const { USER_ID, GROW_ACTIVE, GROW_OTHER, TENT_OK, TENT_ORPHAN } = ids;

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: ids.USER_ID } }),
}));

const growsState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  activeGrowId: null as string | null,
  loading: false,
}));

const tentsState = vi.hoisted(() => ({
  data: [] as Array<{ id: string; name: string; grow_id: string | null }>,
  isLoading: false,
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => growsState,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => tentsState,
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { multiTent: true } },
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({
  trackFunnelEvent: vi.fn(),
}));

vi.mock("@/components/CreateTentDialog", () => ({
  default: () => null,
}));

function renderDialog(
  props: {
    defaultTentId?: string;
    defaultGrowId?: string;
    requireTent?: boolean;
    initiallyOpen?: boolean;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreatePlantDialog initiallyOpen {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CreatePlantDialog fail-closed binding (RTL)", () => {
  beforeEach(() => {
    insertMock.mockReset();
    singleMock.mockReset();
    growsState.grows = [];
    growsState.activeGrowId = null;
    growsState.loading = false;
    tentsState.data = [];
    tentsState.isLoading = false;
  });

  it("zero grows → blockSubmit, CTA uses one_tent_activation intent", () => {
    renderDialog();

    expect(screen.getByTestId("create-plant-hard-stop")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-start-room-cta")).toHaveAttribute(
      "href",
      GROW_SETUP_START_ROOM_HREF,
    );
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("grows exist + no target → pick-setup hint blocks submit", () => {
    growsState.grows = [
      { id: GROW_ACTIVE, name: "Spring" },
      { id: GROW_OTHER, name: "Fall" },
    ];
    growsState.activeGrowId = null;

    renderDialog();

    expect(screen.getByTestId("create-plant-pick-setup")).toBeInTheDocument();
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("plant + compatible tent → grow_id and tent_id consistent", async () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;
    tentsState.data = [{ id: TENT_OK, name: "Tent A", grow_id: GROW_ACTIVE }];
    singleMock.mockResolvedValue({
      data: { id: "77777777-7777-4777-8777-777777777777", name: "Plant A" },
      error: null,
    });

    renderDialog({ defaultTentId: TENT_OK });

    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Plant A" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(GROW_ACTIVE);
    expect(payload.tent_id).toBe(TENT_OK);
  });

  it("plant + orphan defaultTentId → no insert", () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;
    tentsState.data = [{ id: TENT_ORPHAN, name: "Orphan Tent", grow_id: null }];

    renderDialog({ defaultTentId: TENT_ORPHAN });

    expect(screen.getByTestId("create-plant-tent-mismatch")).toBeInTheDocument();
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("plant-create-submit"));
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("requireTent path blocks submit when no tent is selected", () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;
    tentsState.data = [];

    renderDialog({ requireTent: true });

    expect(screen.queryByTestId("create-plant-hard-stop")).not.toBeInTheDocument();
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
  });

  it("cancel resets form when dialog reopens", async () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;

    renderDialog();

    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Stale plant" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: /New plant/i }));

    await waitFor(() => {
      expect((screen.getByPlaceholderText("Plant A") as HTMLInputElement).value).toBe("");
    });
  });
});
