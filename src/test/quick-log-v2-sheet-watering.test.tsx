import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

const rpcMock = vi.fn();
const wateringWriterMock = vi.fn();
const storageUpload = vi.fn();
const storageRemove = vi.fn();
const diaryInsert = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const videoValidationMock = vi.fn();
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
  useAuth: () => ({ user: { id: "user-1" } }),
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

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
    message: vi.fn(),
  },
}));

function renderSheet(defaultTargetKey = "plant:plant-1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onOpenChange = vi.fn();
  const renderTree = (open: boolean, targetKey = defaultTargetKey) => (
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={open} onOpenChange={onOpenChange} defaultTargetKey={targetKey} />
    </QueryClientProvider>
  );
  const view = render(renderTree(true));
  return {
    onOpenChange,
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

beforeEach(() => {
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

describe("QuickLogV2Sheet — structured watering", () => {
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
      /exact same target, timestamp, measurements, note, and attachments/i,
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

  it("rotates the server idempotency key on a fresh open after an uncertain write", async () => {
    wateringWriterMock
      .mockResolvedValueOnce({ ok: false, reason: "rpc:error" })
      .mockResolvedValueOnce({ ok: true, eventId: "water-event-fresh", reused: false });
    const { rerenderOpen } = renderSheet();
    clickWater();
    enterVolume();
    clickSave();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const failedKey = wateringWriterMock.mock.calls[0][0].idempotency_key;

    rerenderOpen(false);
    rerenderOpen(true);
    clickWater();
    enterVolume("600");
    clickSave();

    await waitFor(() => expect(wateringWriterMock).toHaveBeenCalledTimes(2));
    expect(wateringWriterMock.mock.calls[1][0].idempotency_key).not.toBe(failedKey);
    expect(wateringWriterMock.mock.calls[1][0].volume_ml).toBe(600);
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
      | ((value: { ok: true; mime: string; sizeBytes: number; durationS: number }) => void)
      | null = null;
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
      | ((value: { ok: true; mime: string; sizeBytes: number; durationS: number }) => void)
      | null = null;
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
});
