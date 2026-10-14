/**
 * ISO BMFF size 1 means a 64-bit largesize, so the 32-bit brand
 * offsets are wrong. A generic major brand plus mif1 must still be
 * rejected before upload.
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

/** Size 1, largesize 32, major brand isom, compatible brand mif1. */
function largesizeMif1Ftyp(): File {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4);
  view.setUint32(8, 0);
  view.setUint32(12, 32);
  bytes.set(new TextEncoder().encode("isom"), 16);
  bytes.set(new TextEncoder().encode("mif1"), 24);
  return new File([bytes], "photo.jpg", { type: "image/jpeg" });
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

describe("Coach ftyp largesize", () => {
  it("rejects a size-1 ftyp box with a mif1 compatible brand before upload", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 8, height: 8, close: vi.fn() }),
    );
    render(
      <MemoryRouter>
        <Coach />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByTestId("coach-photo-upload-input"), {
      target: { files: [largesizeMif1Ftyp()] },
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(UNSUPPORTED));
    expect(screen.getByRole("button", { name: /diagnose photo/i })).toBeDisabled();
    expect(storageUpload).not.toHaveBeenCalled();
    expect(functionsInvoke).not.toHaveBeenCalled();
  });
});
