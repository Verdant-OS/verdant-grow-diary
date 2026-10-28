/**
 * An older diagnose validation that fails after a newer photo is picked
 * must not clear the newer photo. Removing the selection-token guard
 * clears it.
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
const SELECTED = "Photo selected · preview unavailable";

function gifHeaderBuffer(): ArrayBuffer {
  const bytes = new Uint8Array(6);
  bytes.set(new TextEncoder().encode("GIF89a"));
  return bytes.buffer;
}

function gifFile(name: string, onRead: (call: number) => Promise<ArrayBuffer>): File {
  const file = new File([gifHeaderBuffer()], name, { type: "image/gif" });
  let calls = 0;
  const slice = file.slice.bind(file);
  file.slice = ((start?: number, end?: number, contentType?: string) => {
    const blob = slice(start, end, contentType);
    blob.arrayBuffer = () => {
      calls += 1;
      return onRead(calls);
    };
    return blob;
  }) as File["slice"];
  return file;
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

describe("Coach photo pick race", () => {
  it("keeps a newer photo when an older diagnose validation fails", async () => {
    const failOldRead = {
      run: (): void => {
        throw new Error("stale header read was not armed");
      },
    };
    const oldRead = new Promise<ArrayBuffer>((_resolve, reject) => {
      failOldRead.run = () => reject(new Error("stale header read"));
    });
    let replacementRead = false;
    const oldPhoto = gifFile("old.gif", (call) =>
      call === 1 ? Promise.resolve(gifHeaderBuffer()) : oldRead,
    );
    const newPhoto = gifFile("new.gif", () => {
      replacementRead = true;
      return Promise.resolve(gifHeaderBuffer());
    });

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
      target: { files: [oldPhoto] },
    });
    const diagnose = await screen.findByRole("button", { name: /diagnose photo/i });
    fireEvent.click(diagnose);

    fireEvent.change(screen.getByTestId("coach-photo-upload-input"), {
      target: { files: [newPhoto] },
    });
    await waitFor(() => expect(replacementRead).toBe(true));
    await screen.findByText(SELECTED);

    failOldRead.run();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(UNSUPPORTED));
    expect(screen.getByText(SELECTED)).toBeInTheDocument();
    expect(screen.queryByText("Add photo to diagnose")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /diagnose photo/i })).toBeEnabled();
    expect(storageUpload).not.toHaveBeenCalled();
    expect(functionsInvoke).not.toHaveBeenCalled();
  });
});
