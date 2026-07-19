import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  activeGrowId: "g1" as string | null,
  grows: [
    { id: "g1", name: "Grow One", stage: "veg" },
    { id: "g2", name: "Grow Two", stage: "flower" },
  ],
  plants: [] as Array<Record<string, unknown>>,
  tents: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
  growUpdateEq: vi.fn(),
  setActiveGrowId: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => harness.rpc(...args),
    from: () => ({
      update: () => ({ eq: (...args: unknown[]) => harness.growUpdateEq(...args) }),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: harness.grows,
    activeGrow: harness.grows.find((grow) => grow.id === harness.activeGrowId) ?? null,
    activeGrowId: harness.activeGrowId,
    setActiveGrowId: harness.setActiveGrowId,
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: harness.plants, isLoading: false }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: harness.tents, isLoading: false }),
}));

vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: {
      status: "empty",
      source: null,
      captured_at: null,
      badge_label: "No data",
      metrics: {
        temp_f: null,
        humidity_pct: null,
        vpd_kpa: null,
        soil_moisture_pct: null,
        co2_ppm: null,
      },
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: (props: { growId: string | null; tentId: string | null; plantId: string | null }) => (
    <div
      data-testid="all-activities-target"
      data-grow-id={props.growId ?? ""}
      data-tent-id={props.tentId ?? ""}
      data-plant-id={props.plantId ?? ""}
    />
  ),
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

function quickLogElement(prefill?: QuickLogPrefill): ReactElement {
  return <QuickLog open onOpenChange={() => {}} prefill={prefill} />;
}

function renderQuickLog(prefill?: QuickLogPrefill) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const element = (ui: ReactElement) => (
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
  const view = render(element(quickLogElement(prefill)));
  return {
    ...view,
    rerenderQuickLog: (nextPrefill = prefill) =>
      view.rerender(element(quickLogElement(nextPrefill))),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  harness.activeGrowId = "g1";
  harness.plants = [
    { id: "p1", name: "Plant One", grow_id: "g1", tent_id: "t1", stage: "veg" },
    { id: "p2", name: "Plant Two", grow_id: "g2", tent_id: "t2", stage: "flower" },
  ];
  harness.tents = [
    { id: "t1", name: "Tent One", grow_id: "g1" },
    { id: "t2", name: "Tent Two", grow_id: "g2" },
  ];
  harness.rpc.mockReset();
  harness.rpc.mockResolvedValue({ data: { ok: true, grow_event_id: "event-1" }, error: null });
  harness.growUpdateEq.mockReset();
  harness.growUpdateEq.mockResolvedValue({ error: null });
  harness.setActiveGrowId.mockReset();
  harness.setActiveGrowId.mockImplementation((growId: string) => {
    harness.activeGrowId = growId;
  });
});

afterEach(() => cleanup());

describe("Quick Log canonical target contract", () => {
  it("holds a cross-grow route prefill until the exact grow/tent/plant target resolves", async () => {
    const view = renderQuickLog({
      plantId: "p2",
      growId: "g2",
      tentId: "t2",
      eventType: "observation",
    });

    expect(harness.setActiveGrowId).toHaveBeenCalledWith("g2");
    expect(screen.queryByText("Plant One")).not.toBeInTheDocument();

    act(() => view.rerenderQuickLog());

    const card = await screen.findByTestId("quick-log-target-card");
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-plant")).toHaveTextContent("Plant Two"),
    );
    expect(screen.getByTestId("quick-log-target-grow")).toHaveTextContent("Grow Two");
    expect(screen.getByTestId("quick-log-target-tent")).toHaveTextContent("Tent Two");
    expect(card).toHaveAttribute("data-target-plant-id", "p2");
    expect(card).toHaveAttribute("data-target-grow-id", "g2");
    expect(card).toHaveAttribute("data-target-tent-id", "t2");

    expect(screen.getByTestId("all-activities-target")).toMatchObject({
      dataset: expect.objectContaining({ plantId: "p2", growId: "g2", tentId: "t2" }),
    });
  });

  it("submits the exact target displayed on the target card through quicklog_save_manual", async () => {
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });

    const card = await screen.findByTestId("quick-log-target-card");
    await waitFor(() => expect(card).toHaveAttribute("data-target-plant-id", "p1"));
    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "Target contract observation" },
    });
    fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);

    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    expect(harness.rpc).toHaveBeenCalledWith(
      "quicklog_save_manual",
      expect.objectContaining({
        p_target_type: "plant",
        p_target_id: card.getAttribute("data-target-plant-id"),
      }),
    );
  });

  it("replaces an open dialog target when a new exact route prefill arrives", async () => {
    const view = renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
        "data-target-plant-id",
        "p1",
      ),
    );

    act(() => view.rerenderQuickLog({ plantId: "p2", growId: "g2", tentId: "t2" }));

    await waitFor(() => {
      const card = screen.getByTestId("quick-log-target-card");
      expect(card).toHaveAttribute("data-target-plant-id", "p2");
      expect(card).toHaveAttribute("data-target-grow-id", "g2");
      expect(card).toHaveAttribute("data-target-tent-id", "t2");
    });
  });

  it("fails closed for an unassigned legacy plant and sends no RPC", async () => {
    harness.plants = [
      { id: "legacy-p", name: "Legacy Plant", grow_id: null, tent_id: null, stage: "veg" },
    ];
    harness.tents = [];
    renderQuickLog({ plantId: "legacy-p" });

    expect(await screen.findByTestId("quick-log-target-error")).toHaveTextContent(
      "Assign this plant to a grow and tent before saving.",
    );
    expect(screen.getByTestId("quick-log-target-card")).not.toHaveAttribute("data-target-plant-id");
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the assigned tent belongs to another grow", async () => {
    harness.tents = [{ id: "t1", name: "Tent One", grow_id: "g2" }];
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });

    expect(await screen.findByTestId("quick-log-target-error")).toHaveTextContent(
      /tent belongs to another grow/i,
    );
    expect(screen.getByTestId("quick-log-target-card")).not.toHaveAttribute("data-target-plant-id");
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("holds an unknown route prefill instead of falling through to a remembered target", async () => {
    window.localStorage.setItem(
      "verdant.quickLog.lastTarget.v1",
      JSON.stringify({
        plantId: "p1",
        growId: "g1",
        tentId: "t1",
        savedAt: "2026-07-18T00:00:00.000Z",
      }),
    );

    renderQuickLog({ plantId: "missing-plant", growId: "g1", tentId: "t1" });

    expect(await screen.findByTestId("quick-log-target-error")).toHaveTextContent(
      "That plant is no longer available. Choose another plant.",
    );
    expect(screen.getByTestId("quick-log-target-card")).not.toHaveAttribute("data-target-plant-id");
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "Must not write to the remembered plant" },
    });
    fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);
    await waitFor(() => expect(harness.rpc).not.toHaveBeenCalled());
  });

  it("holds an archived route prefill instead of falling through to the sole scoped plant", async () => {
    harness.plants = [
      { id: "p1", name: "Plant One", grow_id: "g1", tent_id: "t1", stage: "veg" },
      {
        id: "archived-p",
        name: "Archived Plant",
        grow_id: "g1",
        tent_id: "t1",
        stage: "veg",
        is_archived: true,
      },
    ];

    renderQuickLog({ plantId: "archived-p", growId: "g1", tentId: "t1" });

    expect(await screen.findByTestId("quick-log-target-error")).toHaveTextContent(
      "That plant is archived or merged. Choose an active plant.",
    );
    expect(screen.getByTestId("quick-log-plant-select")).not.toHaveTextContent("Plant One");
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "Must not write to the only other plant" },
    });
    fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);
    await waitFor(() => expect(harness.rpc).not.toHaveBeenCalled());
  });

  it("releases a blocked prefill hold only after an explicit valid plant selection", async () => {
    renderQuickLog({ plantId: "missing-plant", growId: "g1", tentId: "t1" });
    expect(await screen.findByTestId("quick-log-target-error")).toHaveTextContent(
      "That plant is no longer available. Choose another plant.",
    );

    const trigger = screen.getByTestId("quick-log-plant-select");
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("option", { name: /Plant One/i }));

    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
        "data-target-plant-id",
        "p1",
      ),
    );
    expect(screen.queryByTestId("quick-log-target-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-save")).toBeEnabled();
  });

  it("replaces a blocked prefill hold when a new valid prefill arrives", async () => {
    const view = renderQuickLog({ plantId: "missing-plant", growId: "g1", tentId: "t1" });
    expect(await screen.findByTestId("quick-log-target-error")).toBeInTheDocument();

    act(() => view.rerenderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" }));

    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
        "data-target-plant-id",
        "p1",
      ),
    );
    expect(screen.queryByTestId("quick-log-target-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-save")).toBeEnabled();
  });
});
