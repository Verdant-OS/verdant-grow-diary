/**
 * QuickLogV2Sheet — photo attachment layout, a11y, and safety tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  buildQuickLogPhotoGateState,
  isQuickLogPhotoSavingSupported,
} from "@/lib/quickLogPhotoGateRules";

const rpcMock = vi.fn();
const uploadCalls: Array<{ bucket: string; path: string; file: File }> = [];
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: File) => {
          uploadCalls.push({ bucket, path, file });
          return Promise.resolve({ data: { path }, error: null });
        },
        remove: () => Promise.resolve({ data: null, error: null }),
      }),
    },
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-test-1" } }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
    ],
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
      <QuickLogV2Sheet
        open={true}
        onOpenChange={() => {}}
        defaultTargetKey="plant:plant-1"
      />
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
  rpcMock.mockReset();
  uploadCalls.length = 0;
  insertCalls.length = 0;
  rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: "event-1" }, error: null });
  if (typeof URL.createObjectURL !== "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  it("saves note plus library photo through diary-photos and companion diary entry", async () => {
    renderSheet();
    const library = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
    await pickFile(library, makeImage("library.jpg"));
    fireEvent.change(screen.getByLabelText(/note/i), {
      target: { value: "Observation with attached photo" },
    });
    fireEvent.click(screen.getByTestId("qlv2-save"));

    await waitFor(() => {
      expect(uploadCalls).toHaveLength(1);
      expect(rpcMock).toHaveBeenCalledTimes(1);
      expect(insertCalls).toHaveLength(1);
    });

    expect(uploadCalls[0].bucket).toBe("diary-photos");
    expect(uploadCalls[0].path.startsWith("user-test-1/grow-1/")).toBe(true);
    expect(insertCalls[0].table).toBe("diary_entries");
    expect(insertCalls[0].payload.photo_url).toBe(uploadCalls[0].path);
    expect(insertCalls[0].payload.grow_id).toBe("grow-1");
    expect(insertCalls[0].payload.plant_id).toBe("plant-1");
    expect(insertCalls[0].payload.tent_id).toBe("tent-1");
  });
});
