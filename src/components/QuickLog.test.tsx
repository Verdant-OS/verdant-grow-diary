/**
 * Legacy QuickLog component contract tests — post-unification.
 *
 * The legacy QuickLog no longer:
 *   - uploads photos
 *   - inserts into diary_entries
 *   - embeds sensor snapshots into a persistence payload
 *
 * Supported actions (watering / observation / note) route through
 * useQuickLogV2Save → quicklog_save_manual. Unsupported actions
 * (including photo) are surfaced as "Coming soon".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import QuickLog from "./QuickLog";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const saveMock = vi.fn();
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...a: unknown[]) => saveMock(...a),
    saving: false,
    error: null,
  }),
}));

const insertMock = vi.fn();
const uploadMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: insertMock,
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
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
    data: [{ id: "plant-1", name: "Test Plant", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastMessage = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    message: (...a: unknown[]) => toastMessage(...a),
  },
}));

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true });
  insertMock.mockReset();
  uploadMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  toastMessage.mockReset();
});

describe("QuickLog photo attach — disabled (Coming soon)", () => {
  it("renders the photo placeholder as a 'Coming soon' disabled area, with no file input", () => {
    renderWithClient(<QuickLog open={true} onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    const placeholder = within(dialog).getByTestId("quicklog-photo-coming-soon");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder.textContent).toMatch(/coming soon/i);

    // Legacy photo affordances are gone.
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(dialog.querySelector("img")).toBeNull();
    expect(within(dialog).queryByLabelText("Remove photo")).toBeNull();
  });

  it("never uploads to storage or inserts into diary_entries during save", async () => {
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Looking good" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("QuickLog supported save · routes through quicklog_save_manual RPC", () => {
  it("submits an observation with a note as p_action='note' and closes the dialog", async () => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Topped plant" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      p_action: "note",
      p_target_type: "plant",
      p_target_id: "plant-1",
      p_note: "Topped plant",
    });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onCreated).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("Logged 🌱");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("blocks submit with empty note for observation, showing the validation toast", async () => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Add a quick note"));
    expect(saveMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("surfaces RPC errors without closing the dialog", async () => {
    saveMock.mockResolvedValueOnce({ ok: false, reason: "save_failed" });
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        prefill={{ plantId: "plant-1", growId: "grow-1" }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "Note" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.stringMatching(/save_failed/),
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onCreated).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
