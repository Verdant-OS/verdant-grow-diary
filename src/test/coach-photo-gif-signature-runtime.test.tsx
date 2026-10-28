/**
 * A file labelled image/gif whose bytes are not GIF87a or GIF89a must
 * be rejected before upload. Removing the signature check accepts it.
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

function labelledGifWithoutSignature(): File {
  return new File([new TextEncoder().encode("NOTGIF")], "fake.gif", { type: "image/gif" });
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

describe("Coach GIF signature", () => {
  it("rejects a non-GIF payload labelled image/gif before upload", async () => {
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
      target: { files: [labelledGifWithoutSignature()] },
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(UNSUPPORTED));
    expect(screen.getByRole("button", { name: /diagnose photo/i })).toBeDisabled();
    expect(storageUpload).not.toHaveBeenCalled();
    expect(functionsInvoke).not.toHaveBeenCalled();
  });
});
