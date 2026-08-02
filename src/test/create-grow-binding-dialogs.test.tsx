import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const mocks = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  growId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  otherGrowId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  nestedTentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  grows: {
    grows: [] as Array<{ id: string; name: string | null }>,
    activeGrowId: null as string | null,
    loading: false,
    error: null as unknown,
    refresh: vi.fn(async () => undefined),
  },
  tents: {
    data: [] as Array<{ id: string; name: string; grow_id: string | null }>,
    isLoading: false,
    isFetching: false,
    isError: false,
    isFetched: true,
    refetch: vi.fn(async () => undefined),
  },
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  toastError: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: mocks.userId }, loading: false }),
}));

vi.mock("@/store/grows", () => ({ useGrows: () => mocks.grows }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => mocks.tents }));
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
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        mocks.inserts.push({ table, payload });
        return {
          select: () => ({
            single: async () => ({
              data:
                table === "tents"
                  ? {
                      id: mocks.nestedTentId,
                      name: payload.name,
                      grow_id: payload.grow_id,
                    }
                  : { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: payload.name },
              error: null,
            }),
          }),
        };
      },
    })),
  },
}));

import CreatePlantDialog from "@/components/CreatePlantDialog";
import CreateTentDialog from "@/components/CreateTentDialog";

function renderDialog(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(wrap());
  return { ...result, rerenderDialog: () => result.rerender(wrap()) };
}

function useReadyGrow(name: string | null = "North Room") {
  mocks.grows.grows = [{ id: mocks.growId, name }];
  mocks.grows.activeGrowId = mocks.growId;
}

beforeEach(() => {
  mocks.grows.grows = [];
  mocks.grows.activeGrowId = null;
  mocks.grows.loading = false;
  mocks.grows.error = null;
  mocks.tents.data = [];
  mocks.tents.isLoading = false;
  mocks.tents.isFetching = false;
  mocks.tents.isError = false;
  mocks.tents.isFetched = true;
  mocks.inserts.length = 0;
  vi.clearAllMocks();
});

describe("create dialogs — remaining fail-closed behavior", () => {
  it("withholds the form while cached grow rows are still loading", () => {
    useReadyGrow();
    mocks.grows.loading = true;

    renderDialog(<CreateTentDialog initiallyOpen />);

    expect(screen.getByTestId("create-tent-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("create-tent-form")).not.toBeInTheDocument();
    expect(mocks.inserts).toHaveLength(0);
  });

  it("uses generic setup copy instead of rendering an id-shaped name", () => {
    useReadyGrow(mocks.growId);

    renderDialog(<CreateTentDialog initiallyOpen />);

    expect(screen.getByTestId("create-tent-target-setup")).toHaveTextContent(
      "Adding to your current setup",
    );
    expect(screen.getByTestId("create-tent-target-setup")).not.toHaveTextContent(mocks.growId);
  });

  it("clears an incompatible default tent and performs zero inserts", async () => {
    useReadyGrow();
    const incompatibleTent = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const compatibleTent = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    mocks.tents.data = [
      { id: incompatibleTent, name: "Other Tent", grow_id: mocks.otherGrowId },
      { id: compatibleTent, name: "Compatible Tent", grow_id: mocks.growId },
    ];

    renderDialog(<CreatePlantDialog initiallyOpen defaultTentId={incompatibleTent} />);

    expect(await screen.findByTestId("create-plant-tent-mismatch")).toHaveTextContent(
      "This tent is in another setup",
    );
    expect(screen.getByRole("link", { name: "Finish setup" })).toHaveAttribute(
      "href",
      "/grow-lineage",
    );
    fireEvent.pointerDown(screen.getByTestId("create-plant-tent-select"), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    fireEvent.click(screen.getByTestId("create-plant-tent-select"));
    expect(await screen.findByRole("option", { name: "Compatible Tent" })).toBeVisible();
    const submit = screen.getByTestId("plant-create-submit");
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(mocks.inserts).toHaveLength(0);
  });

  it("accepts a verified replacement after a supplied tent is unavailable", async () => {
    useReadyGrow();
    const missingTent = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const compatibleTent = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    mocks.tents.data = [{ id: compatibleTent, name: "Compatible Tent", grow_id: mocks.growId }];
    const user = userEvent.setup();

    renderDialog(<CreatePlantDialog initiallyOpen defaultTentId={missingTent} />);

    expect(await screen.findByTestId("create-plant-tent-unavailable")).toBeInTheDocument();
    const blockedSubmit = screen.getByTestId("plant-create-submit");
    expect(blockedSubmit).toBeDisabled();
    fireEvent.submit(blockedSubmit.closest("form")!);
    expect(mocks.inserts).toHaveLength(0);
    fireEvent.pointerDown(screen.getByTestId("create-plant-tent-select"), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    fireEvent.click(screen.getByTestId("create-plant-tent-select"));
    await user.click(await screen.findByRole("option", { name: "Compatible Tent" }));

    await waitFor(() => expect(screen.queryByTestId("create-plant-tent-unavailable")).toBeNull());
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Recovered Plant" },
    });
    expect(screen.getByTestId("plant-create-submit")).toBeEnabled();
    await user.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() =>
      expect(mocks.inserts.filter((call) => call.table === "plants")).toHaveLength(1),
    );
    expect(mocks.inserts.find((call) => call.table === "plants")?.payload).toEqual(
      expect.objectContaining({
        grow_id: mocks.growId,
        tent_id: compatibleTent,
      }),
    );
  });

  it("rejects a stale manually selected cached tent after the tent read fails", async () => {
    useReadyGrow();
    const cachedTent = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    mocks.tents.data = [{ id: cachedTent, name: "Cached Tent", grow_id: mocks.growId }];
    const user = userEvent.setup();
    const view = renderDialog(<CreatePlantDialog initiallyOpen />);

    fireEvent.pointerDown(screen.getByTestId("create-plant-tent-select"), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    fireEvent.click(screen.getByTestId("create-plant-tent-select"));
    await user.click(await screen.findByRole("option", { name: "Cached Tent" }));
    mocks.tents.isError = true;
    view.rerenderDialog();

    fireEvent.click(screen.getByTestId("create-plant-tent-select"));
    expect(screen.queryByRole("option", { name: "Cached Tent" })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Must Not Insert" },
    });
    const submit = screen.getByTestId("plant-create-submit");
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(mocks.inserts).toHaveLength(0);
  });

  it("clears form and tent state when the same dialog instance closes and reopens", async () => {
    useReadyGrow();
    const compatibleTent = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    mocks.tents.data = [{ id: compatibleTent, name: "Compatible Tent", grow_id: mocks.growId }];
    const user = userEvent.setup();
    const view = renderDialog(<CreatePlantDialog initiallyOpen />);

    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Stale Name" },
    });
    fireEvent.pointerDown(screen.getByTestId("create-plant-tent-select"), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    fireEvent.click(screen.getByTestId("create-plant-tent-select"));
    await user.click(await screen.findByRole("option", { name: "Compatible Tent" }));
    expect(screen.getByTestId("create-plant-tent-select")).toHaveTextContent("Compatible Tent");

    await user.click(screen.getByRole("button", { name: "Close" }));
    mocks.grows.grows = [
      { id: mocks.growId, name: "North Room" },
      { id: mocks.otherGrowId, name: "South Room" },
    ];
    mocks.grows.activeGrowId = mocks.otherGrowId;
    view.rerenderDialog();
    await user.click(screen.getByRole("button", { name: "New plant" }));

    expect(screen.getByPlaceholderText("Plant A")).toHaveValue("");
    expect(screen.getByTestId("create-plant-tent-select")).toHaveTextContent("No tent");
    expect(screen.getByTestId("create-plant-target-setup")).toHaveTextContent(
      "Adding to South Room",
    );
    expect(mocks.inserts).toHaveLength(0);
  });

  it("reopen waits for a fresh supplied-tent read before remounting the nested creator", async () => {
    useReadyGrow();
    const compatibleTent = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    mocks.tents.data = [{ id: compatibleTent, name: "Compatible Tent", grow_id: mocks.growId }];
    const user = userEvent.setup();
    const view = renderDialog(<CreatePlantDialog initiallyOpen defaultTentId={compatibleTent} />);

    expect(await screen.findByRole("button", { name: "Add new tent" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));

    mocks.tents.isFetching = true;
    view.rerenderDialog();
    await user.click(screen.getByRole("button", { name: "New plant" }));

    expect(screen.getByTestId("create-plant-tent-pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add new tent" })).not.toBeInTheDocument();
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();

    mocks.tents.isFetching = false;
    mocks.tents.isError = true;
    view.rerenderDialog();
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Still blocked" },
    });

    await waitFor(() =>
      expect(screen.getByTestId("create-plant-tent-unavailable")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("create-plant-tent-retry")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add new tent" })).not.toBeInTheDocument();
    expect(mocks.inserts).toHaveLength(0);
  });

  it("closes and resets an open nested tent writer when the supplied-tent read blocks", async () => {
    useReadyGrow();
    const compatibleTent = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    mocks.tents.data = [{ id: compatibleTent, name: "Compatible Tent", grow_id: mocks.growId }];
    const user = userEvent.setup();
    renderDialog(<CreatePlantDialog initiallyOpen defaultTentId={compatibleTent} />);

    await user.click(await screen.findByRole("button", { name: "Add new tent" }));
    const tentName = screen.getByPlaceholderText("Tent #1");
    await user.type(tentName, "Must reset");
    expect(screen.getByTestId("tent-create-submit")).toBeEnabled();

    mocks.tents.isFetching = true;
    // The mocked hook is not reactive; this parent state update models the
    // render that React Query emits when isFetching changes in production.
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Pending render" },
    });

    expect(screen.getByTestId("create-plant-tent-pending")).toBeInTheDocument();
    expect(screen.queryByTestId("tent-create-submit")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add new tent" })).not.toBeInTheDocument();
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    expect(mocks.inserts.filter((call) => call.table === "tents")).toHaveLength(0);
    expect(mocks.inserts.filter((call) => call.table === "plants")).toHaveLength(0);

    mocks.tents.isFetching = false;
    mocks.tents.isError = true;
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Error render" },
    });

    expect(screen.getByTestId("create-plant-tent-unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-tent-retry")).toBeInTheDocument();
    expect(screen.queryByTestId("tent-create-submit")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add new tent" })).not.toBeInTheDocument();
    expect(mocks.inserts.filter((call) => call.table === "tents")).toHaveLength(0);
    expect(mocks.inserts.filter((call) => call.table === "plants")).toHaveLength(0);

    mocks.tents.isError = false;
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Recovered render" },
    });
    await user.click(await screen.findByRole("button", { name: "Add new tent" }));

    expect(screen.getByPlaceholderText("Tent #1")).toHaveValue("");
    expect(mocks.inserts).toHaveLength(0);
  });

  it("keeps fields and accepts a verified nested tent while the remote list loads", async () => {
    useReadyGrow();
    mocks.tents.isLoading = true;
    mocks.tents.isFetched = false;
    renderDialog(<CreatePlantDialog initiallyOpen />);

    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Keeps Name" },
    });
    fireEvent.change(screen.getByPlaceholderText("Blue Dream"), {
      target: { value: "Keeps Strain" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add new tent" }));
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "Fresh Tent" },
    });
    fireEvent.click(screen.getByTestId("tent-create-submit"));

    await waitFor(() =>
      expect(mocks.inserts.filter((call) => call.table === "tents")).toHaveLength(1),
    );
    expect(mocks.inserts.find((call) => call.table === "tents")?.payload.grow_id).toBe(
      mocks.growId,
    );
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.inserts.filter((call) => call.table === "plants")).toHaveLength(0);
    expect(screen.getByPlaceholderText("Plant A")).toHaveValue("Keeps Name");
    expect(screen.getByPlaceholderText("Blue Dream")).toHaveValue("Keeps Strain");

    await waitFor(() =>
      expect(screen.getByTestId("create-plant-tent-select")).toHaveTextContent("Fresh Tent"),
    );
    expect(screen.getByTestId("plant-create-submit")).toBeEnabled();
    fireEvent.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() =>
      expect(mocks.inserts.filter((call) => call.table === "plants")).toHaveLength(1),
    );
    expect(mocks.inserts.find((call) => call.table === "plants")?.payload).toEqual(
      expect.objectContaining({
        name: "Keeps Name",
        strain: "Keeps Strain",
        grow_id: mocks.growId,
        tent_id: mocks.nestedTentId,
      }),
    );
  });
});
