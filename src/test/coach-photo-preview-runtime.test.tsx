import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "grower-1" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    activeGrow: { id: "grow-1", name: "One Tent" },
    activeGrowId: "grow-1",
  }),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({ data: [] }),
  useGrowSensorReadings: () => ({ data: [] }),
  getGrowDataMeta: () => ({
    isDemoData: false,
    dataSource: "unavailable",
    sourceReason: "test-no-data",
  }),
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: [] }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/components/CoachContextSufficiencyPanel", () => ({ default: () => null }));
vi.mock("@/components/CoachAiDoctorHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/CoachAiDoctorContextPanel", () => ({ default: () => null }));

import Coach from "@/pages/Coach";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeBitmap(width = 1280, height = 720) {
  return {
    width,
    height,
    close: vi.fn(),
  } as unknown as ImageBitmap;
}

function makeJpeg(name: string): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });
}

function renderCoach() {
  return render(
    <MemoryRouter>
      <Coach />
    </MemoryRouter>,
  );
}

function selectPhoto(file: File) {
  fireEvent.change(screen.getByTestId("coach-photo-upload-input"), {
    target: { files: [file] },
  });
}

const clearRect = vi.fn();
const drawImage = vi.fn();
let getContextSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearRect.mockReset();
  drawImage.mockReset();
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ clearRect, drawImage } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  cleanup();
  getContextSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe("Coach photo preview runtime", () => {
  it("decodes a validated JPEG with bounded options, draws its cover crop, and closes it", async () => {
    const bitmap = fakeBitmap();
    const createImageBitmapMock = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);
    renderCoach();

    const file = makeJpeg("canopy.jpg");
    selectPhoto(file);

    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(1));
    expect(createImageBitmapMock).toHaveBeenCalledWith(file, {
      imageOrientation: "from-image",
      resizeWidth: 1280,
      resizeQuality: "high",
    });
    expect(clearRect).toHaveBeenCalledWith(0, 0, 1280, 720);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1280, 720, 0, 0, 1280, 720);
    expect(screen.getByTestId("coach-photo-preview-canvas")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("keeps the selected photo usable when browser preview decoding is unavailable", async () => {
    const createImageBitmapMock = vi.fn().mockRejectedValue(new Error("unsupported decoder"));
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);
    renderCoach();

    selectPhoto(makeJpeg("library-photo.jpg"));

    expect(await screen.findByText("Photo selected · preview unavailable")).toBeInTheDocument();
    expect(drawImage).not.toHaveBeenCalled();
    expect(screen.getByTestId("coach-photo-preview-canvas")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: /diagnose photo/i })).toBeEnabled();
  });

  it("closes but never draws a stale decode after the grower selects a replacement", async () => {
    const first = deferred<ImageBitmap>();
    const second = deferred<ImageBitmap>();
    const firstBitmap = fakeBitmap();
    const secondBitmap = fakeBitmap();
    const createImageBitmapMock = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);
    renderCoach();

    selectPhoto(makeJpeg("first.jpg"));
    await waitFor(() => expect(createImageBitmapMock).toHaveBeenCalledTimes(1));
    selectPhoto(makeJpeg("replacement.jpg"));
    await waitFor(() => expect(createImageBitmapMock).toHaveBeenCalledTimes(2));

    await act(async () => first.resolve(firstBitmap));
    expect(firstBitmap.close).toHaveBeenCalledTimes(1);
    expect(drawImage).not.toHaveBeenCalled();

    await act(async () => second.resolve(secondBitmap));
    await waitFor(() => expect(drawImage).toHaveBeenCalledTimes(1));
    expect(drawImage).toHaveBeenCalledWith(secondBitmap, 0, 0, 1280, 720, 0, 0, 1280, 720);
    expect(secondBitmap.close).toHaveBeenCalledTimes(1);
  });
});
