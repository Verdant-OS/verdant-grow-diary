import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import {
  clearTemperatureUnitPreference,
  saveTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

// This integration-heavy sheet suite mounts the full Quick Log editor.
// Keep its assertions strict while allowing for controlled-runner contention.
vi.setConfig({ testTimeout: 15_000 });

const rpcMock = vi.fn();
const wateringWriterMock = vi.fn();
const storageUpload = vi.fn();
const storageRemove = vi.fn();
const diaryInsert = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const videoValidationMock = vi.fn();
const RECENT_TARGET_KEY = "verdant.quickLog.lastTarget.v2.user-1";
const authState = vi.hoisted(() => ({ ownerId: "user-1" }));
const plantContextState = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  data: [
    {
      id: "plant-1",
      name: "Plant 1",
      strain: "Oreoz",
      tent_id: "tent-1",
      grow_id: "grow-1",
      stage: "flowering",
      medium: "coco coir",
      pot_size: "5 gal",
    },
  ],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: () => ({ upload: storageUpload, remove: storageRemove }),
    },
    from: () => ({ insert: diaryInsert }),
  },
}));

vi.mock("@/lib/writeQuickLogWateringTypedEvent", () => ({
  writeQuickLogWateringTypedEvent: (...args: unknown[]) => wateringWriterMock(...args),
}));

vi.mock("@/lib/videoAttachmentRules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/videoAttachmentRules")>(
    "@/lib/videoAttachmentRules",
  );
  return {
    ...actual,
    createBrowserVideoDurationProber: () => vi.fn(),
    validateVideoAttachment: (...args: unknown[]) => videoValidationMock(...args),
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: authState.ownerId } }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => plantContextState,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1", stage: "vegetative" }],
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Home Run", stage: "seedling" }] }),
}));

vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));

vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    message: vi.fn(),
  },
}));

function renderSheet(
  defaultTargetKey = "plant:plant-1",
  defaultAction?: "note" | "water" | "feed",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onOpenChange = vi.fn();
  const renderTree = (open: boolean, targetKey = defaultTargetKey) => (
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet
        open={open}
        onOpenChange={onOpenChange}
        defaultTargetKey={targetKey}
        defaultAction={defaultAction}
      />
    </QueryClientProvider>
  );
  const view = render(renderTree(true));
  return {
    onOpenChange,
    unmount: view.unmount,
    rerenderOpen: (open: boolean, targetKey = defaultTargetKey) =>
      view.rerender(renderTree(open, targetKey)),
  };
}

function clickWater() {
  fireEvent.click(screen.getByRole("button", { name: "Water" }));
}

function enterVolume(value = "500") {
  fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value } });
}

function clickSave() {
  fireEvent.click(screen.getByTestId("qlv2-save"));
}

const originalLocks = Object.getOwnPropertyDescriptor(window.navigator, "locks");
beforeEach(() => {
  authState.ownerId = "user-1";
  window.sessionStorage.clear();
  clearLocalStorageForTest();
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, _options: unknown, callback: () => unknown) => {
        const turn = tail.then(callback);
        tail = turn.then(
          () => undefined,
          () => undefined,
        );
        return turn;
      },
    },
  });
  clearTemperatureUnitPreference();
  rpcMock.mockReset();
  wateringWriterMock.mockReset();
  storageUpload.mockReset();
  storageRemove.mockReset();
  diaryInsert.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  videoValidationMock.mockReset();
  videoValidationMock.mockResolvedValue({
    ok: true,
    mime: "video/mp4",
    sizeBytes: 1,
    durationS: 10,
  });
  plantContextState.isLoading = false;
  plantContextState.isError = false;
  plantContextState.data.splice(1);
  wateringWriterMock.mockResolvedValue({ ok: true, eventId: "water-event-1", reused: false });
  storageUpload.mockResolvedValue({ data: { path: "saved.jpg" }, error: null });
  storageRemove.mockResolvedValue({ data: null, error: null });
  diaryInsert.mockResolvedValue({ data: null, error: null });
  if (typeof URL.createObjectURL !== "function") {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:watering-photo"),
    });
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:watering-photo");
  }
});
afterEach(() => {
  if (originalLocks) Object.defineProperty(window.navigator, "locks", originalLocks);
  else Reflect.deleteProperty(window.navigator, "locks");
});

async function installAcceptedWaterLedger(loseFirstReply = true) {
  const actualWriter = await vi.importActual<
    typeof import("@/lib/writeQuickLogWateringTypedEvent")
  >("@/lib/writeQuickLogWateringTypedEvent");
  const committed = new Map<string, string>();
  let replyLost = false;
  rpcMock.mockImplementation(async (name, args) => {
    expect(name).toBe("quicklog_save_event");
    const previousId = committed.get(args.p_idempotency_key);
    if (previousId) {
      return { data: { ok: true, grow_event_id: previousId, reused: true }, error: null };
    }
    const eventId = `00000000-0000-4000-8000-${String(committed.size + 1).padStart(12, "0")}`;
    committed.set(args.p_idempotency_key, eventId);
    if (loseFirstReply && !replyLost) {
      replyLost = true;
      return { data: null, error: { message: "simulated reply loss after acceptance" } };
    }
    return { data: { ok: true, grow_event_id: eventId, reused: false }, error: null };
  });
  wateringWriterMock.mockImplementation((input) =>
    actualWriter.writeQuickLogWateringTypedEvent(input),
  );
  return committed;
}

async function saveWaterWithLostReply() {
  enterVolume("750");
  fireEvent.change(screen.getByLabelText("Note (optional)"), {
    target: { value: "Original plant watering evidence" },
  });
  clickSave();
  await waitFor(() => expect(screen.getByTestId("qlv2-watering-retry-lock")).toBeVisible());
  expect(screen.queryByTestId("qlv2-post-save")).toBeNull();
  return { ...rpcMock.mock.calls[0][1] };
}

function addSecondPlant() {
  plantContextState.data.push({
    ...plantContextState.data[0],
    id: "plant-2",
    name: "Plant 2",
  });
}

async function expectOriginalWaterAndRetry(original: Record<string, unknown>) {
  await waitFor(() => expect(screen.getByTestId("qlv2-watering-retry-lock")).toBeVisible());
  expect(screen.getByLabelText("Volume (ml)")).toHaveValue("750");
  expect(screen.getByLabelText("Volume (ml)")).toBeDisabled();
  expect(screen.getByLabelText("Note (optional)")).toHaveValue("Original plant watering evidence");
  expect(screen.getByLabelText("Choose plant or tent for this Quick Log")).toHaveTextContent(
    "Plant · Plant 1",
  );
  expect(screen.getByLabelText("Choose plant or tent for this Quick Log")).toBeDisabled();
  expect(rpcMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByTestId("qlv2-save-retry"));
  await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
  expect(rpcMock.mock.calls[1][1]).toEqual(original);
}

describe("QuickLogV2Sheet — uncertain Water recovery", () => {
  it("does not fence the next Watering when another tab cleared the confirmed record", async () => {
    wateringWriterMock.mockImplementation(async () => {
      removeLocalStorageItemForTest("verdant:quick-log:pending-watering:v1:user-1");
      return { ok: true, eventId: "water-event-1", reused: true };
    });
    renderSheet("plant:plant-1", "water");
    enterVolume("750");
    clickSave();
    await screen.findByTestId("qlv2-post-save");
    expect(screen.queryByText(/couldn’t finish preparing the next Watering/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Log another/i })).toBeEnabled();
  });

  it("retains an accepted Water record across Close and reopen instead of starting another save", async () => {
    const committed = await installAcceptedWaterLedger();
    const view = renderSheet("plant:plant-1", "water");
    const original = await saveWaterWithLostReply();
    expect(committed.size).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(view.onOpenChange).toHaveBeenCalledWith(false);
    view.rerenderOpen(false);
    view.rerenderOpen(true);
    await expectOriginalWaterAndRetry(original);
    expect(committed.size).toBe(1);
  });

  it("restores the same owner's accepted Water after full unmount and clears only after confirmation", async () => {
    const committed = await installAcceptedWaterLedger();
    const first = renderSheet("plant:plant-1", "water");
    const original = await saveWaterWithLostReply();
    first.unmount();

    const restored = renderSheet("plant:plant-1", "note");
    await expectOriginalWaterAndRetry(original);
    expect(committed.size).toBe(1);
    restored.unmount();

    renderSheet("plant:plant-1", "water");
    expect(screen.queryByTestId("qlv2-watering-retry-lock")).toBeNull();
    expect(screen.getByLabelText("Volume (ml)")).toHaveValue("");
    enterVolume("500");
    clickSave();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(3));
    expect(rpcMock.mock.calls[2][1].p_idempotency_key).not.toBe(original.p_idempotency_key);
    expect(committed.size).toBe(2);
  });

  it.each(["while open", "across close/reopen"] as const)(
    "keeps the original plant when parent targeting changes %s during uncertain Water",
    async (boundary) => {
      addSecondPlant();
      const committed = await installAcceptedWaterLedger();
      const view = renderSheet("plant:plant-1", "water");
      const original = await saveWaterWithLostReply();
      if (boundary === "across close/reopen") view.rerenderOpen(false);
      view.rerenderOpen(true, "plant:plant-2");
      await expectOriginalWaterAndRetry(original);
      expect(rpcMock.mock.calls[1][1].p_plant_id).toBe("plant-1");
      expect(committed.size).toBe(1);
    },
  );

  it("keeps A's uncertain Water private while B is active and restores it only when A returns", async () => {
    addSecondPlant();
    const committed = await installAcceptedWaterLedger();
    const first = renderSheet("plant:plant-1", "water");
    const original = await saveWaterWithLostReply();
    first.unmount();

    authState.ownerId = "user-2";
    const other = renderSheet("plant:plant-2", "water");
    expect(screen.queryByTestId("qlv2-watering-retry-lock")).toBeNull();
    expect(screen.getByLabelText("Volume (ml)")).toHaveValue("");
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Choose plant or tent for this Quick Log")).toHaveTextContent(
      "Plant · Plant 2",
    );
    expect(rpcMock).toHaveBeenCalledTimes(1);
    other.unmount();

    authState.ownerId = "user-1";
    renderSheet("plant:plant-2", "note");
    await expectOriginalWaterAndRetry(original);
    expect(committed.size).toBe(1);
  });

  it("does not replace a corrupt pending Water record or send a new save", async () => {
    window.sessionStorage.setItem("verdant:quick-log:pending-watering:v1:user-1", "invalid-json");
    renderSheet("plant:plant-1", "water");
    enterVolume("750");
    clickSave();
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/recovery storage.*unavailable/i),
    );
    expect(wateringWriterMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("verdant:quick-log:pending-watering:v1:user-1")).toBe(
      "invalid-json",
    );
  });

  it("does not dispatch Water when shared recovery storage cannot retain the operation", async () => {
    const committed = await installAcceptedWaterLedger();
    renderSheet("plant:plant-1", "water");
    enterVolume("750");
    const originalSetItem = Storage.prototype.setItem;
    const blockedStorage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === window.localStorage) throw new Error("simulated shared storage denial");
      return originalSetItem.call(this, key, value);
    });
    try {
      clickSave();
      await waitFor(() => expect(screen.getByTestId("qlv2-error")).toBeVisible());
      expect(wateringWriterMock).not.toHaveBeenCalled();
      expect(rpcMock).not.toHaveBeenCalled();
      expect(committed.size).toBe(0);
      expect(screen.queryByTestId("qlv2-post-save")).toBeNull();
    } finally {
      blockedStorage.mockRestore();
    }
  });

  it("keeps a confirmed Water visible while storage cleanup blocks the next entry, without resending", async () => {
    const committed = await installAcceptedWaterLedger(false);
    renderSheet("plant:plant-1", "water");
    enterVolume("750");
    const originalRemove = Storage.prototype.removeItem;
    const blockedRemoval = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (this === window.localStorage) throw new Error("cleanup unavailable");
      originalRemove.call(this, key);
    });
    try {
      clickSave();
      await screen.findByTestId("qlv2-post-save");
      expect(screen.getByTestId("quick-log-post-save-another")).toBeDisabled();
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/saved.*next Watering/i);
      expect(rpcMock).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByTestId("qlv2-note-storage-recheck"));
      expect(screen.getByTestId("quick-log-post-save-another")).toBeDisabled();
      expect(rpcMock).toHaveBeenCalledTimes(1);
      blockedRemoval.mockRestore();
      fireEvent.click(screen.getByTestId("qlv2-note-storage-recheck"));
      await waitFor(() => expect(screen.getByTestId("quick-log-post-save-another")).toBeEnabled());
      expect(rpcMock).toHaveBeenCalledTimes(1);
      expect(committed.size).toBe(1);
    } finally {
      blockedRemoval.mockRestore();
    }
  });

  it.each(["another owner", "the original owner after a round trip"] as const)(
    "does not resume a held Water photo upload into %s's session",
    async (boundary) => {
      addSecondPlant();
      const committed = await installAcceptedWaterLedger(false);
      let finishUpload!: (value: { data: { path: string }; error: null }) => void;
      storageUpload.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishUpload = resolve;
          }),
      );
      const first = renderSheet("plant:plant-1", "water");
      enterVolume("750");
      fireEvent.change(screen.getByTestId("qlv2-photo-library-input"), {
        target: {
          files: [new File([new Uint8Array([1])], "original.jpg", { type: "image/jpeg" })],
        },
      });
      clickSave();
      await waitFor(() => expect(storageUpload).toHaveBeenCalledTimes(1));
      expect(rpcMock).not.toHaveBeenCalled();
      first.unmount();

      authState.ownerId = "user-2";
      const other = renderSheet("plant:plant-2", "water");
      if (boundary === "the original owner after a round trip") {
        other.unmount();
        authState.ownerId = "user-1";
        renderSheet("plant:plant-2", "note");
      }
      await act(async () => {
        finishUpload({ data: { path: "user-1/grow-1/original.jpg" }, error: null });
      });
      expect(wateringWriterMock).not.toHaveBeenCalled();
      expect(rpcMock).not.toHaveBeenCalled();
      expect(diaryInsert).not.toHaveBeenCalled();
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(toastError).not.toHaveBeenCalled();
      expect(committed.size).toBe(0);
      expect(screen.queryByTestId("qlv2-post-save")).toBeNull();
    },
  );
});

describe("QuickLogV2Sheet — structured watering", () => {
  it("opens directly on Water with the exact default target and fails closed for a stale target", () => {
    const valid = renderSheet("plant:plant-1", "water");
    expect(screen.getByTestId("qlv2-watering-form")).toBeInTheDocument();
    expect(screen.getByLabelText("Choose plant or tent for this Quick Log")).toHaveTextContent(
      "Plant · Plant 1",
    );
    expect(screen.getByTestId("qlv2-target-panel")).toHaveAttribute("data-scope", "plant");
    valid.unmount();

    renderSheet("plant:stale-plant", "water");
    expect(screen.getByTestId("qlv2-watering-form")).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-save")).toBeDisabled();
    expect(screen.queryByTestId("qlv2-target-panel")).not.toBeInTheDocument();
  });

  it("shows the Water form only for Water and preserves the volume-only fast path", async () => {
    renderSheet();
    expect(screen.queryByTestId("qlv2-watering-form")).toBeNull();
    clickWater();
    expect(screen.getByTestId("qlv2-watering-form")).toBeInTheDocument();
    enterVolume();
    clickSave();
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
    expect(wateringWriterMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        volume_ml: 500,
      }),
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("shows plant stage, medium, and pot size as read-only context", () => {
    renderSheet();
    clickWater();
    expect(screen.getByTestId("qlv2-watering-context-stage").textContent).toMatch(
      /Flowering.*Plant record/i,
    );
    expect(screen.getByTestId("qlv2-watering-context-medium").textContent).toMatch(
      /Coco Coir.*Plant record/i,
    );
    expect(screen.getByTestId("qlv2-watering-context-pot-size").textContent).toMatch(
      /5 Gal.*Plant record/i,
    );
  });

  it("maps root-zone measurements, EC/PPM, manual observations, note, and manual air evidence", async () => {
    // This test types raw values expecting celsius passthrough into the
    // saved payload — pin the display unit explicitly rather than ride
    // whatever the global default happens to be.
    saveTemperatureUnitPreference("celsius");
    renderSheet();
    clickWater();
    enterVolume("750");
    fireEvent.change(screen.getByLabelText("Input pH"), { target: { value: "6.1" } });
    fireEvent.change(screen.getByLabelText("Input PPM (500 scale)"), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText("Runoff (ml)"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Runoff pH"), { target: { value: "6.4" } });
    fireEvent.change(screen.getByLabelText("Runoff EC"), { target: { value: "2.3" } });
    fireEvent.change(screen.getByLabelText("Water temperature (°C)"), {
      target: { value: "21" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    fireEvent.click(screen.getByRole("button", { name: "Dry" }));
    fireEvent.click(screen.getByRole("button", { name: "Normal" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Lower leaves held posture after watering." },
    });
    fireEvent.change(screen.getByLabelText("Temp (°C)"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("RH (%)"), { target: { value: "58" } });
    fireEvent.change(screen.getByLabelText("VPD (kPa)"), { target: { value: "1.2" } });

    clickSave();
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
    const payload = wateringWriterMock.mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({
        volume_ml: 750,
        ph: 6.1,
        ec_ms_cm: 2,
        runoff_ml: 150,
        runoff_ph: 6.4,
        runoff_ec: 2.3,
        water_temp_c: 21,
        note: "Lower leaves held posture after watering.",
      }),
    );
    expect(payload).not.toHaveProperty("ppm");
    expect(payload).not.toHaveProperty("runoff_ppm");
    expect(payload.sensor_snapshot).toEqual({
      source: "manual",
      captured_at: payload.occurred_at,
      metrics: { temperature_c: 25, humidity_pct: 58, vpd_kpa: 1.2 },
    });
    expect(payload.details.root_zone_manual_observation_v1).toEqual({
      schema_version: 1,
      source: "manual",
      evidence_type: "root_zone_manual_observation",
      advisory_only: true,
      observed_at: payload.occurred_at,
      pot_weight_feel: "light",
      medium_surface: "dry",
      drainage: "normal",
    });
  });

  it("shows a visible confirmation, refresh event, and post-save controls", async () => {
    const created: Array<Record<string, unknown>> = [];
    const listener = (event: Event) =>
      created.push((event as CustomEvent<Record<string, unknown>>).detail);
    window.addEventListener("verdant:entry-created", listener);
    const { onOpenChange } = renderSheet();
    clickWater();
    enterVolume();
    clickSave();

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Watering logged.", expect.anything()),
    );
    expect(await screen.findByTestId("qlv2-post-save")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(created).toEqual([
      expect.objectContaining({
        growEventId: "water-event-1",
        source: "quick_log_v2_water",
      }),
    ]);
    window.removeEventListener("verdant:entry-created", listener);
  });

  it("remembers the confirmed plant after structured Water succeeds", async () => {
    renderSheet("plant:plant-1", "water");
    enterVolume();
    clickSave();

    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getLocalStorageItemForTest(RECENT_TARGET_KEY)).not.toBeNull());

    const stored = JSON.parse(getLocalStorageItemForTest(RECENT_TARGET_KEY) ?? "null") as Record<
      string,
      unknown
    >;
    expect(stored).toEqual({
      plantId: "plant-1",
      growId: "grow-1",
      tentId: "tent-1",
      savedAt: expect.any(String),
    });
    expect(Number.isFinite(Date.parse(String(stored.savedAt)))).toBe(true);
  });

  it("remembers the confirmed plant after a V2 Note succeeds", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        grow_event_id: "77777777-7777-4777-8777-000000000001",
        environment_event_id: null,
      },
      error: null,
    });
    renderSheet("plant:plant-1", "note");
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Checked leaf posture." },
    });
    clickSave();

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getLocalStorageItemForTest(RECENT_TARGET_KEY)).not.toBeNull());

    expect(JSON.parse(getLocalStorageItemForTest(RECENT_TARGET_KEY) ?? "null")).toEqual({
      plantId: "plant-1",
      growId: "grow-1",
      tentId: "tent-1",
      savedAt: expect.any(String),
    });
  });

  it("does not refresh the remembered target when structured Water fails", async () => {
    const previous = JSON.stringify({
      plantId: "plant-previous",
      growId: "grow-previous",
      tentId: "tent-previous",
      savedAt: "2026-08-19T12:00:00.000Z",
    });
    setLocalStorageItemForTest(RECENT_TARGET_KEY, previous);
    wateringWriterMock.mockResolvedValueOnce({ ok: false, reason: "rpc:error" });
    renderSheet("plant:plant-1", "water");
    enterVolume();
    clickSave();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(getLocalStorageItemForTest(RECENT_TARGET_KEY)).toBe(previous);
  });

  it("does not invent a remembered plant after a tent-scoped Water succeeds", async () => {
    renderSheet("tent:tent-1", "water");
    enterVolume();
    clickSave();

    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
    expect(wateringWriterMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: null,
      }),
    );
    expect(getLocalStorageItemForTest(RECENT_TARGET_KEY)).toBeNull();
  });

  it("freezes and retries the exact logical payload after an uncertain write", async () => {
    wateringWriterMock
      .mockResolvedValueOnce({ ok: false, reason: "rpc:error" })
      .mockResolvedValueOnce({ ok: true, eventId: "water-event-retry", reused: true });
    const { onOpenChange } = renderSheet();
    clickWater();
    enterVolume();
    clickSave();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const firstPayload = wateringWriterMock.mock.calls[0][0];
    const firstKey = firstPayload.idempotency_key;
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByTestId("qlv2-watering-retry-lock")).toHaveTextContent(
      /exact same target, timestamp, measurements and note/i,
    );
    expect(screen.getByTestId("qlv2-watering-retry-lock")).not.toHaveTextContent(
      /close and reopen Quick Log to make changes/i,
    );
    expect(screen.getByLabelText("Volume (ml)")).toBeDisabled();
    expect(screen.getByLabelText("Choose plant or tent for this Quick Log")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Note" })).toBeDisabled();

    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(2));
    expect(wateringWriterMock.mock.calls[1][0].idempotency_key).toBe(firstKey);
    expect(wateringWriterMock.mock.calls[1][0]).toBe(firstPayload);
    expect(wateringWriterMock.mock.calls[1][0]).toEqual(firstPayload);
  });

  it("keeps the exact retry available if target context refetch fails", async () => {
    wateringWriterMock
      .mockResolvedValueOnce({ ok: false, reason: "rpc:error" })
      .mockResolvedValueOnce({ ok: true, eventId: "water-event-context-retry", reused: true });
    const { rerenderOpen } = renderSheet();
    clickWater();
    enterVolume("500");
    clickSave();
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("qlv2-watering-retry-lock")).toBeVisible());
    const firstPayload = wateringWriterMock.mock.calls[0][0];

    plantContextState.isError = true;
    rerenderOpen(true);

    expect(screen.getByTestId("qlv2-save-retry")).toBeEnabled();
    expect(screen.getByTestId("qlv2-save")).toBeEnabled();
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));

    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(2));
    expect(wateringWriterMock.mock.calls[1][0]).toBe(firstPayload);
    expect(wateringWriterMock.mock.calls[1][0].idempotency_key).toBe(firstPayload.idempotency_key);
  });

  it("locks the first in-flight Water attempt before upload/RPC and retries its exact media", async () => {
    let settleFirst: ((value: { ok: false; reason: "rpc:error" }) => void) | null = null;
    wateringWriterMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settleFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ ok: true, eventId: "water-event-locked-retry", reused: true });

    renderSheet();
    clickWater();
    enterVolume("500");
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Original watering evidence" },
    });
    const originalPhoto = new File([new Uint8Array([1])], "original.jpg", {
      type: "image/jpeg",
    });
    const replacementPhoto = new File([new Uint8Array([2])], "replacement.jpg", {
      type: "image/jpeg",
    });
    const input = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [originalPhoto] } });

    clickSave();
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
    const firstPayload = wateringWriterMock.mock.calls[0][0];

    expect(screen.getByRole("button", { name: "Feed" })).toBeDisabled();
    expect(screen.getByLabelText("Volume (ml)")).toBeDisabled();
    expect(screen.getByLabelText("Note (optional)")).toBeDisabled();
    expect(screen.getByTestId("qlv2-photo-remove")).toBeDisabled();
    expect(screen.getByText("Cancel", { selector: "button" })).toBeDisabled();

    // Even programmatic DOM events cannot mutate the locked logical record.
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "900" } });
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Changed after save" },
    });
    fireEvent.change(input, { target: { files: [replacementPhoto] } });
    expect(screen.getByTestId("qlv2-watering-form")).toBeInTheDocument();
    expect((screen.getByLabelText("Volume (ml)") as HTMLInputElement).value).toBe("500");
    expect((screen.getByLabelText("Note (optional)") as HTMLTextAreaElement).value).toBe(
      "Original watering evidence",
    );

    await act(async () => {
      settleFirst?.({ ok: false, reason: "rpc:error" });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId("qlv2-watering-retry-lock")).toBeVisible());

    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(diaryInsert).toHaveBeenCalledTimes(1));

    expect(wateringWriterMock.mock.calls[1][0]).toBe(firstPayload);
    expect(storageUpload).toHaveBeenCalledTimes(2);
    expect(storageUpload.mock.calls[0][1]).toBe(originalPhoto);
    expect(storageUpload.mock.calls[1][1]).toBe(originalPhoto);
    expect(diaryInsert.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        note: "Original watering evidence",
        details: expect.objectContaining({ attached_to_action: "water" }),
      }),
    );
  });

  it("retains the uncertain Water key on reopen and rotates it only for Log another after confirmation", async () => {
    wateringWriterMock
      .mockResolvedValueOnce({ ok: false, reason: "rpc:error" })
      .mockResolvedValueOnce({ ok: true, eventId: "water-event-retry", reused: true })
      .mockResolvedValueOnce({ ok: true, eventId: "water-event-fresh", reused: false });
    const { rerenderOpen } = renderSheet("plant:plant-1", "water");
    enterVolume();
    clickSave();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const failedKey = wateringWriterMock.mock.calls[0][0].idempotency_key;

    rerenderOpen(false);
    rerenderOpen(true);
    expect(screen.getByLabelText("Volume (ml)")).toHaveValue("500");
    expect(screen.getByLabelText("Volume (ml)")).toBeDisabled();
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(2));
    expect(wateringWriterMock.mock.calls[1][0].idempotency_key).toBe(failedKey);
    expect(wateringWriterMock.mock.calls[1][0].volume_ml).toBe(500);
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    fireEvent.click(screen.getByTestId("quick-log-post-save-another"));
    clickWater();
    enterVolume("600");
    clickSave();
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(3));
    expect(wateringWriterMock.mock.calls[2][0].idempotency_key).not.toBe(failedKey);
    expect(wateringWriterMock.mock.calls[2][0].volume_ml).toBe(600);
  });

  it("rejects invalid root-zone measurements before the writer", async () => {
    renderSheet();
    clickWater();
    enterVolume();
    fireEvent.change(screen.getByLabelText("Input EC"), { target: { value: "not-a-number" } });
    clickSave();

    await waitFor(() => expect(screen.getByTestId("qlv2-error")).toBeInTheDocument());
    expect(wateringWriterMock).not.toHaveBeenCalled();
  });

  it("preserves the existing photo companion flow for Water", async () => {
    renderSheet();
    clickWater();
    enterVolume();
    const file = new File([new Uint8Array([1, 2, 3])], "roots.jpg", { type: "image/jpeg" });
    const input = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    clickSave();

    await waitFor(() => {
      expect(storageUpload).toHaveBeenCalledTimes(1);
      expect(wateringWriterMock).toHaveBeenCalledTimes(1);
      expect(diaryInsert).toHaveBeenCalledTimes(1);
    });
    expect(diaryInsert.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        details: expect.objectContaining({ attached_to_action: "water" }),
      }),
    );
  });

  it("surfaces a rejected pre-commit photo upload and releases the locked draft", async () => {
    storageUpload.mockRejectedValueOnce(new Error("transport reset"));
    renderSheet();
    clickWater();
    enterVolume("500");
    const photo = new File([new Uint8Array([1])], "roots.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("qlv2-photo-library-input"), {
      target: { files: [photo] },
    });

    clickSave();

    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/photo upload failed/i),
    );
    expect(wateringWriterMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-watering-retry-lock")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Volume (ml)")).toBeEnabled();
  });

  it("treats a rejected post-commit photo insert as partial success", async () => {
    diaryInsert.mockRejectedValueOnce(new Error("insert transport reset"));
    renderSheet();
    clickWater();
    enterVolume("500");
    const photo = new File([new Uint8Array([1])], "roots.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("qlv2-photo-library-input"), {
      target: { files: [photo] },
    });

    clickSave();

    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("qlv2-post-save")).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-error")).toHaveTextContent(
      /log saved.*attachment status uncertain/i,
    );
    expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/could not confirm/i);
    expect(screen.getByTestId("qlv2-error")).not.toHaveTextContent(/attachment failed/i);
    expect(screen.queryByTestId("qlv2-watering-retry-lock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("qlv2-save-retry")).not.toBeInTheDocument();
    expect(storageRemove).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("Watering logged.", expect.anything());
  });

  it("waits for a slow video check before locking and saving Water", async () => {
    let settleVideo:
      ((value: { ok: true; mime: string; sizeBytes: number; durationS: number }) => void) | null =
      null;
    videoValidationMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleVideo = resolve;
        }),
    );
    renderSheet();
    clickWater();
    enterVolume("500");
    const video = new File([new Uint8Array([1])], "roots.mp4", { type: "video/mp4" });

    fireEvent.change(screen.getByTestId("qlv2-video-input"), {
      target: { files: [video] },
    });

    expect(await screen.findByTestId("qlv2-video-checking")).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-save")).toBeDisabled();
    expect(wateringWriterMock).not.toHaveBeenCalled();

    await act(async () => {
      settleVideo?.({ ok: true, mime: "video/mp4", sizeBytes: 1, durationS: 10 });
      await Promise.resolve();
    });

    expect(await screen.findByTestId("qlv2-video-preview")).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-save")).toBeEnabled();
    clickSave();
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(diaryInsert).toHaveBeenCalledTimes(1));
    expect(storageUpload.mock.calls[0][1]).toBe(video);
  });

  it("ignores a stale video probe after close, reopen, and target change", async () => {
    let settleVideo:
      ((value: { ok: true; mime: string; sizeBytes: number; durationS: number }) => void) | null =
      null;
    videoValidationMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleVideo = resolve;
        }),
    );
    const { rerenderOpen } = renderSheet();
    clickWater();
    enterVolume("500");
    const staleVideo = new File([new Uint8Array([1])], "old-target.mp4", {
      type: "video/mp4",
    });
    fireEvent.change(screen.getByTestId("qlv2-video-input"), {
      target: { files: [staleVideo] },
    });
    expect(await screen.findByTestId("qlv2-video-checking")).toBeInTheDocument();

    rerenderOpen(false);
    rerenderOpen(true, "tent:tent-1");
    await act(async () => {
      settleVideo?.({ ok: true, mime: "video/mp4", sizeBytes: 1, durationS: 10 });
      await Promise.resolve();
    });

    expect(screen.queryByTestId("qlv2-video-checking")).not.toBeInTheDocument();
    expect(screen.queryByTestId("qlv2-video-preview")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Choose plant or tent for this Quick Log")).toHaveTextContent(
      "Tent 1",
    );
  });

  it("keeps video storage when its post-commit diary insert is ambiguous", async () => {
    diaryInsert.mockRejectedValueOnce(new Error("insert response lost"));
    renderSheet();
    clickWater();
    enterVolume("500");
    const video = new File([new Uint8Array([1])], "roots.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByTestId("qlv2-video-input"), {
      target: { files: [video] },
    });
    expect(await screen.findByTestId("qlv2-video-preview")).toBeInTheDocument();

    clickSave();

    expect(await screen.findByTestId("qlv2-post-save")).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-error")).toHaveTextContent(/could not confirm/i);
    expect(screen.getByTestId("qlv2-error")).not.toHaveTextContent(/attachment failed/i);
    expect(screen.queryByTestId("qlv2-save-retry")).not.toBeInTheDocument();
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it("clears Water-only measurements when the grower switches actions", () => {
    renderSheet();
    clickWater();
    enterVolume("900");
    fireEvent.change(screen.getByLabelText("Input EC"), { target: { value: "1.8" } });
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    clickWater();
    expect((screen.getByLabelText("Volume (ml)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Input EC") as HTMLInputElement).value).toBe("");
  });

  it("pins the manual sensor snapshot Temp draft to its entry unit through a live preference flip (Water save path)", async () => {
    saveTemperatureUnitPreference("celsius");
    renderSheet();
    clickWater();
    enterVolume("500");
    fireEvent.change(screen.getByLabelText("Temp (°C)"), { target: { value: "25" } });

    act(() => {
      saveTemperatureUnitPreference("fahrenheit");
    });

    clickSave();
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
    const payload = wateringWriterMock.mock.calls[0][0];
    expect(payload.sensor_snapshot.metrics.temperature_c).toBe(25);
  });

  it("pins the manual sensor snapshot Temp draft to its entry unit through a live preference flip (Note save path)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        grow_event_id: "77777777-7777-4777-8777-000000000002",
        environment_event_id: null,
      },
      error: null,
    });
    saveTemperatureUnitPreference("celsius");
    renderSheet(); // defaults to action "note"
    fireEvent.change(screen.getByLabelText("Temp (°C)"), { target: { value: "25" } });

    act(() => {
      saveTemperatureUnitPreference("fahrenheit");
    });

    clickSave();
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    const [, payload] = rpcMock.mock.calls[0] as [string, { p_temperature_c: number | null }];
    expect(payload.p_temperature_c).toBe(25);
  });

  it("keeps the manual sensor snapshot Temp label showing the pinned entry unit, not the live one, through a mid-draft preference flip", async () => {
    // Codex round-6 finding: the save payload was already correctly pinned
    // (see the two tests above), but the visible label still read the live
    // unit — a grower who typed 25 meaning 25°C would see the field relabel
    // itself to "(°F)" after a cross-tab flip even though 25°C is what gets
    // saved.
    saveTemperatureUnitPreference("celsius");
    renderSheet(); // defaults to action "note"
    fireEvent.change(screen.getByLabelText("Temp (°C)"), { target: { value: "25" } });

    act(() => {
      saveTemperatureUnitPreference("fahrenheit");
    });

    expect(screen.getByLabelText("Temp (°C)")).toBeTruthy();
    expect(screen.queryByLabelText("Temp (°F)")).toBeNull();
  });

  it("pins the Water temperature draft to its entry unit through a live preference flip", async () => {
    saveTemperatureUnitPreference("celsius");
    renderSheet();
    clickWater();
    enterVolume("500");
    fireEvent.change(screen.getByLabelText("Water temperature (°C)"), { target: { value: "18" } });

    act(() => {
      saveTemperatureUnitPreference("fahrenheit");
    });

    clickSave();
    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(1));
    const payload = wateringWriterMock.mock.calls[0][0];
    expect(payload.water_temp_c).toBe(18);
  });

  it("keeps the Water temperature label showing the pinned entry unit, not the live one, through a mid-draft preference flip", async () => {
    // Codex round-5 finding: the save payload was already correctly pinned
    // (see the test above), but the visible label still read the live unit —
    // a grower who typed 18 meaning 18°C would see the field relabel itself
    // to "(°F)" after a cross-tab flip even though 18°C is what gets saved.
    saveTemperatureUnitPreference("celsius");
    renderSheet();
    clickWater();
    fireEvent.change(screen.getByLabelText("Water temperature (°C)"), { target: { value: "18" } });

    act(() => {
      saveTemperatureUnitPreference("fahrenheit");
    });

    expect(screen.getByLabelText("Water temperature (°C)")).toBeTruthy();
    expect(screen.queryByLabelText("Water temperature (°F)")).toBeNull();
  });
});
