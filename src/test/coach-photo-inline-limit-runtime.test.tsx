/**
 * Coach photo intake must reject inline-incompatible files before upload
 * and before the AI Coach credit spend.
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

const INLINE_MAX_BYTES = 7 * 1024 * 1024;

function fileOf(name: string, type: string, size: number): File {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
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

async function expectRejectedBeforeUpload(file: File, message: string) {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 100, height: 100, close: vi.fn() }),
  );
  renderCoach();
  selectPhoto(file);

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
  expect(screen.getByRole("button", { name: /diagnose photo/i })).toBeDisabled();
  expect(storageUpload).not.toHaveBeenCalled();
  expect(createSignedUrl).not.toHaveBeenCalled();
  expect(functionsInvoke).not.toHaveBeenCalled();
  expect(screen.queryByText("Preparing safe preview…")).not.toBeInTheDocument();
}

afterEach(() => {
  cleanup();
  storageUpload.mockReset();
  createSignedUrl.mockReset();
  functionsInvoke.mockReset();
  vi.mocked(toast.error).mockReset();
  vi.unstubAllGlobals();
});

describe("Coach inline photo limits before upload and spend", () => {
  it("rejects a 25 MB photo before upload or credit spend", async () => {
    await expectRejectedBeforeUpload(
      fileOf("canopy.jpg", "image/jpeg", 25 * 1024 * 1024),
      "Choose a photo smaller than 7 MB.",
    );
  });

  it("rejects a photo one byte over the 7 MiB inline limit before upload or credit spend", async () => {
    await expectRejectedBeforeUpload(
      fileOf("over.jpg", "image/jpeg", INLINE_MAX_BYTES + 1),
      "Choose a photo smaller than 7 MB.",
    );
  });

  it("rejects HEIC before upload or credit spend", async () => {
    await expectRejectedBeforeUpload(
      fileOf("iphone.heic", "image/heic", 1024),
      "That file type is not supported.",
    );
  });

  it("rejects HEIF before upload or credit spend", async () => {
    await expectRejectedBeforeUpload(
      fileOf("iphone.heif", "image/heif", 1024),
      "That file type is not supported.",
    );
  });
});
