/**
 * Behavioral RTL: CreatePlantDialog fail-closed grow/tent binding.
 * Zero Supabase inserts when blocked; correct grow_id when allowed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isValidElement, type ReactNode } from "react";

const insertMock = vi.hoisted(() => vi.fn());
const singleMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn(() => ({ single: singleMock })));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "plants") {
        return {
          insert: (payload: unknown) => {
            insertMock(payload);
            return { select: selectMock };
          },
        };
      }
      return {
        insert: vi.fn(() => ({
          select: () => ({ single: async () => ({ data: null, error: null }) }),
        })),
      };
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" }, loading: false }),
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
  isFetching: false,
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

vi.mock("@/lib/entitlements/freeTierGates", () => ({
  evaluateTentCreationGate: () => ({ allowed: true, blockedCopy: "" }),
  FREE_TIER_UPGRADE_PATH: "/pricing",
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/components/CreateTentDialog", () => ({
  default: ({
    onCreated,
    trigger,
  }: {
    onCreated?: (t: { id: string; name: string; grow_id: string }) => void;
    trigger?: ReactNode;
  }) => {
    const triggerTestId = isValidElement<{ "data-testid"?: string }>(trigger)
      ? trigger.props["data-testid"]
      : null;
    if (triggerTestId === "create-plant-nested-tent-trigger-placeholder") return null;

    return (
      <button
        type="button"
        data-testid="mock-create-tent"
        onClick={() =>
          onCreated?.({
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            name: "Tent B",
            grow_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          })
        }
      >
        Add new tent
      </button>
    );
  },
}));

import CreatePlantDialog from "@/components/CreatePlantDialog";

const elementPrototype = Element.prototype as Element & {
  hasPointerCapture?: () => boolean;
  setPointerCapture?: () => void;
  releasePointerCapture?: () => void;
  scrollIntoView?: () => void;
};
elementPrototype.hasPointerCapture ??= () => false;
elementPrototype.setPointerCapture ??= () => {};
elementPrototype.releasePointerCapture ??= () => {};
elementPrototype.scrollIntoView ??= () => {};

const G1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const T_ORPHAN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const T_GONE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

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

beforeEach(() => {
  insertMock.mockReset();
  singleMock.mockReset();
  singleMock.mockResolvedValue({ data: { id: "plant-1", name: "P" }, error: null });
  selectMock.mockClear();
  growsState.grows = [{ id: G1, name: "Spring" }];
  growsState.activeGrowId = G1;
  growsState.loading = false;
  growsState.error = null;
  growsState.refresh = vi.fn();
  tentsState.data = [
    { id: T1, name: "Tent A", grow_id: G1 },
    { id: T2, name: "Tent B", grow_id: G1 },
    { id: T_ORPHAN, name: "Orphan", grow_id: null },
  ];
  tentsState.isLoading = false;
  tentsState.isFetching = false;
  tentsState.isError = false;
  tentsState.isFetched = true;
  tentsState.refetch = vi.fn();
});

describe("CreatePlantDialog RTL binding", () => {
  it("withholds form on zero-grow hard-stop (Start your room)", () => {
    growsState.grows = [];
    growsState.activeGrowId = null;
    renderDialog({});
    expect(screen.getByTestId("create-plant-hard-stop")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-start-room-cta")).toHaveAttribute(
      "href",
      "/grows?intent=one_tent_activation",
    );
    expect(screen.queryByTestId("create-plant-form")).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("shows Retry on grow read error — not Start your room", () => {
    growsState.grows = [];
    growsState.error = "rls failed";
    renderDialog({});
    expect(screen.getByTestId("create-plant-read-error")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-retry")).toBeInTheDocument();
    expect(screen.queryByTestId("create-plant-hard-stop")).toBeNull();
    expect(screen.queryByTestId("create-plant-form")).toBeNull();
  });

  it("debounces grow Retry — multi-click fires refresh once", async () => {
    growsState.grows = [];
    growsState.error = "rls failed";
    const slow = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 80)));
    growsState.refresh = slow;
    renderDialog({});
    const btn = screen.getByTestId("create-plant-retry");
    await userEvent.click(btn);
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it("blocks invalid explicit setup without falling back to active", () => {
    growsState.activeGrowId = G1;
    renderDialog({ defaultGrowId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    expect(screen.getByTestId("create-plant-requested-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("create-plant-form")).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("keeps supplied tent pending while tents load — submit blocked, zero inserts", async () => {
    tentsState.isLoading = true;
    tentsState.isFetched = false;
    tentsState.data = [];
    renderDialog({ defaultGrowId: G1, defaultTentId: T1 });
    expect(screen.getByTestId("create-plant-tent-pending")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-create-tent")).toBeNull();
    const submit = screen.getByTestId("plant-create-submit");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByTestId("create-plant-name"), "Plant X");
    await userEvent.click(submit);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("keeps supplied tent pending during background refetch — cached row is not trusted", async () => {
    tentsState.isLoading = false;
    tentsState.isFetching = true;
    tentsState.isFetched = true;
    tentsState.data = [{ id: T1, name: "Tent A", grow_id: G1 }];
    renderDialog({ defaultGrowId: G1, defaultTentId: T1 });
    expect(screen.getByTestId("create-plant-tent-pending")).toBeInTheDocument();
    const submit = screen.getByTestId("plant-create-submit");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByTestId("create-plant-name"), "Stale Cache");
    await userEvent.click(submit);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("tent read error blocks submit — Retry only, zero inserts", async () => {
    tentsState.isError = true;
    tentsState.data = [{ id: T1, name: "Tent A", grow_id: G1 }];
    renderDialog({ defaultGrowId: G1, defaultTentId: T_GONE });
    expect(screen.getByTestId("create-plant-tent-unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-tent-retry")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-create-tent")).toBeNull();
    const submit = screen.getByTestId("plant-create-submit");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByTestId("create-plant-name"), "Blocked");
    // Read-error exposes no nested write path — Retry only.
    await userEvent.click(submit);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("unavailable supplied tent can recover via verified compatible replacement", async () => {
    renderDialog({ defaultGrowId: G1, defaultTentId: T_GONE });
    expect(screen.getByTestId("create-plant-tent-unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    expect(screen.queryByText("No tent")).toBeNull();
    expect(screen.getByTestId("mock-create-tent")).toBeInTheDocument();

    // CreateTentDialog onCreated is the supported recovery path in jsdom
    // (Radix Select pointer-capture is unavailable here).
    await userEvent.click(screen.getByTestId("mock-create-tent"));

    await waitFor(() => {
      expect(screen.queryByTestId("create-plant-tent-unavailable")).toBeNull();
    });
    expect(screen.getByTestId("plant-create-submit")).not.toBeDisabled();
    await userEvent.type(screen.getByTestId("create-plant-name"), "Recovered");
    await userEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(G1);
    expect(payload.tent_id).toBe(T2);
  });

  it("orphan supplied tent cannot tentless-insert", async () => {
    renderDialog({ defaultGrowId: G1, defaultTentId: T_ORPHAN });
    expect(screen.getByTestId("create-plant-tent-mismatch")).toBeInTheDocument();
    const submit = screen.getByTestId("plant-create-submit");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByTestId("create-plant-name"), "Plant Y");
    await userEvent.click(submit);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("happy path writes grow_id and tent_id", async () => {
    renderDialog({ defaultGrowId: G1, defaultTentId: T1 });
    await waitFor(() => {
      expect(screen.getByTestId("create-plant-form")).toBeInTheDocument();
    });
    await userEvent.type(screen.getByTestId("create-plant-name"), "Happy Plant");
    await userEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(G1);
    expect(payload.tent_id).toBe(T1);
    expect(payload.name).toBe("Happy Plant");
  });
});
