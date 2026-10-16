import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocalStorageItemForTest } from "./helpers/localStorageTestHelper";
import QuickLog from "@/components/QuickLog";

const GROW = { id: "g-active", name: "Active grow", stage: "veg" };
const PLANTS = [
  {
    id: "plant-new",
    name: "Newer plant",
    grow_id: "g-active",
    tent_id: "tent-new",
    stage: "veg",
  },
];
const TENTS = [{ id: "tent-new", name: "New tent", grow_id: "g-active" }];

const harness = vi.hoisted(() => ({
  activeGrowId: "g-active" as string | null,
  grows: [] as Array<{ id: string; name: string; stage: string }>,
  loading: undefined as boolean | undefined,
  error: undefined as string | null | undefined,
  refresh: vi.fn(async () => {}),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => harness.rpc(...args), from: () => ({}) },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: harness.grows,
    archivedGrows: [],
    activeGrow: null,
    activeGrowId: harness.activeGrowId,
    setActiveGrowId: vi.fn(),
    loading: harness.loading,
    error: harness.error,
    refresh: harness.refresh,
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: PLANTS,
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: TENTS,
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: {
      status: "empty",
      source: null,
      captured_at: null,
      badge_label: "No data",
      metrics: {},
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({ default: () => null }));

function renderLaunched() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <QuickLog
        open
        onOpenChange={() => {}}
        prefill={{ plantId: "plant-new", eventType: "observation" }}
      />
    </QueryClientProvider>,
  );
}

async function submitNote() {
  fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
    target: { value: "lookup gate note" },
  });
  fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

beforeEach(() => {
  harness.rpc.mockReset();
  harness.refresh.mockClear();
  harness.rpc.mockResolvedValue({
    data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000009" },
    error: null,
  });
  harness.grows = [];
  harness.activeGrowId = "g-active";
  harness.loading = undefined;
  harness.error = undefined;
  setLocalStorageItemForTest("verdant.activeGrow.u1", "g-active");
});

afterEach(() => cleanup());

describe("legacy Quick Log grows lookup gate", () => {
  it("does not invoke the save mutation while the grows lookup is pending", async () => {
    harness.loading = true;
    harness.error = null;
    renderLaunched();
    const save = screen.getByTestId("quick-log-save") as HTMLButtonElement;
    await submitNote();
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(save).toBeDisabled();
    expect(screen.getByTestId("quick-log-target-grow").textContent).not.toMatch(/Assigned grow/);
    expect(screen.getByTestId("quick-log-grows-lookup-loading").textContent).toMatch(
      /loading grows/i,
    );
  });

  it("does not invoke the save mutation while the grows lookup has failed", async () => {
    harness.loading = false;
    harness.error = "grows lookup failed";
    renderLaunched();
    const save = screen.getByTestId("quick-log-save") as HTMLButtonElement;
    await submitNote();
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(save).toBeDisabled();
    expect(screen.getByTestId("quick-log-grows-lookup-error").textContent).toMatch(
      /couldn't load your grows/i,
    );
    fireEvent.click(screen.getByTestId("quick-log-grows-lookup-retry"));
    expect(harness.refresh).toHaveBeenCalledTimes(1);
  });

  it("re-enables save only after a successful retry and a ready target", async () => {
    harness.loading = false;
    harness.error = "grows lookup failed";
    harness.refresh.mockImplementation(async () => {
      harness.loading = false;
      harness.error = null;
      harness.grows = [GROW];
    });
    const view = renderLaunched();
    fireEvent.click(screen.getByTestId("quick-log-grows-lookup-retry"));
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <QuickLog
          open
          onOpenChange={() => {}}
          prefill={{ plantId: "plant-new", eventType: "observation" }}
        />
      </QueryClientProvider>,
    );
    const save = screen.getByTestId("quick-log-save") as HTMLButtonElement;
    expect(save).not.toBeDisabled();
    await submitNote();
    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(harness.rpc.mock.calls[0]?.[0]).toBe("quicklog_save_manual");
  });

  it("shows a zero-grow message when the lookup loaded with no grows", async () => {
    harness.loading = false;
    harness.error = null;
    harness.grows = [];
    renderLaunched();
    const save = screen.getByTestId("quick-log-save") as HTMLButtonElement;
    expect(screen.queryByText(/Choose a plant before saving/i)).toBeNull();
    expect(screen.getByTestId("quick-log-grows-lookup-empty").textContent).toMatch(/no grows yet/i);
    expect(save).toBeDisabled();
    await submitNote();
    expect(harness.rpc).not.toHaveBeenCalled();
  });
});
