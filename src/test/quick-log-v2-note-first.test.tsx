/**
 * Note-first Quick Log V2 (Verdant North Star priority 1).
 *
 * - The note box is focused when a fresh Note sheet opens.
 * - The note box comes before optional photo / video structure.
 * - A grower can save with just a note.
 * - The save state is visible: Saving…, Saved, or failed with retry.
 *
 * Auth, storage (sessionStorage cleared, no real Supabase) and network
 * (supabase.rpc mocked) are all mocked. No real credentials.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import {
  deriveQuickLogV2SaveState,
  quickLogV2SaveStateLabel,
  shouldFocusQuickLogV2NoteOnOpen,
} from "@/lib/quickLogV2NoteFirstRules";

const rpcMock = vi.fn();

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

const noteBox = () => screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;

beforeEach(() => {
  window.sessionStorage.clear();
  rpcMock.mockReset();
});
afterEach(() => cleanup());

describe("quickLogV2NoteFirstRules", () => {
  it("derives saving, saved, failed and idle", () => {
    expect(deriveQuickLogV2SaveState({ saving: true, saved: true, error: "x" })).toBe("saving");
    expect(deriveQuickLogV2SaveState({ saving: false, saved: true, error: "x" })).toBe("saved");
    expect(deriveQuickLogV2SaveState({ saving: false, saved: false, error: "boom" })).toBe(
      "failed",
    );
    expect(deriveQuickLogV2SaveState({ saving: false, saved: false, error: "  " })).toBe("idle");
    expect(deriveQuickLogV2SaveState({ saving: false, saved: false, error: null })).toBe("idle");
  });

  it("labels each state plainly and says nothing when idle", () => {
    expect(quickLogV2SaveStateLabel("saving")).toBe("Saving…");
    expect(quickLogV2SaveStateLabel("saved")).toBe("Saved");
    expect(quickLogV2SaveStateLabel("failed")).toMatch(/try again/i);
    expect(quickLogV2SaveStateLabel("idle")).toBe("");
  });

  it("names the control the sheet actually shows on a failed save", () => {
    expect(quickLogV2SaveStateLabel("failed")).toMatch(/tap Save to try again/);
    expect(quickLogV2SaveStateLabel("failed", { retryPending: true })).toMatch(
      /tap Retry exact record to try again/,
    );
    expect(quickLogV2SaveStateLabel("failed", { retryPending: true })).not.toMatch(/tap Save/);
    expect(quickLogV2SaveStateLabel("saved", { retryPending: true })).toBe("Saved");
  });

  it("focuses the note only on a fresh, unlocked Note sheet", () => {
    const base = { open: true, action: "note", recoveryPending: false, submissionLocked: false };
    expect(shouldFocusQuickLogV2NoteOnOpen(base)).toBe(true);
    expect(shouldFocusQuickLogV2NoteOnOpen({ ...base, open: false })).toBe(false);
    expect(shouldFocusQuickLogV2NoteOnOpen({ ...base, action: "water" })).toBe(false);
    expect(shouldFocusQuickLogV2NoteOnOpen({ ...base, recoveryPending: true })).toBe(false);
    expect(shouldFocusQuickLogV2NoteOnOpen({ ...base, submissionLocked: true })).toBe(false);
  });
});

describe("QuickLogV2Sheet note-first", () => {
  it("focuses the note box when the Note sheet opens", async () => {
    renderSheet();
    await waitFor(() => expect(document.activeElement).toBe(noteBox()));
  });

  it("puts the note box before the optional photo attachment", () => {
    renderSheet();
    const photo = screen.getByTestId("qlv2-photo-attachment");
    expect(
      noteBox().compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("saves with just a note and shows Saved", async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        grow_event_id: "77777777-7777-4777-8777-000000000001",
        environment_event_id: null,
      },
      error: null,
    });
    renderSheet();
    fireEvent.change(noteBox(), { target: { value: "New pistils on the top cola" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    const [fn, payload] = rpcMock.mock.calls[0] as [string, { p_note: string | null }];
    expect(fn).toBe("quicklog_save_manual");
    expect(payload.p_note).toBe("New pistils on the top cola");
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-note-first-save-state")).toHaveAttribute(
        "data-state",
        "saved",
      ),
    );
    expect(screen.getByTestId("qlv2-note-first-save-state")).toHaveTextContent("Saved");
  });

  it("shows a failed state with retry and keeps the note when the save fails", async () => {
    rpcMock.mockRejectedValue(new Error("network down"));
    renderSheet();
    fireEvent.change(noteBox(), { target: { value: "Leaf edges curling" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-note-first-save-state")).toHaveAttribute(
        "data-state",
        "failed",
      ),
    );
    expect(screen.getByTestId("qlv2-note-first-save-state")).toHaveTextContent(/try again/i);
    expect(noteBox().value).toBe("Leaf edges curling");
    expect(screen.getByTestId("qlv2-save")).toHaveTextContent(/retry|save/i);
  });
});
