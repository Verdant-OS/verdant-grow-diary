/**
 * Follow-up on 49d3a1ea: a HEIF whose major brand is generic still
 * carries a HEIC/HEIF compatible brand, a slower pick must not replace
 * a newer one, and a rejected header read must fail closed.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

const storageUpload = vi.hoisted(() => vi.fn());
const createSignedUrl = vi.hoisted(() => vi.fn());
const functionsInvoke = vi.hoisted(() => vi.fn());

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
  supabase: {
    storage: {
      from: () => ({
        upload: storageUpload,
        createSignedUrl,
      }),
    },
    functions: {
      invoke: functionsInvoke,
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/CoachContextSufficiencyPanel", () => ({ default: () => null }));
vi.mock("@/components/CoachAiDoctorHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/CoachAiDoctorContextPanel", () => ({ default: () => null }));

import Coach from "@/pages/Coach";
import { toast } from "sonner";

const UNSUPPORTED = "That file type is not supported.";

function jpegFile(name: string): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], name, { type: "image/jpeg" });
}

/** Major brand `isom`, compatible brand `heic`. Labelled image/jpeg. */
function compatibleHeicFile(): File {
  const bytes = new Uint8Array(24);
  new DataView(bytes.buffer).setUint32(0, 24);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4);
  bytes.set(new TextEncoder().encode("isom"), 8);
  bytes.set(new TextEncoder().encode("heic"), 16);
  return new File([bytes], "photo.jpg", { type: "image/jpeg" });
}

function withHeaderRead<T>(file: File, read: () => Promise<T>): File {
  const original = file.slice.bind(file);
  Object.defineProperty(file, "slice", {
    configurable: true,
    value(start?: number, end?: number) {
      const blob = original(start, end);
      Object.defineProperty(blob, "arrayBuffer", {
        configurable: true,
        value: read,
      });
      return blob;
    },
  });
  return file;
}

function holdHeader(file: File): { file: File; release: () => void } {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = withHeaderRead(file, async () => {
    await gate;
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
  });
  return { file: held, release };
}

function unreadableJpeg(): File {
  return withHeaderRead(jpegFile("unreadable.jpg"), () =>
    Promise.reject(new DOMException("The requested file could not be read.", "NotReadableError")),
  );
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

function stubPreview() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 8, height: 8, close: vi.fn() }),
  );
}

afterEach(() => {
  cleanup();
  storageUpload.mockReset();
  createSignedUrl.mockReset();
  functionsInvoke.mockReset();
  vi.mocked(toast.error).mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Coach photo type follow-up", () => {
  it("rejects a generic major brand when a compatible brand is HEIC", async () => {
    stubPreview();
    renderCoach();
    selectPhoto(compatibleHeicFile());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(UNSUPPORTED));
    expect(screen.getByRole("button", { name: /diagnose photo/i })).toBeDisabled();
    expect(storageUpload).not.toHaveBeenCalled();
    expect(functionsInvoke).not.toHaveBeenCalled();
  });

  it("keeps the latest pick when an earlier header read finishes later", async () => {
    storageUpload.mockResolvedValue({ error: null });
    createSignedUrl.mockResolvedValue({
      data: {
        signedUrl: "https://project.supabase.co/storage/v1/object/sign/diary-photos/p?token=t",
      },
      error: null,
    });
    functionsInvoke.mockResolvedValue({ data: { acknowledged: true }, error: null });
    stubPreview();
    const slow = holdHeader(jpegFile("slow.jpg"));
    const latest = jpegFile("latest.jpg");

    renderCoach();
    selectPhoto(slow.file);
    selectPhoto(latest);

    const diagnose = await screen.findByRole("button", { name: /diagnose photo/i });
    await waitFor(() => expect(diagnose).toBeEnabled());
    slow.release();
    await new Promise((resolve) => setTimeout(resolve, 30));

    fireEvent.click(diagnose);
    await waitFor(() => expect(storageUpload).toHaveBeenCalled());
    expect(storageUpload.mock.calls[0]?.[1]?.name).toBe("latest.jpg");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the unsupported message when the header read rejects", async () => {
    const reasons: unknown[] = [];
    const onRejection = (reason: unknown) => {
      reasons.push(reason);
    };
    process.on("unhandledRejection", onRejection);
    stubPreview();
    renderCoach();
    selectPhoto(unreadableJpeg());

    try {
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(UNSUPPORTED));
      expect(screen.getByRole("button", { name: /diagnose photo/i })).toBeDisabled();
      expect(storageUpload).not.toHaveBeenCalled();
      expect(functionsInvoke).not.toHaveBeenCalled();
      expect(reasons).toEqual([]);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });
});
