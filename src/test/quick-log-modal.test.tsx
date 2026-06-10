/**
 * QuickLogModal component tests.
 *
 * Verifies the modal's save-side hardening:
 *   - Save button disables while a save is in flight
 *   - Re-entering handleSave (double-click) does not double-submit
 *   - Photo upload failure blocks createQuickLogEvent
 *   - createQuickLogEvent failure after a successful upload triggers
 *     storage cleanup for the orphan photo
 *   - User-facing error copy is surfaced via toast on upload / save failure
 *
 * No backend writes happen — every Supabase / business call is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ----- mocks -----
const createQuickLogEventMock = vi.fn();
vi.mock("@/lib/quick-log/createQuickLogEvent", () => ({
  createQuickLogEvent: (...a: unknown[]) => createQuickLogEventMock(...a),
  // The component imports the type too; vitest hoists this mock before the
  // SUT loads, so we just re-export a no-op map for any code that touches it.
  QUICK_LOG_EVENT_TYPE_MAP: {
    observe: "observation",
    water: "watering",
    feed: "feeding",
    photo: "photo",
    note: "note",
  },
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-123" } }),
}));

// MetricChip is a tiny presentational component; stub to keep DOM minimal.
vi.mock("@/components/MetricChip", () => ({
  default: () => null,
}));

// Supabase mock: covers
//   - sensor_readings select chain (snapshot fetch on open)
//   - storage upload + remove
const storageUpload = vi.fn();
const storageRemove = vi.fn();
const sensorRowsResult = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => {
  const sensorBuilder = () => {
    const b: Record<string, unknown> = {};
    (b as { select: (...a: unknown[]) => unknown }).select = () => b;
    (b as { eq: (...a: unknown[]) => unknown }).eq = () => b;
    (b as { order: (...a: unknown[]) => unknown }).order = () => b;
    (b as { limit: (...a: unknown[]) => Promise<typeof sensorRowsResult> }).limit = () =>
      Promise.resolve(sensorRowsResult);
    return b;
  };
  return {
    supabase: {
      from: (_table: string) => sensorBuilder(),
      storage: {
        from: () => ({
          upload: (...a: unknown[]) => storageUpload(...a),
          remove: (...a: unknown[]) => storageRemove(...a),
        }),
      },
    },
  };
});

import QuickLogModal from "@/components/QuickLogModal";

function renderModal() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogModal
        open={true}
        onOpenChange={() => {}}
        tentId="tent-1"
        growId="grow-abc"
        tentName="Tent A"
        plants={[{ id: "plant-1", name: "Blue Dream" }]}
      />
    </QueryClientProvider>,
  );
}

function fakePhotoFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "leaf.jpg", { type: "image/jpeg" });
}

/** Attach a photo to the modal by firing change on the hidden library input. */
function attachPhoto() {
  const inputs = document.querySelectorAll('input[type="file"]');
  const libraryInput = inputs[inputs.length - 1] as HTMLInputElement;
  fireEvent.change(libraryInput, { target: { files: [fakePhotoFile()] } });
}

beforeEach(() => {
  createQuickLogEventMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  storageUpload.mockReset();
  storageRemove.mockReset();
  // URL.createObjectURL is used for preview; jsdom has no impl by default.
  (URL as unknown as { createObjectURL: (f: File) => string }).createObjectURL = () =>
    "blob:preview";
});
afterEach(() => cleanup());

describe("QuickLogModal — save flow hardening", () => {
  it("disables Save while a save is in flight", async () => {
    // Slow save so we can observe the disabled state.
    let resolveSave: (v: unknown) => void = () => {};
    createQuickLogEventMock.mockImplementation(
      () => new Promise((res) => (resolveSave = res)),
    );

    renderModal();
    const saveBtn = screen.getByTestId("qlm-save") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);

    await waitFor(() => expect(saveBtn.disabled).toBe(true));
    expect(createQuickLogEventMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave({ id: "event-1" });
    });
  });

  it("does not double-submit when Save is clicked twice rapidly", async () => {
    let resolveSave: (v: unknown) => void = () => {};
    createQuickLogEventMock.mockImplementation(
      () => new Promise((res) => (resolveSave = res)),
    );

    renderModal();
    const saveBtn = screen.getByTestId("qlm-save") as HTMLButtonElement;
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);
    fireEvent.click(saveBtn);

    await waitFor(() => expect(saveBtn.disabled).toBe(true));
    expect(createQuickLogEventMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave({ id: "event-1" });
    });
  });

  it("blocks createQuickLogEvent when photo upload fails", async () => {
    storageUpload.mockResolvedValue({ error: { message: "upload boom" } });

    renderModal();
    attachPhoto();
    fireEvent.click(screen.getByTestId("qlm-save"));

    await waitFor(() => expect(storageUpload).toHaveBeenCalledTimes(1));
    expect(createQuickLogEventMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
    const msg = String(toastError.mock.calls[0]?.[0] ?? "");
    expect(msg.toLowerCase()).toContain("upload");
  });

  it("removes uploaded photo when createQuickLogEvent fails after upload", async () => {
    storageUpload.mockResolvedValue({ error: null });
    storageRemove.mockResolvedValue({ error: null });
    createQuickLogEventMock.mockRejectedValue(new Error("db down"));

    renderModal();
    attachPhoto();
    fireEvent.click(screen.getByTestId("qlm-save"));

    await waitFor(() => expect(storageRemove).toHaveBeenCalledTimes(1));
    // Cleanup must target the path that was uploaded.
    const uploadedPath = String(storageUpload.mock.calls[0]?.[0] ?? "");
    const removedPaths = (storageRemove.mock.calls[0]?.[0] ?? []) as string[];
    expect(removedPaths).toContain(uploadedPath);
  });

  it("surfaces user-facing error copy on save failure", async () => {
    storageUpload.mockResolvedValue({ error: null });
    storageRemove.mockResolvedValue({ error: null });
    createQuickLogEventMock.mockRejectedValue(new Error("db down"));

    renderModal();
    attachPhoto();
    fireEvent.click(screen.getByTestId("qlm-save"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const msg = String(toastError.mock.calls[0]?.[0] ?? "");
    expect(msg).toContain("db down");
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
