import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  activeGrowId: "g1" as string | null,
  grows: [
    { id: "g1", name: "Grow One", stage: "veg" },
    { id: "g2", name: "Grow Two", stage: "flower" },
  ],
  plants: [
    { id: "p1", name: "Plant One", grow_id: "g1", tent_id: "t1", stage: "veg" },
    { id: "p2", name: "Plant Two", grow_id: "g2", tent_id: "t2", stage: "flower" },
  ] as Array<Record<string, unknown>>,
  tents: [
    { id: "t1", name: "Tent One", grow_id: "g1" },
    { id: "t2", name: "Tent Two", grow_id: "g2" },
  ] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
  growUpdate: vi.fn(),
  growUpdateEq: vi.fn(),
  setActiveGrowId: vi.fn(),
  toastMessage: vi.fn(),
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
    data: harness.plants,
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: harness.tents,
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
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: (...args: unknown[]) => harness.toastMessage(...args),
  },
}));

vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));

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

interface RpcResponse {
  data: { ok: boolean; grow_event_id: string } | null;
  error: { message: string } | null;
}

function deferredRpc() {
  let resolve!: (value: RpcResponse) => void;
  const promise = new Promise<RpcResponse>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function renderQuickLog(prefill: QuickLogPrefill = { plantId: "p1", growId: "g1", tentId: "t1" }) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const element = (nextPrefill: QuickLogPrefill): ReactElement => (
    <QueryClientProvider client={client}>
      <QuickLog open onOpenChange={onOpenChange} prefill={nextPrefill} />
    </QueryClientProvider>
  );
  const view = render(element(prefill));
  return {
    ...view,
    onOpenChange,
    rerenderQuickLog: (nextPrefill: QuickLogPrefill) => view.rerender(element(nextPrefill)),
  };
}

async function prepareChildNote() {
  fireEvent.click(screen.getByTestId("quick-log-dialog-all-activities-picker-note"));
  const note = await screen.findByTestId("quick-log-dialog-all-activities-note");
  fireEvent.change(note, { target: { value: "Child activity observation" } });
  return screen.getByTestId("quick-log-dialog-all-activities-save") as HTMLButtonElement;
}

async function prepareChildHarvest() {
  fireEvent.click(screen.getByTestId("quick-log-dialog-all-activities-picker-harvest"));
  const wet = await screen.findByTestId("quick-log-dialog-all-activities-harvest-wet");
  const dry = screen.getByTestId("quick-log-dialog-all-activities-harvest-dry");
  const unit = screen.getByTestId("quick-log-dialog-all-activities-harvest-unit");
  const note = screen.getByTestId("quick-log-dialog-all-activities-note");
  fireEvent.change(wet, { target: { value: "120" } });
  fireEvent.change(dry, { target: { value: "22" } });
  fireEvent.change(unit, { target: { value: "oz" } });
  fireEvent.change(note, { target: { value: "Harvest activity A" } });
  return {
    wet: wet as HTMLInputElement,
    dry: dry as HTMLInputElement,
    unit: unit as HTMLSelectElement,
    note: note as HTMLTextAreaElement,
    save: screen.getByTestId("quick-log-dialog-all-activities-save") as HTMLButtonElement,
    cancel: screen.getByTestId("quick-log-dialog-all-activities-cancel") as HTMLButtonElement,
  };
}

function prepareMainNote() {
  fireEvent.change(screen.getByTestId("quicklog-note"), {
    target: { value: "Main form observation" },
  });
}

function mainForm(): HTMLFormElement {
  return screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement;
}

function submitForm(form: HTMLFormElement) {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function expectParentSelectorsLocked(locked: boolean) {
  const selectors = [
    screen.getByTestId("quick-log-plant-select"),
    screen.getByTestId("quick-log-grow-select"),
    screen.getByRole("combobox", { name: "Event" }),
    screen.getByTestId("quick-log-stage-select"),
  ];
  for (const selector of selectors) {
    if (locked) expect(selector).toBeDisabled();
    else expect(selector).toBeEnabled();
  }
}

function childActivityButton(id: string): HTMLButtonElement {
  return screen.getByTestId(`quick-log-dialog-all-activities-picker-${id}`) as HTMLButtonElement;
}

function expectEveryChildMutationControlLocked() {
  const section = screen.getByTestId("quick-log-dialog-all-activities");
  const controls = Array.from(
    section.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("button, input, textarea, select"),
  );
  expect(controls.length).toBeGreaterThan(0);
  controls.forEach((control) => expect(control).toBeDisabled());

  const picker = within(section).getByRole("group", { name: "Quick Log activity" });
  within(picker)
    .getAllByRole("button")
    .forEach((button) => expect(button).toHaveAttribute("aria-disabled", "true"));
}

beforeEach(() => {
  window.localStorage.clear();
  harness.activeGrowId = "g1";
  harness.rpc.mockReset();
  harness.growUpdate.mockReset();
  harness.growUpdateEq.mockReset();
  harness.growUpdateEq.mockResolvedValue({ error: null });
  harness.setActiveGrowId.mockReset();
  harness.setActiveGrowId.mockImplementation((growId: string) => {
    harness.activeGrowId = growId;
  });
  harness.toastMessage.mockReset();
});

afterEach(() => cleanup());

describe("Quick Log shared in-flight coordination", () => {
  it("names the disabled main Save as Saving while the shared lock is active", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog();
    const childSave = await prepareChildNote();

    fireEvent.click(childSave);
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));

    const mainSave = screen.getByTestId("quick-log-save");
    expect(mainSave).toBeDisabled();
    expect(mainSave).toHaveAccessibleName(/^saving(?:…|\.\.\.)$/i);
    expect(mainSave.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    await act(async () => {
      pending.resolve({ data: { ok: true, grow_event_id: "child-event" }, error: null });
      await pending.promise;
    });
  });

  it("locks every child draft mutation while child activity A saves, then re-enables after success", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog();
    const harvest = await prepareChildHarvest();

    act(() => {
      harvest.save.click();
      childActivityButton("feeding").click();
      fireEvent.change(harvest.wet, { target: { value: "999" } });
      fireEvent.change(harvest.dry, { target: { value: "999" } });
      fireEvent.change(harvest.unit, { target: { value: "kg" } });
      fireEvent.change(harvest.note, { target: { value: "Newer draft B" } });
      harvest.cancel.click();
    });

    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    expectEveryChildMutationControlLocked();
    expect(screen.getByTestId("quick-log-dialog-all-activities-form")).toHaveAttribute(
      "data-activity-id",
      "harvest",
    );
    expect(harvest.wet).toHaveValue("120");
    expect(harvest.dry).toHaveValue("22");
    expect(harvest.unit).toHaveValue("oz");
    expect(harvest.note).toHaveValue("Harvest activity A");

    const mainSave = screen.getByTestId("quick-log-save");
    expect(mainSave).toBeDisabled();
    expect(mainSave).toHaveAccessibleName(/^saving(?:…|\.\.\.)$/i);
    expect(mainSave.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    await act(async () => {
      pending.resolve({ data: { ok: true, grow_event_id: "child-event" }, error: null });
      await pending.promise;
    });

    expect(await screen.findByTestId("quick-log-dialog-all-activities-saved-item")).toHaveAttribute(
      "data-saved-activity-id",
      "harvest",
    );
    expect(screen.queryByTestId("quick-log-dialog-all-activities-form")).not.toBeInTheDocument();
    expect(childActivityButton("feeding")).toBeEnabled();
    expect(childActivityButton("feeding")).not.toHaveAttribute("aria-disabled");
    fireEvent.click(childActivityButton("feeding"));
    expect(await screen.findByTestId("quick-log-dialog-all-activities-form")).toHaveAttribute(
      "data-activity-id",
      "feeding",
    );
  });

  it("retains child activity A and re-enables every draft mutation after failure", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog();
    const childSave = await prepareChildNote();
    const note = screen.getByTestId("quick-log-dialog-all-activities-note") as HTMLTextAreaElement;
    const cancel = screen.getByTestId(
      "quick-log-dialog-all-activities-cancel",
    ) as HTMLButtonElement;

    act(() => {
      childSave.click();
      childActivityButton("feeding").click();
      fireEvent.change(note, { target: { value: "Newer draft B" } });
      cancel.click();
    });

    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    expectEveryChildMutationControlLocked();
    await act(async () => {
      pending.resolve({ data: null, error: { message: "offline" } });
      await pending.promise;
    });

    expect(await screen.findByTestId("quick-log-dialog-all-activities-error")).toHaveTextContent(
      /save failed/i,
    );
    expect(screen.getByTestId("quick-log-dialog-all-activities-form")).toHaveAttribute(
      "data-activity-id",
      "note",
    );
    expect(note).toHaveValue("Child activity observation");
    expect(note).toBeEnabled();
    expect(cancel).toBeEnabled();
    expect(childSave).toBeEnabled();
    expect(childActivityButton("feeding")).toBeEnabled();
  });

  it("locks every existing child draft mutation while the main save owns the shared guard", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog();
    const harvest = await prepareChildHarvest();
    prepareMainNote();

    act(() => {
      submitForm(mainForm());
      childActivityButton("feeding").click();
      fireEvent.change(harvest.wet, { target: { value: "999" } });
      fireEvent.change(harvest.dry, { target: { value: "999" } });
      fireEvent.change(harvest.unit, { target: { value: "kg" } });
      fireEvent.change(harvest.note, { target: { value: "Newer draft B" } });
      harvest.cancel.click();
    });

    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    expectEveryChildMutationControlLocked();
    expect(screen.getByTestId("quick-log-dialog-all-activities-form")).toHaveAttribute(
      "data-activity-id",
      "harvest",
    );
    expect(harvest.wet).toHaveValue("120");
    expect(harvest.dry).toHaveValue("22");
    expect(harvest.unit).toHaveValue("oz");
    expect(harvest.note).toHaveValue("Harvest activity A");

    await act(async () => {
      pending.resolve({ data: { ok: true, grow_event_id: "main-event" }, error: null });
      await pending.promise;
    });

    await waitFor(() => expect(childActivityButton("feeding")).toBeEnabled());
    expect(harvest.wet).toBeEnabled();
    expect(harvest.dry).toBeEnabled();
    expect(harvest.unit).toBeEnabled();
    expect(harvest.note).toBeEnabled();
    expect(harvest.cancel).toBeEnabled();
    expect(harvest.save).toBeEnabled();
  });

  it("locks the parent and close path while a child save holds its captured target", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    const view = renderQuickLog();
    const childSave = await prepareChildNote();

    fireEvent.click(childSave);
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    expect(harness.rpc).toHaveBeenCalledWith(
      "quicklog_save_manual",
      expect.objectContaining({
        p_grow_id: "g1",
        p_tent_id: "t1",
        p_plant_id: "p1",
      }),
    );
    expectParentSelectorsLocked(true);
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();

    act(() => {
      view.rerenderQuickLog({ plantId: "p2", growId: "g2", tentId: "t2" });
    });
    const inFlightTarget = screen.getByTestId("quick-log-target-card");
    expect(inFlightTarget).toHaveAttribute("data-target-plant-id", "p1");
    expect(inFlightTarget).toHaveAttribute("data-target-grow-id", "g1");
    expect(inFlightTarget).toHaveAttribute("data-target-tent-id", "t1");

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(view.onOpenChange).not.toHaveBeenCalled();
    expect(harness.toastMessage).toHaveBeenCalledWith(expect.stringMatching(/save in progress/i));

    await act(async () => {
      pending.resolve({ data: { ok: true, grow_event_id: "child-event" }, error: null });
      await pending.promise;
    });

    const confirmation = await screen.findByTestId("quick-log-dialog-all-activities-saved-item");
    expect(confirmation).toMatchObject({
      dataset: expect.objectContaining({
        targetPlantId: "p1",
        targetGrowId: "g1",
        targetTentId: "t1",
      }),
    });
    await waitFor(() => expectParentSelectorsLocked(false));
    expect(screen.getByTestId("quick-log-save")).toBeEnabled();
  });

  it("releases the parent and close path after a child save failure", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    const view = renderQuickLog();
    const childSave = await prepareChildNote();

    fireEvent.click(childSave);
    await waitFor(() => expectParentSelectorsLocked(true));
    await act(async () => {
      pending.resolve({ data: null, error: { message: "offline" } });
      await pending.promise;
    });

    expect(await screen.findByTestId("quick-log-dialog-all-activities-error")).toHaveTextContent(
      /save failed/i,
    );
    await waitFor(() => expectParentSelectorsLocked(false));
    expect(screen.getByTestId("quick-log-save")).toBeEnabled();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(view.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("blocks the main submit synchronously when a child save starts first", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog();
    prepareMainNote();
    const childSave = await prepareChildNote();

    act(() => {
      childSave.click();
      submitForm(mainForm());
    });

    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(harness.rpc.mock.calls[0][1]).toEqual(expect.objectContaining({ p_plant_id: "p1" }));

    await act(async () => {
      pending.resolve({ data: { ok: true, grow_event_id: "child-event" }, error: null });
      await pending.promise;
    });
  });

  it("blocks the child submit synchronously when the main save starts first", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog();
    prepareMainNote();
    const childSave = await prepareChildNote();

    act(() => {
      submitForm(mainForm());
      childSave.click();
    });

    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(harness.rpc.mock.calls[0][1]).toEqual(expect.objectContaining({ p_target_id: "p1" }));

    await act(async () => {
      pending.resolve({ data: { ok: true, grow_event_id: "main-event" }, error: null });
      await pending.promise;
    });
  });

  it("blocks a same-tick child double-submit before presenter state propagates", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog();
    const childSave = await prepareChildNote();

    act(() => {
      childSave.click();
      childSave.click();
    });

    expect(harness.rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ data: { ok: true, grow_event_id: "child-event" }, error: null });
      await pending.promise;
    });
  });
});
