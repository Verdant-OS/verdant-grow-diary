import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  GROW_SETUP_FINISH_SETUP_HREF,
  GROW_SETUP_MESSAGES,
  GROW_SETUP_START_ROOM_HREF,
} from "@/constants/growSetupMessages";

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
  TENT_OTHER: "66666666-6666-4666-8666-666666666666",
}));

const { USER_ID, GROW_ACTIVE, GROW_OTHER, TENT_OK, TENT_ORPHAN, TENT_OTHER } = ids;

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: USER_ID } }),
}));

const growsState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  activeGrowId: null as string | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

const tentsState = vi.hoisted(() => ({
  data: [] as Array<{ id: string; name: string; grow_id: string | null }>,
  isLoading: false,
  isFetching: false,
  isError: false,
  isFetched: true,
  refetch: vi.fn(),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: growsState.grows,
    activeGrowId: growsState.activeGrowId,
    loading: growsState.loading,
    error: growsState.error,
    refresh: growsState.refresh,
  }),
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

import CreatePlantDialog from "@/components/CreatePlantDialog";

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

describe("CreatePlantDialog fail-closed binding", () => {
  beforeEach(() => {
    insertMock.mockReset();
    singleMock.mockReset();
    growsState.grows = [];
    growsState.activeGrowId = null;
    growsState.loading = false;
    growsState.error = null;
    growsState.refresh = vi.fn();
    tentsState.data = [];
    tentsState.isLoading = false;
    tentsState.isFetching = false;
    tentsState.isError = false;
    tentsState.isFetched = true;
    tentsState.refetch = vi.fn();
  });

  it("zero grows withholds form and routes to one-tent activation", () => {
    renderDialog();

    expect(screen.getByTestId("create-plant-hard-stop")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-start-room-cta")).toHaveAttribute(
      "href",
      GROW_SETUP_START_ROOM_HREF,
    );
    expect(GROW_SETUP_START_ROOM_HREF).toContain("one_tent_activation");
    expect(screen.queryByTestId("create-plant-form")).toBeNull();
    expect(screen.queryByTestId("plant-create-submit")).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("writes consistent grow_id and tent_id for compatible tent", async () => {
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
    expect(payload.name).toBe("Plant A");
  });

  it("orphan supplied tent blocks write — no tentless insert", async () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;
    tentsState.data = [{ id: TENT_ORPHAN, name: "Orphan Tent", grow_id: null }];

    renderDialog({ defaultTentId: TENT_ORPHAN });

    expect(screen.getByTestId("create-plant-tent-mismatch")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-finish-setup-cta")).toHaveAttribute(
      "href",
      GROW_SETUP_FINISH_SETUP_HREF,
    );
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Plant A" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("mismatched supplied tent blocks write with Finish setup CTA", () => {
    growsState.grows = [
      { id: GROW_ACTIVE, name: "Spring Veg" },
      { id: GROW_OTHER, name: "Other" },
    ];
    growsState.activeGrowId = GROW_ACTIVE;
    tentsState.data = [
      { id: TENT_OK, name: "Tent A", grow_id: GROW_ACTIVE },
      { id: TENT_OTHER, name: "Other Tent", grow_id: GROW_OTHER },
    ];

    renderDialog({ defaultTentId: TENT_OTHER });

    expect(screen.getByTestId("create-plant-tent-mismatch")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-finish-setup-cta")).toHaveAttribute(
      "href",
      GROW_SETUP_FINISH_SETUP_HREF,
    );
    expect(screen.queryByText("Other Tent")).not.toBeInTheDocument();
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("requireTent keeps submit disabled until a tent is chosen", () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;
    tentsState.data = [{ id: TENT_OK, name: "Tent A", grow_id: GROW_ACTIVE }];

    renderDialog({ requireTent: true });

    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    expect(screen.queryByText("No tent")).not.toBeInTheDocument();
  });

  it("resets form when closed and reopened", () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreatePlantDialog />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /New plant/i }));
    const nameInput = screen.getByPlaceholderText("Plant A") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Stale plant" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: /New plant/i }));
    expect((screen.getByPlaceholderText("Plant A") as HTMLInputElement).value).toBe("");
  });

  it("read_error is not no_setup — Retry only", () => {
    growsState.error = "rls failed";
    renderDialog();
    expect(screen.getByTestId("create-plant-read-error")).toBeInTheDocument();
    expect(screen.queryByTestId("create-plant-hard-stop")).toBeNull();
    expect(screen.queryByTestId("create-plant-form")).toBeNull();
    expect(GROW_SETUP_MESSAGES.readErrorRetry.length).toBeGreaterThan(0);
  });
});
