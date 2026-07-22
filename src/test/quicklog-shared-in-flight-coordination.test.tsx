import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const harness = vi.hoisted(() => ({
  activeGrowId: "g1" as string | null,
  grows: [
    { id: "g1", name: "Grow One", stage: "" },
    { id: "g2", name: "Grow Two", stage: "flower" },
  ],
  plants: [
    {
      id: "p1",
      name: "Plant One",
      grow_id: "g1",
      tent_id: "t1",
      stage: "",
      created_at: new Date().toISOString(),
      pheno_hunt_id: "hunt-1",
      candidate_label: "#1",
    },
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
  sensorStatus: "ready" as "ready" | "empty",
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
    status: harness.sensorStatus,
    snapshot: {
      sensor_snapshot_id: "sensor-1",
      tent_id: "t1",
      age_minutes: 1,
      confidence: 0.99,
      freshness: "fresh",
      status: harness.sensorStatus === "ready" ? "fresh_live" : "empty",
      source: harness.sensorStatus === "ready" ? "ecowitt" : null,
      captured_at: harness.sensorStatus === "ready" ? new Date().toISOString() : null,
      badge_label: harness.sensorStatus === "ready" ? "Live" : "No data",
      metrics: {
        temp_f: harness.sensorStatus === "ready" ? 76 : null,
        humidity_pct: harness.sensorStatus === "ready" ? 55 : null,
        vpd_kpa: harness.sensorStatus === "ready" ? 1.1 : null,
        soil_moisture_pct: null,
        co2_ppm: null,
      },
      metricDetails: {},
      warnings: [],
      usable: harness.sensorStatus === "ready",
    },
  }),
}));

vi.mock("@/hooks/usePhenoEvidenceCaptureContext", () => ({
  usePhenoEvidenceCaptureContext: (_huntId: string | null, plantId: string | null) => ({
    status: plantId ? "ready" : "disabled",
    context: plantId
      ? {
          huntId: "hunt-1",
          huntName: "Test Hunt",
          plantId,
          coverage: {
            completedCount: 0,
            totalCount: 2,
            goals: [
              { id: "structure", label: "Structure", recorded: false },
              { id: "aroma", label: "Aroma", recorded: false },
            ],
          },
        }
      : null,
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

function expectMainDraftSemanticallyLocked(locked: boolean) {
  const fieldset = screen.getByTestId("quick-log-main-draft-fields") as HTMLFieldSetElement;
  if (locked) {
    expect(fieldset).toBeDisabled();
    expect(fieldset).toHaveAttribute("aria-disabled", "true");
  } else {
    expect(fieldset).toBeEnabled();
    expect(fieldset).toHaveAttribute("aria-disabled", "false");
  }

  const controls = Array.from(
    fieldset.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>(
      "button, input, textarea",
    ),
  ).filter((control) => control.dataset.testid !== "quick-log-save");
  expect(controls.length).toBeGreaterThan(0);
  controls.forEach((control) => {
    if (locked) expect(control).toBeDisabled();
    else expect(control).toBeEnabled();
  });
}

async function prepareObservationMainDraft() {
  const note = screen.getByTestId("quicklog-note") as HTMLTextAreaElement;
  fireEvent.change(note, { target: { value: "Original main observation" } });

  const snapshot = screen.getByTestId("quick-log-snapshot-toggle") as HTMLButtonElement;
  await waitFor(() => expect(snapshot).toBeChecked());

  const earlyToggle = screen.getByTestId("quick-log-early-stage-toggle") as HTMLButtonElement;
  fireEvent.click(earlyToggle);
  const milestone = screen.getByTestId(
    "quick-log-early-stage-milestone-taproot_visible",
  ) as HTMLButtonElement;
  const alternateMilestone = screen.getByTestId(
    "quick-log-early-stage-milestone-first_true_leaves",
  ) as HTMLButtonElement;
  const vigor = screen.getByTestId("quick-log-early-stage-vigor-strong") as HTMLButtonElement;
  const alternateVigor = screen.getByTestId(
    "quick-log-early-stage-vigor-weak",
  ) as HTMLButtonElement;
  const earlyNotes = screen.getByTestId("quick-log-early-stage-notes") as HTMLInputElement;
  fireEvent.click(milestone);
  fireEvent.click(vigor);
  fireEvent.change(earlyNotes, { target: { value: "Original seedling note" } });

  const phenoStructure = await screen.findByTestId("quick-log-pheno-evidence-goal-structure");
  const phenoAroma = screen.getByTestId("quick-log-pheno-evidence-goal-aroma");
  fireEvent.click(phenoStructure);

  const more = screen.getByRole("switch", { name: /add more details/i });
  fireEvent.click(more);
  const detailsEc = screen.getByTestId("quicklog-details-ec-value") as HTMLInputElement;
  const watering = screen.getByTestId("quicklog-watering-ml") as HTMLInputElement;
  fireEvent.change(detailsEc, { target: { value: "1.4" } });
  fireEvent.change(watering, { target: { value: "250" } });
  const nutrients = screen.getByText("Nutrients").parentElement?.querySelector("input");
  const training = screen.getByPlaceholderText("LST, defoliation…") as HTMLInputElement;
  if (!(nutrients instanceof HTMLInputElement)) throw new Error("Nutrients input missing");
  fireEvent.change(nutrients, { target: { value: "Original nutrients" } });
  fireEvent.change(training, { target: { value: "Original training" } });

  const hardwareToggle = screen.getByTestId("quicklog-hardware-toggle") as HTMLButtonElement;
  fireEvent.click(hardwareToggle);
  const hardwareInputs = within(screen.getByTestId("quicklog-hardware-readings")).getAllByRole(
    "textbox",
  ) as HTMLInputElement[];
  ["6.2", "1.5", "6.0", "1.7", "650", "45"].forEach((value, index) => {
    fireEvent.change(hardwareInputs[index], { target: { value } });
  });

  return {
    note,
    snapshot,
    earlyToggle,
    milestone,
    alternateMilestone,
    vigor,
    alternateVigor,
    earlyNotes,
    phenoStructure: phenoStructure as HTMLButtonElement,
    phenoAroma: phenoAroma as HTMLButtonElement,
    more: more as HTMLButtonElement,
    detailsEc,
    watering,
    nutrients,
    training,
    hardwareToggle,
    hardwareInputs,
  };
}

function attemptEveryVisibleObservationMutation(
  draft: Awaited<ReturnType<typeof prepareObservationMainDraft>>,
) {
  fireEvent.click(draft.snapshot);
  fireEvent.click(screen.getByTestId("quick-log-chip-watered"));
  fireEvent.click(screen.getByTestId("quick-log-chip-better"));
  fireEvent.focus(draft.note);
  fireEvent.change(draft.note, { target: { value: "Blocked change value" } });
  fireEvent.input(draft.note, { target: { value: "Blocked input value" } });
  fireEvent.compositionEnd(draft.note, { target: { value: "Blocked composition value" } });
  draft.note.value = "Blocked blur value";
  fireEvent.blur(draft.note);
  fireEvent.click(draft.phenoAroma);
  fireEvent.click(draft.earlyToggle);
  fireEvent.click(draft.alternateMilestone);
  fireEvent.click(draft.alternateVigor);
  fireEvent.change(draft.earlyNotes, { target: { value: "Blocked seedling note" } });
  fireEvent.click(draft.more);
  fireEvent.change(draft.detailsEc, { target: { value: "9.9" } });
  fireEvent.change(draft.watering, { target: { value: "999" } });
  fireEvent.change(draft.nutrients, { target: { value: "Blocked nutrients" } });
  fireEvent.change(draft.training, { target: { value: "Blocked training" } });
  fireEvent.click(draft.hardwareToggle);
  ["9.1", "9.2", "9.3", "9.4", "999", "999"].forEach((value, index) => {
    fireEvent.change(draft.hardwareInputs[index], { target: { value } });
  });
}

function expectObservationDraftUnchanged(
  draft: Awaited<ReturnType<typeof prepareObservationMainDraft>>,
) {
  expect(draft.snapshot).toBeChecked();
  expect(draft.note).toHaveValue("Original main observation");
  expect(draft.phenoStructure).toHaveAttribute("aria-checked", "true");
  expect(draft.phenoAroma).toHaveAttribute("aria-checked", "false");
  expect(draft.milestone).toHaveAttribute("aria-checked", "true");
  expect(draft.alternateMilestone).toHaveAttribute("aria-checked", "false");
  expect(draft.vigor).toHaveAttribute("aria-checked", "true");
  expect(draft.alternateVigor).toHaveAttribute("aria-checked", "false");
  expect(draft.earlyNotes).toHaveValue("Original seedling note");
  expect(draft.more).toBeChecked();
  expect(draft.detailsEc).toHaveValue("1.4");
  expect(draft.watering).toHaveValue("250");
  expect(draft.nutrients).toHaveValue("Original nutrients");
  expect(draft.training).toHaveValue("Original training");
  expect(screen.getByTestId("quicklog-hardware-readings")).toHaveAttribute("data-open", "true");
  ["6.2", "1.5", "6.0", "1.7", "650", "45"].forEach((value, index) => {
    expect(draft.hardwareInputs[index]).toHaveValue(value);
  });
}

beforeEach(() => {
  clearLocalStorageForTest();
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
  harness.sensorStatus = "ready";
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
        p_target_type: "plant",
        p_target_id: "p1",
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
    expect(harness.rpc.mock.calls[0][1]).toEqual(
      expect.objectContaining({ p_target_type: "plant", p_target_id: "p1" }),
    );

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

  it("freezes every visible observation draft mutation during a main save and releases after success", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog();
    const draft = await prepareObservationMainDraft();

    act(() => {
      submitForm(mainForm());
      attemptEveryVisibleObservationMutation(draft);
    });

    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    const capturedPayload = JSON.parse(JSON.stringify(harness.rpc.mock.calls[0][1]));
    expectMainDraftSemanticallyLocked(true);
    expectObservationDraftUnchanged(draft);
    expect(capturedPayload).toEqual(
      expect.objectContaining({
        p_target_id: "p1",
        p_action: "note",
        p_details: expect.objectContaining({
          evidence_goal: "structure",
          early_stage: expect.objectContaining({
            early_stage_milestone: "taproot_visible",
            vigor: "strong",
            notes: "Original seedling note",
          }),
        }),
      }),
    );
    expect(JSON.stringify(capturedPayload)).not.toMatch(/Blocked|999|9\.[1-9]/);

    await act(async () => {
      pending.resolve({ data: { ok: true, grow_event_id: "main-event" }, error: null });
      await pending.promise;
    });

    await waitFor(() => expectMainDraftSemanticallyLocked(false));
    expectObservationDraftUnchanged(draft);
    expect(harness.rpc.mock.calls[0][1]).toEqual(capturedPayload);
  });

  it("freezes the main observation draft during a child save and releases it unchanged after failure", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog();
    const draft = await prepareObservationMainDraft();
    const childSave = await prepareChildNote();

    act(() => {
      childSave.click();
      attemptEveryVisibleObservationMutation(draft);
    });

    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    expectMainDraftSemanticallyLocked(true);
    expectObservationDraftUnchanged(draft);

    await act(async () => {
      pending.resolve({ data: null, error: { message: "offline" } });
      await pending.promise;
    });

    expect(await screen.findByTestId("quick-log-dialog-all-activities-error")).toHaveTextContent(
      /save failed/i,
    );
    await waitFor(() => expectMainDraftSemanticallyLocked(false));
    expectObservationDraftUnchanged(draft);
  });

  it("freezes Environment Check fields and its Radix unit handler in the main-save tick", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1", eventType: "environment" });
    const note = screen.getByTestId("quicklog-note") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Original environment check" } });
    const section = await screen.findByTestId("quick-log-environment-check-section");
    const room = within(section).getByTestId("quick-log-env-room-temp-f") as HTMLInputElement;
    const humidity = within(section).getByTestId("quick-log-env-humidity") as HTMLInputElement;
    const vpd = within(section).getByTestId("quick-log-env-vpd") as HTMLInputElement;
    const ec = within(section).getByTestId("quick-log-env-ec") as HTMLInputElement;
    const water = within(section).getByTestId("quick-log-env-water-temp") as HTMLInputElement;
    const unit = within(section).getByTestId("quick-log-env-water-temp-unit");
    const environmentFields: Array<[HTMLInputElement, string]> = [
      [room, "76"],
      [humidity, "55"],
      [vpd, "1.1"],
      [ec, "1.4"],
      [water, "68"],
    ];
    environmentFields.forEach(([control, value]) =>
      fireEvent.change(control, { target: { value } }),
    );
    unit.focus();
    fireEvent.keyDown(unit, { key: "ArrowDown", code: "ArrowDown" });
    const celsius = screen.getByRole("option", { name: "°C" });

    act(() => {
      submitForm(mainForm());
      fireEvent.change(room, { target: { value: "90" } });
      fireEvent.change(humidity, { target: { value: "90" } });
      fireEvent.change(vpd, { target: { value: "3" } });
      fireEvent.change(ec, { target: { value: "9" } });
      fireEvent.change(water, { target: { value: "30" } });
      fireEvent.click(celsius);
    });

    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    const capturedPayload = JSON.parse(JSON.stringify(harness.rpc.mock.calls[0][1]));
    expectMainDraftSemanticallyLocked(true);
    expect(room).toHaveValue("76");
    expect(humidity).toHaveValue("55");
    expect(vpd).toHaveValue("1.1");
    expect(ec).toHaveValue("1.4");
    expect(water).toHaveValue("68");
    expect(unit).toHaveTextContent("°F");
    expect(capturedPayload).toEqual(
      expect.objectContaining({
        p_details: expect.objectContaining({
          environment_check: expect.objectContaining({
            room_temp_f: 76,
            humidity_pct: 55,
            vpd_kpa: 1.1,
            water_temp_f: 68,
            water_temp_c: 20,
            ec_mscm: 1.4,
          }),
        }),
      }),
    );

    await act(async () => {
      pending.resolve({ data: null, error: { message: "offline" } });
      await pending.promise;
    });

    await screen.findByTestId("quick-log-save-error");
    await waitFor(() => expectMainDraftSemanticallyLocked(false));
    expect(room).toHaveValue("76");
    expect(humidity).toHaveValue("55");
    expect(vpd).toHaveValue("1.1");
    expect(ec).toHaveValue("1.4");
    expect(water).toHaveValue("68");
    expect(unit).toHaveTextContent("°F");
    expect(harness.rpc.mock.calls[0][1]).toEqual(capturedPayload);
  });

  it("freezes the optional EC Radix unit handler in the main-save tick", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog();
    prepareMainNote();
    fireEvent.click(screen.getByRole("switch", { name: /add more details/i }));
    const unit = screen.getByTestId("quicklog-details-ec-unit");
    unit.focus();
    fireEvent.keyDown(unit, { key: "ArrowDown", code: "ArrowDown" });
    const microsiemens = screen.getByRole("option", { name: "EC µS/cm" });

    act(() => {
      submitForm(mainForm());
      fireEvent.click(microsiemens);
    });

    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    expectMainDraftSemanticallyLocked(true);
    expect(unit).toHaveTextContent("EC mS/cm");

    await act(async () => {
      pending.resolve({ data: { ok: true, grow_event_id: "main-event" }, error: null });
      await pending.promise;
    });
    await waitFor(() => expectMainDraftSemanticallyLocked(false));
    expect(unit).toHaveTextContent("EC mS/cm");
  });

  it("freezes the Reminder draft during the child-owned shared lock and restores it after failure", async () => {
    const pending = deferredRpc();
    harness.rpc.mockReturnValue(pending.promise);
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1", eventType: "reminder" });
    const reminder = await waitFor(() => {
      const control = mainForm().querySelector<HTMLInputElement>('input[type="datetime-local"]');
      expect(control).not.toBeNull();
      return control!;
    });
    fireEvent.change(reminder, { target: { value: "2026-07-20T09:30" } });
    const childSave = await prepareChildNote();

    act(() => {
      childSave.click();
      fireEvent.change(reminder, { target: { value: "2026-07-21T10:45" } });
    });

    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    expectMainDraftSemanticallyLocked(true);
    expect(reminder).toHaveValue("2026-07-20T09:30");

    await act(async () => {
      pending.resolve({ data: null, error: { message: "offline" } });
      await pending.promise;
    });

    await screen.findByTestId("quick-log-dialog-all-activities-error");
    await waitFor(() => expectMainDraftSemanticallyLocked(false));
    expect(reminder).toHaveValue("2026-07-20T09:30");
  });
});
