import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  activeGrowId: "g-active" as string | null,
  grows: [{ id: "g-active", name: "Newer grow", stage: "veg" }] as Array<{
    id: string;
    name: string;
    stage: string;
  }>,
  archivedGrows: [
    { id: "g-archived", name: "Winter run", stage: "flower", is_archived: true },
  ] as Array<{ id: string; name: string; stage: string; is_archived: boolean }>,
  plants: [] as Array<Record<string, unknown>>,
  tents: [] as Array<Record<string, unknown>>,
  plantsLoading: false,
  plantsError: false,
  tentsLoading: false,
  tentsError: false,
  rpc: vi.fn(),
  setActiveGrowId: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => harness.rpc(...args),
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: harness.grows,
    archivedGrows: harness.archivedGrows,
    activeGrow: harness.grows.find((grow) => grow.id === harness.activeGrowId) ?? null,
    activeGrowId: harness.activeGrowId,
    setActiveGrowId: harness.setActiveGrowId,
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: harness.plantsLoading || harness.plantsError ? undefined : harness.plants,
    isLoading: harness.plantsLoading,
    isPending: harness.plantsLoading,
    isError: harness.plantsError,
    error: harness.plantsError ? new Error("plants unavailable") : null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: harness.tentsLoading || harness.tentsError ? undefined : harness.tents,
    isLoading: harness.tentsLoading,
    isPending: harness.tentsLoading,
    isError: harness.tentsError,
    error: harness.tentsError ? new Error("tents unavailable") : null,
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

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: () => <div data-testid="all-activities-target" />,
}));

import QuickLog, { type QuickLogPrefill } from "@/components/QuickLog";

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

function renderQuickLog(prefill?: QuickLogPrefill) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const ui = (next?: QuickLogPrefill): ReactElement => (
    <QueryClientProvider client={client}>
      <QuickLog open onOpenChange={() => {}} prefill={next} />
    </QueryClientProvider>
  );
  return render(ui(prefill));
}

beforeEach(() => {
  harness.activeGrowId = "g-active";
  harness.grows = [{ id: "g-active", name: "Newer grow", stage: "veg" }];
  harness.archivedGrows = [
    { id: "g-archived", name: "Winter run", stage: "flower", is_archived: true },
  ];
  harness.plants = [
    {
      id: "plant-old",
      name: "Archived plant",
      grow_id: "g-archived",
      tent_id: "tent-old",
      stage: "flower",
    },
    {
      id: "plant-new",
      name: "Newer plant",
      grow_id: "g-active",
      tent_id: "tent-new",
      stage: "veg",
    },
  ];
  harness.tents = [
    { id: "tent-old", name: "Old tent", grow_id: "g-archived" },
    { id: "tent-new", name: "New tent", grow_id: "g-active" },
  ];
  harness.plantsLoading = false;
  harness.tentsLoading = false;
  harness.rpc.mockReset();
  harness.rpc.mockResolvedValue({
    data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000009" },
    error: null,
  });
  harness.setActiveGrowId.mockReset();
  setLocalStorageItemForTest("verdant.activeGrow.u1", "g-active");
});

afterEach(() => cleanup());

describe("Quick Log launcher for a plant in an archived grow", () => {
  it("shows the named plant as a ready note target on the first render and keeps the stored grow", async () => {
    renderQuickLog({
      plantId: "plant-old",
      growId: "g-archived",
      tentId: "tent-old",
      eventType: "observation",
    });

    expect(screen.queryByTestId("quick-log-target-loading")).not.toBeInTheDocument();
    expect(screen.queryByText(/Confirming this Quick Log target/)).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-target-plant")).toHaveTextContent("Archived plant");
    expect(screen.getByTestId("quick-log-target-grow")).toHaveTextContent("Winter run");
    expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
      "data-target-plant-id",
      "plant-old",
    );
    expect(screen.getByTestId("quick-log-save")).toBeEnabled();
    expect(harness.setActiveGrowId).not.toHaveBeenCalled();
    expect(harness.activeGrowId).toBe("g-active");
    expect(getLocalStorageItemForTest("verdant.activeGrow.u1")).toBe("g-active");
    fireEvent.pointerDown(screen.getByTestId("quick-log-plant-select"), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    fireEvent.click(screen.getByTestId("quick-log-plant-select"));
    expect(await screen.findByRole("option", { name: /Archived plant/i })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "Backdated note on the archived grow" },
    });
    fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);

    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    expect(harness.rpc).toHaveBeenCalledWith(
      "quicklog_save_manual",
      expect.objectContaining({
        p_action: "note",
        p_target_id: "plant-old",
      }),
    );
    expect(harness.setActiveGrowId).not.toHaveBeenCalled();
    expect(getLocalStorageItemForTest("verdant.activeGrow.u1")).toBe("g-active");
  });

  it("shows a final archived-grow message for a non-note instead of confirming", () => {
    renderQuickLog({
      plantId: "plant-old",
      growId: "g-archived",
      tentId: "tent-old",
      eventType: "environment",
    });

    expect(screen.queryByTestId("quick-log-target-loading")).not.toBeInTheDocument();
    expect(screen.queryByText(/Confirming this Quick Log target/)).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-target-error")).toHaveTextContent(
      "This plant's grow is archived. Restore the grow to log to it.",
    );
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(harness.setActiveGrowId).not.toHaveBeenCalled();
    expect(harness.activeGrowId).toBe("g-active");
    expect(harness.rpc).not.toHaveBeenCalled();
  });
});
