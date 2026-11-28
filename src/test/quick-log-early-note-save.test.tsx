/**
 * Quick Log · Save log accepts text typed only in "What changed?" (#3111).
 *
 * The early-stage "What changed?" field writes its text into the saved diary
 * note as "Early note: …". Save log must accept it as the note, and still
 * reject a save when both note fields are empty.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { toast } from "sonner";
import QuickLog from "@/components/QuickLog";
import { hasQuickLogNoteText } from "@/lib/earlyStageQuickLogRules";

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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: vi.fn(),
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => {
              const __c: any = {
                abortSignal: () => __c,
                then: (r: any, j?: any) => Promise.resolve({ data: [], error: null }).then(r, j),
              };
              return __c;
            },
          }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Test Grow", stage: "seedling" }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: "seedling" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "plant-1",
        name: "Test Plant",
        tent_id: "tent-1",
        grow_id: "grow-1",
        created_at: new Date().toISOString(),
      },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true });
  vi.mocked(toast.error).mockReset();
});

function openQuickLog() {
  renderWithClient(
    <QuickLog open onOpenChange={vi.fn()} prefill={{ plantId: "plant-1", growId: "grow-1" }} />,
  );
  return screen.getByRole("dialog");
}

describe("hasQuickLogNoteText", () => {
  it("is true when Short note has text", () => {
    expect(hasQuickLogNoteText({ note: "day 4", earlyNotes: "" })).toBe(true);
  });

  it("is true when only What changed? has text", () => {
    expect(hasQuickLogNoteText({ note: "", earlyNotes: "popped soil" })).toBe(true);
  });

  it("is false when both fields are empty or whitespace", () => {
    expect(hasQuickLogNoteText({ note: "", earlyNotes: "" })).toBe(false);
    expect(hasQuickLogNoteText({ note: "  \n ", earlyNotes: "\t " })).toBe(false);
  });

  it("is false for null or absent inputs", () => {
    expect(hasQuickLogNoteText({})).toBe(false);
    expect(hasQuickLogNoteText({ note: null, earlyNotes: null })).toBe(false);
  });
});

describe("Quick Log · Save log with only What changed?", () => {
  it("saves the entry with the What changed? text in the diary note", async () => {
    const dialog = openQuickLog();
    fireEvent.change(within(dialog).getByTestId("quick-log-early-stage-notes"), {
      target: { value: "popped soil" },
    });
    fireEvent.click(within(dialog).getByTestId("quick-log-save"));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const payload = saveMock.mock.calls[0][0];
    expect(payload.p_action).toBe("note");
    expect(payload.p_note).toBe("Early note: popped soil");
    expect(payload.p_details).toMatchObject({ early_stage: { notes: "popped soil" } });
    expect(toast.error).not.toHaveBeenCalledWith("Add a quick note");
  });

  it("does not show the missing-note hint when What changed? has text", () => {
    const dialog = openQuickLog();
    expect(within(dialog).getByTestId("quicklog-preview").textContent).toContain(
      "Add a quick note before saving.",
    );
    fireEvent.change(within(dialog).getByTestId("quick-log-early-stage-notes"), {
      target: { value: "popped soil" },
    });
    expect(within(dialog).getByTestId("quicklog-preview").textContent).not.toContain(
      "Add a quick note before saving.",
    );
  });

  it("still rejects the save when both note fields are empty", async () => {
    const dialog = openQuickLog();
    fireEvent.change(within(dialog).getByTestId("quick-log-early-stage-notes"), {
      target: { value: "   " },
    });
    fireEvent.click(within(dialog).getByTestId("quick-log-save"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add a quick note"));
    expect(saveMock).not.toHaveBeenCalled();
  });
});
