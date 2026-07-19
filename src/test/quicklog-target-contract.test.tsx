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
  plantsLoading: false,
  plantsError: false,
  tentsLoading: false,
  tentsError: false,
  plantsRefetch: vi.fn(),
  tentsRefetch: vi.fn(),
  rpc: vi.fn(),
  growUpdate: vi.fn(),
  growUpdateEq: vi.fn(),
  setActiveGrowId: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => harness.rpc(...args),
    from: () => ({
      update: (...args: unknown[]) => {
        harness.growUpdate(...args);
        return { eq: (...eqArgs: unknown[]) => harness.growUpdateEq(...eqArgs) };
      },
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
  usePlants: () => ({
    data: harness.plantsLoading || harness.plantsError ? undefined : harness.plants,
    isLoading: harness.plantsLoading,
    isPending: harness.plantsLoading,
    isError: harness.plantsError,
    error: harness.plantsError ? new Error("plants unavailable") : null,
    refetch: harness.plantsRefetch,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: harness.tentsLoading || harness.tentsError ? undefined : harness.tents,
    isLoading: harness.tentsLoading,
    isPending: harness.tentsLoading,
    isError: harness.tentsError,
    error: harness.tentsError ? new Error("tents unavailable") : null,
    refetch: harness.tentsRefetch,
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
    client,
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
  harness.plantsLoading = false;
  harness.plantsError = false;
  harness.tentsLoading = false;
  harness.tentsError = false;
  harness.plantsRefetch.mockReset();
  harness.plantsRefetch.mockResolvedValue({ data: harness.plants });
  harness.tentsRefetch.mockReset();
  harness.tentsRefetch.mockResolvedValue({ data: harness.tents });
  harness.rpc.mockReset();
  harness.rpc.mockResolvedValue({ data: { ok: true, grow_event_id: "event-1" }, error: null });
  harness.growUpdate.mockReset();
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
    expect(screen.getByTestId("quick-log-plant-select")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByTestId("quick-log-plant-select")).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByTestId("quick-log-target-error")).not.toBeInTheDocument();
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

  it("isolates a blocked replacement before accepting a new exact route prefill", async () => {
    const view = renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
        "data-target-plant-id",
        "p1",
      ),
    );

    act(() => view.rerenderQuickLog({ plantId: "missing-plant", growId: "g1", tentId: "t1" }));

    expect(await screen.findByTestId("quick-log-target-error")).toHaveTextContent(
      "That plant is no longer available. Choose another plant.",
    );
    const blockedCard = screen.getByTestId("quick-log-target-card");
    expect(blockedCard).not.toHaveAttribute("data-target-plant-id");
    expect(blockedCard).not.toHaveAttribute("data-target-grow-id");
    expect(blockedCard).not.toHaveAttribute("data-target-tent-id");
    expect(screen.getByTestId("quick-log-target-plant")).not.toHaveTextContent("Plant One");
    expect(screen.getByTestId("quick-log-target-tent")).not.toHaveTextContent("Tent One");
    expect(screen.getByTestId("quick-log-target-grow")).not.toHaveTextContent("Grow One");
    expect(screen.getByTestId("quick-log-plant-select")).not.toHaveTextContent("Plant One");
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "Must not write to the previous target" },
    });
    fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);
    expect(harness.rpc).not.toHaveBeenCalled();

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

    const targetError = await screen.findByTestId("quick-log-target-error");
    expect(targetError).toHaveTextContent(
      "That plant is no longer available. Choose another plant.",
    );
    const plantSelect = screen.getByTestId("quick-log-plant-select");
    expect(plantSelect).toHaveAttribute("aria-invalid", "true");
    expect(plantSelect).toHaveAttribute("aria-describedby", "quick-log-target-error");
    expect(document.getElementById("quick-log-target-error")).toBe(targetError);
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

  it("holds a named prefill as pending until plant and tent queries resolve", async () => {
    harness.plantsLoading = true;
    harness.tentsLoading = true;
    const prefill = { plantId: "p1", growId: "g1", tentId: "t1" };
    const view = renderQuickLog(prefill);

    expect(await screen.findByTestId("quick-log-target-loading")).toHaveTextContent(
      "Confirming this Quick Log target. Please wait.",
    );
    expect(screen.queryByTestId("quick-log-target-error")).not.toBeInTheDocument();
    expect(screen.queryByText("That plant is no longer available.", { exact: false })).toBeNull();
    expect(screen.queryByText("The assigned tent is unavailable.", { exact: false })).toBeNull();
    expect(screen.getByTestId("quick-log-plant-select")).toBeDisabled();
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();

    harness.plantsLoading = false;
    harness.tentsLoading = false;
    act(() => view.rerenderQuickLog(prefill));

    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
        "data-target-plant-id",
        "p1",
      ),
    );
    expect(screen.queryByTestId("quick-log-target-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-save")).toBeEnabled();
  });

  it("transitions a loading named prefill to an error and retries only the failed query", async () => {
    harness.plantsLoading = true;
    harness.tentsLoading = true;
    const prefill = { plantId: "p1", growId: "g1", tentId: "t1" };
    const view = renderQuickLog(prefill);

    expect(await screen.findByTestId("quick-log-target-loading")).toBeInTheDocument();

    harness.plantsLoading = false;
    harness.tentsLoading = false;
    harness.tentsError = true;
    act(() => view.rerenderQuickLog(prefill));

    expect(await screen.findByTestId("quick-log-target-query-error")).toHaveTextContent(
      "We couldn't load the tent details needed to confirm this Quick Log target.",
    );
    expect(screen.queryByTestId("quick-log-target-error")).not.toBeInTheDocument();
    expect(screen.queryByText("That plant is no longer available.", { exact: false })).toBeNull();
    expect(screen.getByTestId("quick-log-plant-select")).toBeDisabled();
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();

    fireEvent.click(screen.getByTestId("quick-log-target-retry"));
    expect(harness.plantsRefetch).not.toHaveBeenCalled();
    expect(harness.tentsRefetch).toHaveBeenCalledTimes(1);
  });

  it("does not reveal the previous target when a replacement prefill arrives while loading", async () => {
    const initialPrefill = { plantId: "p1", growId: "g1", tentId: "t1" };
    const replacementPrefill = { plantId: "p2", growId: "g2", tentId: "t2" };
    const view = renderQuickLog(initialPrefill);
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
        "data-target-plant-id",
        "p1",
      ),
    );

    harness.plantsLoading = true;
    harness.tentsLoading = true;
    act(() => view.rerenderQuickLog(replacementPrefill));

    expect(await screen.findByTestId("quick-log-target-loading")).toBeInTheDocument();
    const pendingCard = screen.getByTestId("quick-log-target-card");
    expect(pendingCard).not.toHaveAttribute("data-target-plant-id");
    expect(pendingCard).not.toHaveAttribute("data-target-grow-id");
    expect(pendingCard).not.toHaveAttribute("data-target-tent-id");
    expect(screen.getByTestId("quick-log-target-plant")).not.toHaveTextContent("Plant One");
    expect(screen.getByTestId("quick-log-target-tent")).not.toHaveTextContent("Tent One");
    expect(screen.getByTestId("quick-log-target-grow")).not.toHaveTextContent("Grow One");
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();

    harness.plantsLoading = false;
    harness.tentsLoading = false;
    act(() => view.rerenderQuickLog(replacementPrefill));
    act(() => view.rerenderQuickLog(replacementPrefill));

    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
        "data-target-plant-id",
        "p2",
      ),
    );
  });

  it("freezes the captured target and stage for the full in-flight save", async () => {
    let resolveRpc!: (value: { data: { ok: boolean; grow_event_id: string }; error: null }) => void;
    const pendingRpc = new Promise<{
      data: { ok: boolean; grow_event_id: string };
      error: null;
    }>((resolve) => {
      resolveRpc = resolve;
    });
    harness.rpc.mockReturnValue(pendingRpc);

    const initialPrefill = { plantId: "p1", growId: "g1", tentId: "t1" };
    const replacementPrefill = {
      plantId: "p2",
      growId: "g2",
      tentId: "t2",
      eventType: "watering",
    };
    const view = renderQuickLog(initialPrefill);
    const invalidateSpy = vi.spyOn(view.client, "invalidateQueries");
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
        "data-target-plant-id",
        "p1",
      ),
    );

    const stageSelect = screen.getByTestId("quick-log-stage-select");
    fireEvent.pointerDown(stageSelect, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(stageSelect);
    fireEvent.click(await screen.findByRole("option", { name: "Seedling" }));
    await waitFor(() => expect(stageSelect).toHaveTextContent("Seedling"));
    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "Captured target save" },
    });
    fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));

    const plantSelect = screen.getByTestId("quick-log-plant-select");
    const growSelect = screen.getByTestId("quick-log-grow-select");
    const eventSelect = screen.getByRole("combobox", { name: "Event" });
    expect(plantSelect).toBeDisabled();
    expect(growSelect).toBeDisabled();
    expect(eventSelect).toBeDisabled();
    expect(stageSelect).toBeDisabled();

    fireEvent.click(plantSelect);
    fireEvent.click(growSelect);
    fireEvent.click(eventSelect);
    fireEvent.click(stageSelect);
    act(() => view.rerenderQuickLog(replacementPrefill));

    const inFlightCard = screen.getByTestId("quick-log-target-card");
    expect(inFlightCard).toHaveAttribute("data-target-plant-id", "p1");
    expect(inFlightCard).toHaveAttribute("data-target-grow-id", "g1");
    expect(inFlightCard).toHaveAttribute("data-target-tent-id", "t1");
    expect(screen.getByTestId("quick-log-target-plant")).toHaveTextContent("Plant One");
    expect(screen.getByTestId("quick-log-target-tent")).toHaveTextContent("Tent One");
    expect(screen.getByTestId("quick-log-target-grow")).toHaveTextContent("Grow One");
    expect(stageSelect).toHaveTextContent("Seedling");
    expect(eventSelect).toHaveTextContent("Observation");

    await act(async () => {
      resolveRpc({ data: { ok: true, grow_event_id: "event-1" }, error: null });
      await pendingRpc;
    });
    await waitFor(() => expect(screen.getByTestId("quick-log-post-save")).toBeInTheDocument());

    expect(harness.rpc).toHaveBeenCalledWith(
      "quicklog_save_manual",
      expect.objectContaining({ p_target_type: "plant", p_target_id: "p1" }),
    );
    expect(harness.growUpdate).toHaveBeenCalledWith({ stage: "seedling" });
    expect(harness.growUpdateEq).toHaveBeenCalledWith("id", "g1");
    expect(screen.getByTestId("quick-log-post-save-description")).toHaveTextContent("Plant One");
    expect(screen.getByTestId("quick-log-post-save-description")).toHaveTextContent("Tent One");
    expect(screen.getByTestId("quick-log-post-save-description")).toHaveTextContent("Grow One");
    expect(screen.getByTestId("quick-log-view-target-plant")).toHaveAttribute(
      "data-target-plant-id",
      "p1",
    );
    expect(
      JSON.parse(window.localStorage.getItem("verdant.quickLog.lastTarget.v1") ?? "{}"),
    ).toEqual(expect.objectContaining({ plantId: "p1", growId: "g1", tentId: "t1" }));
    const invalidatedKeys = invalidateSpy.mock.calls.map(([options]) =>
      JSON.stringify(options.queryKey),
    );
    expect(invalidatedKeys).toContain(JSON.stringify(["plant_recent_activity", "p1"]));
    expect(invalidatedKeys).toContain(JSON.stringify(["tent_recent_activity", "t1"]));
    expect(invalidatedKeys).not.toContain(JSON.stringify(["plant_recent_activity", "p2"]));
    expect(invalidatedKeys).not.toContain(JSON.stringify(["tent_recent_activity", "t2"]));
  });
});
