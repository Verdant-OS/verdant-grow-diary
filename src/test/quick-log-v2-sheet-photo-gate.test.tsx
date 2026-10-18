/**
 * QuickLogV2Sheet — photo attachment layout, a11y, and safety tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  buildQuickLogPhotoGateState,
  isQuickLogPhotoSavingSupported,
} from "@/lib/quickLogPhotoGateRules";

const rpcMock = vi.fn();
const uploadCalls: Array<{ bucket: string; path: string; file: File }> = [];
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const storageUploadMock = vi.fn();
const storageRemoveMock = vi.fn();
const diaryInsertMock = vi.fn();
const diaryMaybeSingleMock = vi.fn();
const diaryOwnerEqMock = vi.fn((..._args: unknown[]) => ({ maybeSingle: diaryMaybeSingleMock }));
const diaryIdEqMock = vi.fn((..._args: unknown[]) => ({ eq: diaryOwnerEqMock }));
const diarySelectMock = vi.fn((..._args: unknown[]) => ({ eq: diaryIdEqMock }));
/** diary_entries photo_url fill: `update(patch).filter(...).select()`. */
const updateCalls: Array<{ table: string; patch: Record<string, unknown>; filter: unknown[] }> = [];
const diaryUpdateSelectMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: File) => {
          uploadCalls.push({ bucket, path, file });
          return storageUploadMock(bucket, path, file);
        },
        remove: (...args: unknown[]) => storageRemoveMock(bucket, ...args),
      }),
    },
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
        return diaryInsertMock(table, payload);
      },
      select: (...args: unknown[]) => diarySelectMock(table, ...args),
      update: (patch: Record<string, unknown>) => ({
        filter: (...filter: unknown[]) => {
          updateCalls.push({ table, patch, filter });
          return { select: () => diaryUpdateSelectMock() };
        },
      }),
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

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
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
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey="plant:plant-1" />
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

beforeEach(() => {
  window.sessionStorage.clear();
  rpcMock.mockReset();
  storageUploadMock.mockReset();
  storageRemoveMock.mockReset();
  diaryInsertMock.mockReset();
  diaryMaybeSingleMock.mockReset();
  diaryOwnerEqMock.mockClear();
  diaryIdEqMock.mockClear();
  diarySelectMock.mockClear();
  uploadCalls.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  diaryUpdateSelectMock.mockReset().mockResolvedValue({ data: [{ id: "diary-1" }], error: null });
  rpcMock.mockResolvedValue({
    data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001" },
    error: null,
  });
  storageUploadMock.mockImplementation(async (_bucket: unknown, path: unknown) => ({
    data: { path: String(path) },
    error: null,
  }));
  storageRemoveMock.mockResolvedValue({ data: null, error: null });
  diaryInsertMock.mockResolvedValue({ data: null, error: null });
  diaryMaybeSingleMock.mockResolvedValue({ data: null, error: null });
  if (typeof URL.createObjectURL !== "function") {
    (URL as any).createObjectURL = vi.fn(() => "blob:quicklog-v2-preview");
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:quicklog-v2-preview");
  }
});
afterEach(() => cleanup());

describe("QuickLogV2Sheet — photo attachment", () => {
  it("asserts photo attachment saving is supported", () => {
    expect(isQuickLogPhotoSavingSupported()).toBe(true);
  });

  it("renders Take Photo and Choose from Library as attachment controls", () => {
    renderSheet();
    const expected = buildQuickLogPhotoGateState();
    expect(screen.getByTestId("qlv2-photo-attachment")).toBeTruthy();
    expect(screen.getByRole("button", { name: expected.takePhotoLabel })).toBeTruthy();
    expect(screen.getByRole("button", { name: expected.chooseLibraryLabel })).toBeTruthy();
    expect(screen.getByText(expected.pickerHelperText)).toBeTruthy();
  });

  it("renders distinct camera and library file inputs with mobile-safe attributes", () => {
    renderSheet();
    const camera = screen.getByTestId("qlv2-photo-camera-input") as HTMLInputElement;
    const library = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    expect(camera.getAttribute("accept")).toBe("image/*");
    expect(camera.getAttribute("capture")).toBe("environment");
    expect(library.getAttribute("accept")).toBe("image/*");
    expect(library.hasAttribute("capture")).toBe(false);
    expect(camera.className).toContain("sr-only");
    expect(library.className).toContain("sr-only");
  });

  it("selecting a library photo renders preview and resets input value", async () => {
    renderSheet();
    const library = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    await pickFile(library, makeImage("library.jpg"));
    expect(screen.getByTestId("qlv2-photo-preview")).toBeTruthy();
    expect(library.value).toBe("");
  });

  it("saves note plus library photo in the single RPC write, with no companion insert", async () => {
    renderSheet();
    const library = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    await pickFile(library, makeImage("library.jpg"));
    // Target the primary Quick Log note textarea by its exact accessible
    // name. The maturity section legitimately exposes its own "Grower note"
    // field, so a /note/i regex matches multiple distinct controls.
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Observation with attached photo" },
    });
    fireEvent.click(screen.getByTestId("qlv2-save"));

    await waitFor(() => {
      expect(uploadCalls).toHaveLength(1);
      expect(rpcMock).toHaveBeenCalledTimes(1);
      expect(updateCalls).toHaveLength(1);
    });

    expect(uploadCalls[0].bucket).toBe("diary-photos");
    expect(uploadCalls[0].path.startsWith("user-test-1/grow-1/")).toBe(true);
    // Production QA 2026-10-14: a second diary_entries insert produced a twin
    // "Photo attached" Timeline entry. The path now rides in p_details and the
    // RPC's mirror row is the only diary row.
    expect(insertCalls).toHaveLength(0);
    const payload = rpcMock.mock.calls[0][1] as { p_details?: Record<string, unknown> };
    expect(payload.p_details?.photo_url).toBe(uploadCalls[0].path);
    expect(updateCalls[0].table).toBe("diary_entries");
    expect(updateCalls[0].patch).toEqual({ photo_url: uploadCalls[0].path });
    expect(updateCalls[0].filter).toEqual([
      "details->>linked_grow_event_id",
      "eq",
      "77777777-7777-4777-8777-000000000001",
    ]);
  });

  it("reports the photo saved when the photo_url fill returns an error", async () => {
    diaryUpdateSelectMock.mockResolvedValueOnce({ data: null, error: { message: "fence" } });

    renderSheet();
    const library = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    await pickFile(library, makeImage("reconciled.jpg"));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Response reconciliation" },
    });
    fireEvent.click(screen.getByTestId("qlv2-save"));

    await waitFor(() => {
      expect(screen.getByTestId("qlv2-save-status")).toHaveTextContent("Log and photo saved");
    });
    // details.photo_url is persisted by the RPC: never delete the object.
    expect(storageRemoveMock).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
    expect(screen.queryByText(/attachment status uncertain/i)).toBeNull();
  });

  it("reports the photo saved and keeps the object when the photo_url fill throws", async () => {
    diaryUpdateSelectMock.mockRejectedValueOnce(new Error("response lost"));

    renderSheet();
    const library = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    await pickFile(library, makeImage("uncertain.jpg"));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Unconfirmed response" },
    });
    fireEvent.click(screen.getByTestId("qlv2-save"));

    await waitFor(() => {
      expect(screen.getByTestId("qlv2-save-status")).toHaveTextContent("Log and photo saved");
    });
    expect(storageRemoveMock).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
    expect(screen.queryByText(/attachment status uncertain/i)).toBeNull();
  });
});
