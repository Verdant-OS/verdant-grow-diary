/**
 * Coach must reject a HEIC/HEIF payload labelled image/jpeg before upload
 * and credit spend, and must accept an ordinary GIF the server already sniffs.
 *
 * The real path is the Coach page: the upload input, handleFile, and the
 * Diagnose photo action that uploads to Storage and invokes ai-coach.
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

function ftypFile(brand: string): File {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(0, 16);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4);
  bytes.set(new TextEncoder().encode(brand.slice(0, 4)), 8);
  return new File([bytes], "photo.jpg", { type: "image/jpeg" });
}

function gifFile(): File {
  return new File([new TextEncoder().encode("GIF89a")], "plant.gif", { type: "image/gif" });
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

async function expectRejectedBeforeUpload(file: File) {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 100, height: 100, close: vi.fn() }),
  );
  renderCoach();
  selectPhoto(file);

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(UNSUPPORTED));
  expect(screen.getByRole("button", { name: /diagnose photo/i })).toBeDisabled();
  expect(storageUpload).not.toHaveBeenCalled();
  expect(createSignedUrl).not.toHaveBeenCalled();
  expect(functionsInvoke).not.toHaveBeenCalled();
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

describe("Coach photo type before upload and spend", () => {
  it("rejects a HEIC ftyp payload labelled image/jpeg before upload or credit spend", async () => {
    await expectRejectedBeforeUpload(ftypFile("heic"));
  });

  it("rejects a HEIF ftyp payload labelled image/jpeg before upload or credit spend", async () => {
    await expectRejectedBeforeUpload(ftypFile("mif1"));
  });

  it("accepts an ordinary GIF and uploads it before the ai-coach invoke", async () => {
    storageUpload.mockResolvedValue({ error: null });
    createSignedUrl.mockResolvedValue({
      data: {
        signedUrl:
          "https://project.supabase.co/storage/v1/object/sign/diary-photos/plant.gif?token=t",
      },
      error: null,
    });
    functionsInvoke.mockResolvedValue({ data: { acknowledged: true }, error: null });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 8, height: 8, close: vi.fn() }),
    );

    renderCoach();
    selectPhoto(gifFile());

    const diagnose = await screen.findByRole("button", { name: /diagnose photo/i });
    await waitFor(() => expect(diagnose).toBeEnabled());
    expect(toast.error).not.toHaveBeenCalled();

    fireEvent.click(diagnose);

    await waitFor(() => expect(functionsInvoke).toHaveBeenCalled());
    expect(storageUpload).toHaveBeenCalled();
    expect(storageUpload.mock.invocationCallOrder[0]).toBeLessThan(
      functionsInvoke.mock.invocationCallOrder[0],
    );
    expect(storageUpload.mock.calls[0]?.[2]).toEqual({ contentType: "image/gif" });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
