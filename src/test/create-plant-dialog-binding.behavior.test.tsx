/**
 * Behavioral RTL coverage for CreatePlantDialog fail-closed binding contract.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CreatePlantDialog from "@/components/CreatePlantDialog";

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({
  insert: (payload: unknown) => {
    insertMock(payload);
    return {
      select: () => ({
        single: async () => ({ data: { id: "p1", name: "New" }, error: null }),
      }),
    };
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-1111-1111-111111111111" }, loading: false }),
}));

const growsState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  activeGrowId: null as string | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: growsState.grows,
    activeGrowId: growsState.activeGrowId,
    loading: growsState.loading,
    error: growsState.error,
    refresh: growsState.refresh,
    setActiveGrowId: vi.fn(),
    activeGrow: null,
  }),
}));

const tentsState = vi.hoisted(() => ({
  data: [] as Array<{ id: string; name: string; grow_id: string | null }>,
  isLoading: false,
  isError: false,
  isFetched: true,
  refetch: vi.fn(),
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

function renderDialog(props: {
  defaultGrowId?: string;
  defaultTentId?: string;
  requireTent?: boolean;
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CreatePlantDialog initiallyOpen {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CreatePlantDialog binding behavior", () => {
  beforeEach(() => {
    insertMock.mockClear();
    fromMock.mockClear();
    growsState.grows = [];
    growsState.activeGrowId = null;
    growsState.loading = false;
    growsState.error = null;
    tentsState.data = [];
    tentsState.isLoading = false;
    tentsState.isError = false;
    tentsState.isFetched = true;
  });

  it("shows Retry on grow read error — not Start your room", () => {
    growsState.error = "rls failed";
    growsState.grows = [];
    renderDialog({});
    expect(screen.getByTestId("create-plant-read-error")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-read-error-retry")).toBeInTheDocument();
    expect(screen.queryByTestId("create-plant-hard-stop")).toBeNull();
    expect(screen.queryByTestId("create-plant-form")).toBeNull();
  });

  it("shows hard-stop only for genuine zero-grow", () => {
    growsState.grows = [];
    growsState.error = null;
    renderDialog({});
    expect(screen.getByTestId("create-plant-hard-stop")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-start-room-cta")).toHaveAttribute(
      "href",
      "/grows?intent=one_tent_activation",
    );
  });

  it("invalid explicit setup does not fall back to active grow", () => {
    growsState.grows = [{ id: "g-active", name: "Active" }];
    growsState.activeGrowId = "g-active";
    renderDialog({ defaultGrowId: "ghost-setup" });
    expect(screen.getByTestId("create-plant-requested-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("create-plant-form")).toBeNull();
  });

  it("supplied tent loading keeps pending and blocks form submit path", () => {
    growsState.grows = [{ id: "g1", name: "Spring" }];
    growsState.activeGrowId = "g1";
    tentsState.isLoading = true;
    tentsState.isFetched = false;
    tentsState.data = [];
    renderDialog({ defaultGrowId: "g1", defaultTentId: "t-supplied" });
    // Form may show once grow ready, but tent pending banner + submit disabled
    expect(screen.getByTestId("create-plant-tent-pending")).toBeInTheDocument();
    const submit = screen.getByTestId("plant-create-submit");
    expect(submit).toBeDisabled();
  });

  it("supplied tent conflict blocks insert (zero insert calls)", async () => {
    growsState.grows = [{ id: "g1", name: "Spring" }];
    growsState.activeGrowId = "g1";
    tentsState.data = [{ id: "t1", name: "Other", grow_id: "g2" }];
    tentsState.isFetched = true;
    tentsState.isLoading = false;
    renderDialog({ defaultGrowId: "g1", defaultTentId: "t1" });
    expect(screen.getByTestId("create-plant-tent-mismatch")).toBeInTheDocument();
    const submit = screen.getByTestId("plant-create-submit");
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Plant A"), { target: { value: "P1" } });
    fireEvent.click(submit);
    await waitFor(() => {
      expect(insertMock).not.toHaveBeenCalled();
    });
  });

  it("happy path writes exact grow_id and tent_id", async () => {
    const G1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const T1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const U1 = "11111111-1111-1111-1111-111111111111";
    growsState.grows = [{ id: G1, name: "Spring" }];
    growsState.activeGrowId = G1;
    tentsState.data = [{ id: T1, name: "Tent A", grow_id: G1 }];
    tentsState.isFetched = true;
    renderDialog({ defaultGrowId: G1, defaultTentId: T1 });
    fireEvent.change(screen.getByPlaceholderText("Plant A"), { target: { value: "Pheno 1" } });
    const submit = screen.getByTestId("plant-create-submit");
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledTimes(1);
    });
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(G1);
    expect(payload.tent_id).toBe(T1);
    expect(payload.name).toBe("Pheno 1");
    expect(payload.user_id).toBe(U1);
  });
});
