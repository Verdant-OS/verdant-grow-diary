/**
 * Behavioral RTL: CreatePlantDialog fail-closed grow/tent binding.
 * Zero Supabase inserts when blocked; correct grow_id when allowed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { unstable_batchedUpdates } from "react-dom";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { isValidElement, type ReactNode } from "react";

const insertMock = vi.hoisted(() => vi.fn());
const singleMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn(() => ({ single: singleMock })));
const plantLookupMaybeSingleMock = vi.hoisted(() => vi.fn());
const plantLookupEqMock = vi.hoisted(() =>
  vi.fn(() => ({ maybeSingle: plantLookupMaybeSingleMock })),
);
const plantLookupSelectMock = vi.hoisted(() => vi.fn(() => ({ eq: plantLookupEqMock })));
const successToastMock = vi.hoisted(() => vi.fn());
const funnelEventMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111" as string | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "plants") {
        return {
          insert: (payload: unknown) => {
            insertMock(payload);
            return { select: selectMock };
          },
          select: plantLookupSelectMock,
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
  useAuth: () => ({
    user: authState.userId ? { id: authState.userId } : null,
    loading: false,
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: funnelEventMock }));

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

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: successToastMock } }));

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
import { clearGrowDataMeta, getGrowDataMeta } from "@/hooks/useGrowData";

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
const G2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const T1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const T_ORPHAN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const T_GONE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const CREATED_ROW = {
  candidate_label: null,
  candidate_number: null,
  created_at: "2026-08-21T17:45:00.000Z",
  grow_id: G1,
  health: "healthy",
  id: "99999999-9999-4999-8999-999999999999",
  is_archived: false,
  last_note: null,
  medium: null,
  name: "Visible Plant",
  pheno_hunt_id: null,
  photo_url: null,
  plant_type: "unknown",
  pot_size: null,
  schema_version: 1,
  stage: "seedling",
  started_at: "2026-08-21T17:45:00.000Z",
  strain: null,
  tent_id: T1,
  updated_at: "2026-08-21T17:45:00.000Z",
  user_id: USER_ID,
} as const;

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
  authState.userId = USER_ID;
  insertMock.mockReset();
  successToastMock.mockReset();
  funnelEventMock.mockReset();
  singleMock.mockReset();
  singleMock.mockResolvedValue({ data: CREATED_ROW, error: null });
  selectMock.mockClear();
  plantLookupMaybeSingleMock.mockReset();
  plantLookupMaybeSingleMock.mockResolvedValue({ data: null, error: null });
  plantLookupEqMock.mockClear();
  plantLookupSelectMock.mockClear();
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(CREATED_ROW.id);
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
    expect(payload.id).toBe(CREATED_ROW.id);
    expect(selectMock).toHaveBeenCalledWith("*");
  });

  it("reconciles an exact preallocated plant after a duplicate response", async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    plantLookupMaybeSingleMock.mockResolvedValueOnce({ data: CREATED_ROW, error: null });
    const onCreated = vi.fn();

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <CreatePlantDialog
            initiallyOpen
            defaultGrowId={G1}
            defaultTentId={T1}
            onCreated={onCreated}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByTestId("create-plant-name"), CREATED_ROW.name);
    await userEvent.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED_ROW));
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({ id: CREATED_ROW.id });
    expect(plantLookupSelectMock).toHaveBeenCalledWith("*");
    expect(plantLookupEqMock).toHaveBeenCalledWith("id", CREATED_ROW.id);
    expect(successToastMock).toHaveBeenCalledWith("Plant created");
  });

  it("blocks a blind retry when a duplicate response cannot be reconciled", async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    plantLookupMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const onCreated = vi.fn();

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <CreatePlantDialog
            initiallyOpen
            defaultGrowId={G1}
            defaultTentId={T1}
            onCreated={onCreated}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByTestId("create-plant-name"), "Possibly Saved Plant");
    await userEvent.click(screen.getByTestId("plant-create-submit"));

    expect(await screen.findByTestId("plant-create-outcome-unknown")).toHaveTextContent(
      "Refresh this page before creating another plant",
    );
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    await userEvent.click(screen.getByTestId("plant-create-submit"));
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
    expect(successToastMock).not.toHaveBeenCalled();
  });

  it("reconciles a committed plant after a returned transport failure", async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: "", message: "TypeError: Failed to fetch" },
    });
    plantLookupMaybeSingleMock.mockResolvedValueOnce({ data: CREATED_ROW, error: null });
    const onCreated = vi.fn();

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <CreatePlantDialog
            initiallyOpen
            defaultGrowId={G1}
            defaultTentId={T1}
            onCreated={onCreated}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByTestId("create-plant-name"), CREATED_ROW.name);
    await userEvent.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED_ROW));
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(plantLookupEqMock).toHaveBeenCalledWith("id", CREATED_ROW.id);
    expect(screen.queryByTestId("plant-create-outcome-unknown")).not.toBeInTheDocument();
  });

  it.each([
    ["undefined", { code: undefined, message: "TypeError: Failed to fetch" }],
    ["null", { code: null, message: "TypeError: Failed to fetch" }],
  ] as const)(
    "reconciles a committed plant after a returned response-loss failure with a %s code",
    async (_codeKind, error) => {
      singleMock.mockResolvedValueOnce({ data: null, error });
      plantLookupMaybeSingleMock.mockResolvedValueOnce({ data: CREATED_ROW, error: null });
      const onCreated = vi.fn();

      render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter>
            <CreatePlantDialog
              initiallyOpen
              defaultGrowId={G1}
              defaultTentId={T1}
              onCreated={onCreated}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await userEvent.type(screen.getByTestId("create-plant-name"), CREATED_ROW.name);
      await userEvent.click(screen.getByTestId("plant-create-submit"));

      await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED_ROW));
      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(plantLookupEqMock).toHaveBeenCalledWith("id", CREATED_ROW.id);
      expect(screen.queryByTestId("plant-create-outcome-unknown")).not.toBeInTheDocument();
    },
  );

  it("reconciles a committed plant after a thrown transport failure", async () => {
    singleMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    plantLookupMaybeSingleMock.mockResolvedValueOnce({ data: CREATED_ROW, error: null });
    const onCreated = vi.fn();

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <CreatePlantDialog
            initiallyOpen
            defaultGrowId={G1}
            defaultTentId={T1}
            onCreated={onCreated}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByTestId("create-plant-name"), CREATED_ROW.name);
    await userEvent.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED_ROW));
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(plantLookupEqMock).toHaveBeenCalledWith("id", CREATED_ROW.id);
    expect(screen.queryByTestId("plant-create-outcome-unknown")).not.toBeInTheDocument();
  });

  it("keeps a definitive insert rejection retryable without an ambiguity lookup", async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", message: "stage constraint rejected" },
    });

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <CreatePlantDialog initiallyOpen defaultGrowId={G1} defaultTentId={T1} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByTestId("create-plant-name"), "Rejected Plant");
    await userEvent.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => expect(screen.getByTestId("plant-create-submit")).toBeEnabled());
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(plantLookupMaybeSingleMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("plant-create-outcome-unknown")).not.toBeInTheDocument();
  });

  it("prevents a second logical plant create while the first insert is unresolved", async () => {
    let resolveInsert!: (result: { data: typeof CREATED_ROW; error: null }) => void;
    const deferredInsert = new Promise<{ data: typeof CREATED_ROW; error: null }>((resolve) => {
      resolveInsert = resolve;
    });
    singleMock.mockReturnValueOnce(deferredInsert);
    const onCreated = vi.fn();

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <CreatePlantDialog
            initiallyOpen
            defaultGrowId={G1}
            defaultTentId={T1}
            onCreated={onCreated}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByTestId("create-plant-name"), CREATED_ROW.name);
    const form = screen.getByTestId("create-plant-form");
    act(() => {
      unstable_batchedUpdates(() => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveInsert({ data: CREATED_ROW, error: null });
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED_ROW));
  });

  it("refreshes the exact legacy and owner-scoped plant caches before create handoff", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const legacyPlantsKey = ["plants"] as const;
    const ownerGrowPlantsKey = [
      "grow",
      "plants",
      "all",
      G1,
      "owner",
      "11111111-1111-4111-8111-111111111111",
    ] as const;
    let resolveLegacyPlantsRefresh!: () => void;
    let resolveGrowPlantsRefresh!: () => void;
    const legacyPlantsRefresh = new Promise<void>((resolve) => {
      resolveLegacyPlantsRefresh = resolve;
    });
    const growPlantsRefresh = new Promise<void>((resolve) => {
      resolveGrowPlantsRefresh = resolve;
    });
    const legacyQueryFn = vi.fn(async () => {
      await legacyPlantsRefresh;
      return ["legacy-after"];
    });
    const ownerGrowQueryFn = vi.fn(async () => {
      await growPlantsRefresh;
      return ["owner-after"];
    });
    client.setQueryData(legacyPlantsKey, ["legacy-before"]);
    client.setQueryData(ownerGrowPlantsKey, ["owner-before"]);
    const legacyObserver = new QueryObserver(client, {
      queryKey: legacyPlantsKey,
      queryFn: legacyQueryFn,
      staleTime: Number.POSITIVE_INFINITY,
    });
    const ownerGrowObserver = new QueryObserver(client, {
      queryKey: ownerGrowPlantsKey,
      queryFn: ownerGrowQueryFn,
      staleTime: Number.POSITIVE_INFINITY,
    });
    const unsubscribeLegacy = legacyObserver.subscribe(() => {});
    const unsubscribeOwnerGrow = ownerGrowObserver.subscribe(() => {});
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const onCreated = vi.fn();

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreatePlantDialog
            initiallyOpen
            defaultGrowId={G1}
            defaultTentId={T1}
            onCreated={onCreated}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByTestId("create-plant-name"), "Visible Plant");
    await userEvent.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(2));
    expect(invalidateSpy).toHaveBeenNthCalledWith(1, { queryKey: ["plants"] });
    expect(invalidateSpy).toHaveBeenNthCalledWith(2, { queryKey: ["grow", "plants"] });
    expect(legacyQueryFn).toHaveBeenCalledTimes(1);
    expect(ownerGrowQueryFn).toHaveBeenCalledTimes(1);
    expect(funnelEventMock).toHaveBeenCalledWith("plant_created");
    expect(screen.getByTestId("create-plant-form")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();

    resolveLegacyPlantsRefresh();
    await waitFor(() => expect(client.getQueryData(legacyPlantsKey)).toEqual(["legacy-after"]));
    expect(screen.getByTestId("create-plant-form")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();

    resolveGrowPlantsRefresh();
    await waitFor(() => expect(client.getQueryData(ownerGrowPlantsKey)).toEqual(["owner-after"]));
    await waitFor(() => expect(screen.queryByTestId("create-plant-form")).not.toBeInTheDocument());
    expect(onCreated).toHaveBeenCalledWith(CREATED_ROW);
    unsubscribeLegacy();
    unsubscribeOwnerGrow();
  });

  it("keeps a server-confirmed first plant visible when both active cache refreshes fail", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const legacyPlantsKey = ["plants"] as const;
    const activeGrowPlantsKey = ["grow", "plants", "all", G1, "owner", USER_ID] as const;
    const archivedGrowPlantsKey = [
      "grow",
      "plants",
      "all",
      G1,
      "with-archived",
      "owner",
      USER_ID,
    ] as const;
    const matchingTentPlantsKey = ["grow", "plants", T1, G1, "owner", USER_ID] as const;
    const otherTentPlantsKey = ["grow", "plants", T2, G1, "owner", USER_ID] as const;
    const otherGrowPlantsKey = ["grow", "plants", "all", G2, "owner", USER_ID] as const;
    const otherOwnerPlantsKey = ["grow", "plants", "all", G1, "owner", OTHER_USER_ID] as const;

    for (const key of [
      legacyPlantsKey,
      activeGrowPlantsKey,
      archivedGrowPlantsKey,
      matchingTentPlantsKey,
      otherTentPlantsKey,
      otherGrowPlantsKey,
      otherOwnerPlantsKey,
    ]) {
      client.setQueryData(key, []);
    }

    const failedRefresh = vi.fn(async () => {
      // Model the real grow query boundary replacing source metadata with a
      // refresh error after the confirmed row has already been cached.
      clearGrowDataMeta();
      throw new Error("plant refresh unavailable");
    });
    const observers = [legacyPlantsKey, activeGrowPlantsKey, archivedGrowPlantsKey].map(
      (queryKey) =>
        new QueryObserver(client, {
          queryKey,
          queryFn: failedRefresh,
          staleTime: Number.POSITIVE_INFINITY,
          retry: false,
        }),
    );
    const unsubscribers = observers.map((observer) => observer.subscribe(() => {}));
    const onCreated = vi.fn();

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreatePlantDialog
            initiallyOpen
            defaultGrowId={G1}
            defaultTentId={T1}
            onCreated={onCreated}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByTestId("create-plant-name"), CREATED_ROW.name);
    await userEvent.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED_ROW));
    expect(failedRefresh).toHaveBeenCalledTimes(3);
    expect(client.getQueryState(archivedGrowPlantsKey)?.status).toBe("error");

    expect(client.getQueryData(legacyPlantsKey)).toEqual([CREATED_ROW]);
    const expectedMappedPlant = {
      id: CREATED_ROW.id,
      name: CREATED_ROW.name,
      strain: "",
      tentId: T1,
      stage: "seedling",
      startedAt: CREATED_ROW.started_at,
      health: "healthy",
      photo: "",
      lastNote: "",
      growId: G1,
      isArchived: false,
      medium: null,
      potSize: null,
      plantType: "unknown",
    };
    expect(client.getQueryData(activeGrowPlantsKey)).toEqual([expectedMappedPlant]);
    expect(client.getQueryData(archivedGrowPlantsKey)).toEqual([expectedMappedPlant]);
    expect(client.getQueryData(matchingTentPlantsKey)).toEqual([expectedMappedPlant]);
    expect(client.getQueryData(otherTentPlantsKey)).toEqual([]);
    expect(client.getQueryData(otherGrowPlantsKey)).toEqual([]);
    expect(client.getQueryData(otherOwnerPlantsKey)).toEqual([]);
    const refreshFailureMeta = getGrowDataMeta(["grow", "plants", "all", G1], USER_ID);
    expect(refreshFailureMeta.dataSource).toBe("supabase");
    expect(refreshFailureMeta.sourceReason).toBe("supabase:rows");

    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });

  it("does not publish a late insert response into the next authenticated owner's cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const legacyPlantsKey = ["plants"] as const;
    const replacementRow = { ...CREATED_ROW, id: G2, user_id: OTHER_USER_ID };
    let resolveInsert!: () => void;
    const insertResult = new Promise<{ data: typeof CREATED_ROW; error: null }>((resolve) => {
      resolveInsert = () => resolve({ data: CREATED_ROW, error: null });
    });
    singleMock.mockReturnValueOnce(insertResult);
    const onCreated = vi.fn();
    const view = () => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreatePlantDialog
            initiallyOpen
            defaultGrowId={G1}
            defaultTentId={T1}
            onCreated={onCreated}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const rendered = render(view());

    await userEvent.type(screen.getByTestId("create-plant-name"), CREATED_ROW.name);
    await userEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));

    client.clear();
    client.setQueryData(legacyPlantsKey, [replacementRow]);
    authState.userId = OTHER_USER_ID;
    rendered.rerender(view());
    resolveInsert();

    await waitFor(() => expect(client.getQueryData(legacyPlantsKey)).toEqual([replacementRow]));
    expect(onCreated).not.toHaveBeenCalled();
    expect(successToastMock).not.toHaveBeenCalled();
    expect(client.getQueriesData({ queryKey: ["grow", "plants"] })).toEqual([]);
  });

  it("allows dismissal during refresh without a delayed create handoff", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolveLegacyPlantsRefresh!: () => void;
    let resolveGrowPlantsRefresh!: () => void;
    const legacyPlantsRefresh = new Promise<void>((resolve) => {
      resolveLegacyPlantsRefresh = resolve;
    });
    const growPlantsRefresh = new Promise<void>((resolve) => {
      resolveGrowPlantsRefresh = resolve;
    });
    const pendingRefreshes = [legacyPlantsRefresh, growPlantsRefresh];
    const invalidateSpy = vi
      .spyOn(client, "invalidateQueries")
      .mockImplementation(() => pendingRefreshes.shift() ?? Promise.resolve());
    const onCreated = vi.fn();

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreatePlantDialog
            initiallyOpen
            defaultGrowId={G1}
            defaultTentId={T1}
            onCreated={onCreated}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByTestId("create-plant-name"), "Dismissed Plant");
    await userEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("create-plant-form")).not.toBeInTheDocument();

    resolveLegacyPlantsRefresh();
    resolveGrowPlantsRefresh();
    await waitFor(() => expect(successToastMock).toHaveBeenCalledWith("Plant created"));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("suppresses the create handoff when the route unmounts during refresh", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolveLegacyPlantsRefresh!: () => void;
    let resolveGrowPlantsRefresh!: () => void;
    const legacyPlantsRefresh = new Promise<void>((resolve) => {
      resolveLegacyPlantsRefresh = resolve;
    });
    const growPlantsRefresh = new Promise<void>((resolve) => {
      resolveGrowPlantsRefresh = resolve;
    });
    const pendingRefreshes = [legacyPlantsRefresh, growPlantsRefresh];
    const invalidateSpy = vi
      .spyOn(client, "invalidateQueries")
      .mockImplementation(() => pendingRefreshes.shift() ?? Promise.resolve());
    const onCreated = vi.fn();

    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreatePlantDialog
            initiallyOpen
            defaultGrowId={G1}
            defaultTentId={T1}
            onCreated={onCreated}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByTestId("create-plant-name"), "Unmounted Plant");
    await userEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(2));
    view.unmount();

    resolveLegacyPlantsRefresh();
    resolveGrowPlantsRefresh();
    await waitFor(() => expect(successToastMock).toHaveBeenCalledWith("Plant created"));
    expect(onCreated).not.toHaveBeenCalled();
  });
});
