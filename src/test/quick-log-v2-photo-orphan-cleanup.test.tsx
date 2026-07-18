/**
 * QuickLogV2Sheet — orphaned-photo cleanup on companion-entry failure.
 *
 * handleSave uploads the photo to storage BEFORE writing the companion
 * diary entry. Two post-upload failure paths already remove the upload so
 * storage does not leak: the payload-build failure and the RPC save
 * failure. The third path — the companion diary-entry write failing after
 * the main log already saved — left the uploaded object stranded with no
 * row referencing it. This pins the cleanup on that path too.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpcMock = vi.fn();
const uploadCalls: Array<{ path: string }> = [];
const removeCalls: string[][] = [];
let insertResult: { error: { message?: string } | null } = { error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    storage: {
      from: () => ({
        upload: (path: string, _file: File) => {
          uploadCalls.push({ path });
          return Promise.resolve({ data: { path }, error: null });
        },
        remove: (paths: string[]) => {
          removeCalls.push(paths);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
    from: () => ({
      insert: () => Promise.resolve(insertResult),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-test-1" } }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

function makeImage(name = "gallery.jpg"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

async function pickFile(input: HTMLInputElement, file: File) {
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

async function saveWithPhoto() {
  renderSheet();
  const library = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
  await pickFile(library, makeImage());
  fireEvent.change(screen.getByLabelText("Note (optional)"), {
    target: { value: "Observation with attached photo" },
  });
  fireEvent.click(screen.getByTestId("qlv2-save"));
}

beforeEach(() => {
  rpcMock.mockReset();
  uploadCalls.length = 0;
  removeCalls.length = 0;
  insertResult = { error: null };
  rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: "event-1" }, error: null });
  if (typeof URL.createObjectURL !== "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).createObjectURL = vi.fn(() => "blob:quicklog-v2-preview");
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:quicklog-v2-preview");
  }
});
afterEach(() => cleanup());

describe("QuickLogV2Sheet — orphaned-photo cleanup", () => {
  it("removes the uploaded photo when the companion diary-entry write fails", async () => {
    // Main log saves (rpc ok) but the companion diary entry insert errors.
    insertResult = { error: { message: "companion insert failed" } };
    await saveWithPhoto();
    await waitFor(() => {
      expect(uploadCalls).toHaveLength(1);
      // The upload is now orphaned (no row references it) and must be removed.
      expect(removeCalls.flat()).toContain(uploadCalls[0].path);
    });
  });

  it("does not remove the photo on a fully successful save", async () => {
    await saveWithPhoto();
    await waitFor(() => {
      expect(uploadCalls).toHaveLength(1);
    });
    // Nothing failed, so the upload must be kept, not cleaned up.
    expect(removeCalls).toHaveLength(0);
  });
});
