/**
 * Bug C: in the Quick Log dialog (plant page "Upload Photo"), choosing a
 * photo in the All activity types Photo editor and then pressing the main
 * "Save log" saved only the note and silently dropped the photo. "Save log"
 * writes through quicklog_save_manual and never carries that image, so it
 * must block with a clear message and write nothing while a photo is
 * selected there. A note-only Save log keeps working.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import QuickLog from "@/components/QuickLog";
import {
  QUICK_LOG_PENDING_SECTION_PHOTO_BLOCKED_COPY,
  resolveQuickLogPendingSectionPhotoBlock,
} from "@/lib/quickLogPendingSectionPhotoRules";

const saveMock = vi.fn();
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...a: unknown[]) => saveMock(...a),
    saving: false,
    error: null,
  }),
}));

// The PNG signature read can be held open to exercise the validation window.
const pngCheck = vi.hoisted(() => ({ hold: null as null | (() => Promise<unknown>) }));
vi.mock("@/lib/quickLogPhotoContentRules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quickLogPhotoContentRules")>();
  return {
    ...actual,
    validateQuickLogPngClaim: (file: File) =>
      pngCheck.hold ? pngCheck.hold() : actual.validateQuickLogPngClaim(file),
  };
});

const insertMock = vi.fn();
const uploadMock = vi.fn();
const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({
      insert: insertMock,
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => {
              const c: any = {
                abortSignal: () => c,
                then: (r: any, j?: any) => Promise.resolve({ data: [], error: null }).then(r, j),
              };
              return c;
            },
          }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: uploadMock, remove: vi.fn() }) },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Test Grow", stage: "veg" }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: "veg" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Verdant Test Plant", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

const PREFIX = "quick-log-dialog-all-activities";

function renderDialog(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function openDialog() {
  renderDialog(
    <QuickLog
      open={true}
      onOpenChange={vi.fn()}
      prefill={{ plantId: "plant-1", growId: "grow-1", eventType: "observation" }}
    />,
  );
  return screen.getByRole("dialog");
}

function selectPhotoActivity() {
  const testId = `${PREFIX}-picker-photo`;
  if (!screen.queryByTestId(testId)) {
    const disclosure = screen.getAllByRole("button", { name: "More activity types" })[0];
    if (disclosure.getAttribute("aria-expanded") === "false") fireEvent.click(disclosure);
  }
  fireEvent.click(screen.getByTestId(testId));
}

function typeMainNote(dialog: HTMLElement, text: string) {
  const textarea = dialog.querySelector("textarea") as HTMLTextAreaElement | null;
  if (!textarea) throw new Error("Quick Log textarea not found");
  fireEvent.change(textarea, { target: { value: text } });
}

function listenForEntryCreated() {
  const events: Event[] = [];
  const handler = (e: Event) => events.push(e);
  window.addEventListener("verdant:entry-created", handler);
  return { events, stop: () => window.removeEventListener("verdant:entry-created", handler) };
}

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true });
  insertMock.mockReset();
  uploadMock.mockReset();
  rpcMock.mockReset();
  pngCheck.hold = null;
});

describe("resolveQuickLogPendingSectionPhotoBlock", () => {
  it("blocks only when a section photo is pending", () => {
    expect(resolveQuickLogPendingSectionPhotoBlock(true)).toBe(
      QUICK_LOG_PENDING_SECTION_PHOTO_BLOCKED_COPY,
    );
    expect(resolveQuickLogPendingSectionPhotoBlock(false)).toBeNull();
    expect(resolveQuickLogPendingSectionPhotoBlock(null)).toBeNull();
    expect(resolveQuickLogPendingSectionPhotoBlock(undefined)).toBeNull();
  });
});

describe("Quick Log dialog: Save log with a selected Photo-section image", () => {
  it("blocks Save log with a clear message and writes nothing while a photo is selected", async () => {
    const dialog = openDialog();
    selectPhotoActivity();
    const file = new File(["img-bytes"], "bud.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId(`${PREFIX}-photo-file`), { target: { files: [file] } });
    expect(screen.getByText(/Selected: bud\.jpg/)).toBeInTheDocument();

    typeMainNote(dialog, "short note");
    const listener = listenForEntryCreated();
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));

    const error = await screen.findByTestId("quick-log-save-error");
    expect(error).toHaveTextContent(QUICK_LOG_PENDING_SECTION_PHOTO_BLOCKED_COPY);
    // Nothing is written: no note save, no upload, no diary row, no RPC, no refresh event.
    expect(saveMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(listener.events).toHaveLength(0);
    listener.stop();
    // The selected photo is kept so the grower can still save it.
    expect(screen.getByText(/Selected: bud\.jpg/)).toBeInTheDocument();
  });

  it("blocks Save log while a chosen PNG is still being checked, and releases it if rejected", async () => {
    let finishCheck: (result: { ok: true } | { ok: false; message: string }) => void = () => {};
    pngCheck.hold = () => new Promise((resolve) => (finishCheck = resolve));
    const dialog = openDialog();
    selectPhotoActivity();
    const file = new File(["img-bytes"], "bud.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId(`${PREFIX}-photo-file`), { target: { files: [file] } });
    // The check has not finished, so nothing is shown as selected yet.
    expect(screen.queryByText(/Selected: bud\.png/)).toBeNull();
    expect(screen.getByTestId(`${PREFIX}-save`)).toBeDisabled();

    typeMainNote(dialog, "short note");
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));
    expect(await screen.findByTestId("quick-log-save-error")).toHaveTextContent(
      QUICK_LOG_PENDING_SECTION_PHOTO_BLOCKED_COPY,
    );
    expect(saveMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();

    // The file turns out not to be a PNG: the photo is no longer pending, the
    // block message goes away and the note saves on its own.
    await act(async () => finishCheck({ ok: false, message: "Not a real PNG." }));
    await waitFor(() =>
      expect(screen.queryByText(QUICK_LOG_PENDING_SECTION_PHOTO_BLOCKED_COPY)).toBeNull(),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("clears the block message once the selected photo is cancelled", async () => {
    const dialog = openDialog();
    selectPhotoActivity();
    const file = new File(["img-bytes"], "bud.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId(`${PREFIX}-photo-file`), { target: { files: [file] } });
    typeMainNote(dialog, "short note");
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));
    expect(await screen.findByTestId("quick-log-save-error")).toHaveTextContent(
      QUICK_LOG_PENDING_SECTION_PHOTO_BLOCKED_COPY,
    );

    fireEvent.click(screen.getByTestId(`${PREFIX}-cancel`));
    await waitFor(() =>
      expect(screen.queryByText(QUICK_LOG_PENDING_SECTION_PHOTO_BLOCKED_COPY)).toBeNull(),
    );
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("keeps note-only Save log working when no photo is selected", async () => {
    const dialog = openDialog();
    typeMainNote(dialog, "short note");
    fireEvent.click(within(dialog).getByRole("button", { name: /save log/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(QUICK_LOG_PENDING_SECTION_PHOTO_BLOCKED_COPY)).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
