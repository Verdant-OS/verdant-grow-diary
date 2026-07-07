/**
 * QuickLogV2Sheet — note/payload synchronization.
 *
 * Proves that when the grower enters note text in the V2 sheet, the save
 * payload (`quicklog_save_manual` p_note) receives EXACTLY the visible
 * textarea value — across typing, paste, native input dispatch, IME
 * composition, and blur-before-save.
 *
 * CONTRACT CAUTION (do not change): the V2 note is OPTIONAL. An empty or
 * whitespace-only note saves with p_note = null (see quickLogV2SavePayload).
 * These tests verify synchronization only — they do NOT make the note
 * required, and they do not touch harvest, stage defaults, target panel, or
 * post-save reset behavior. Legacy QuickLog keeps its own note-required
 * preview rule (covered by quick-log-note-sync.test.tsx).
 *
 * Mocks mirror quick-log-v2-refresh-sheet.test.tsx: supabase.rpc, use-plants,
 * use-tents, sonner. No real network, no auth, no writes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import type { ResolvedQuickLogV2Target } from "@/lib/quickLogV2Rules";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
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

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

function noteTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;
}

function clickNoteAction() {
  fireEvent.click(screen.getByRole("button", { name: "Note" }));
}

function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

/** The p_note the sheet actually sent to the save RPC. */
async function savedNote(): Promise<string | null> {
  await waitFor(() => expect(rpcMock).toHaveBeenCalled());
  const [fn, payload] = rpcMock.mock.calls[0] as [string, { p_note: string | null }];
  expect(fn).toBe("quicklog_save_manual");
  return payload.p_note;
}

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({
    data: { ok: true, grow_event_id: "ge-1", environment_event_id: null },
    error: null,
  });
});
afterEach(() => cleanup());

describe("QuickLogV2Sheet note → save payload sync", () => {
  it("typed note: payload p_note equals the exact visible textarea value", async () => {
    renderSheet();
    clickNoteAction();
    const ta = noteTextarea();
    fireEvent.change(ta, { target: { value: "Slight droop on fan leaves" } });
    expect(ta.value).toBe("Slight droop on fan leaves");
    clickSave();
    expect(await savedNote()).toBe(ta.value);
  });

  it("pasted note (onInput path): payload p_note equals the visible value", async () => {
    renderSheet();
    clickNoteAction();
    const ta = noteTextarea();
    // Simulate paste: the browser sets the value then fires 'input' (not
    // React's synthetic change). The onInput sync must mirror it into state.
    ta.value = "Pasted from phone notes";
    fireEvent.input(ta);
    expect(ta.value).toBe("Pasted from phone notes");
    clickSave();
    expect(await savedNote()).toBe("Pasted from phone notes");
  });

  it("native input dispatch: payload p_note equals the visible value", async () => {
    renderSheet();
    clickNoteAction();
    const ta = noteTextarea();
    act(() => {
      ta.value = "Dispatched natively";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    clickSave();
    expect(await savedNote()).toBe("Dispatched natively");
  });

  it("compositionEnd (IME / dictation): payload p_note equals the composed value", async () => {
    renderSheet();
    clickNoteAction();
    const ta = noteTextarea();
    ta.value = "口述の観察メモ";
    fireEvent.compositionEnd(ta, { data: "口述の観察メモ" });
    clickSave();
    expect(await savedNote()).toBe("口述の観察メモ");
  });

  it("blur before save: payload p_note equals the value filled without input events", async () => {
    renderSheet();
    clickNoteAction();
    const ta = noteTextarea();
    // Autofill-like path: value set with no input event, then blur, then save.
    ta.value = "Filled on blur";
    fireEvent.blur(ta);
    clickSave();
    expect(await savedNote()).toBe("Filled on blur");
  });

  it("empty note keeps the existing OPTIONAL contract: saves with p_note null", async () => {
    renderSheet();
    clickNoteAction();
    // No note entered at all — V2 allows this; do not regress it to required.
    clickSave();
    expect(await savedNote()).toBeNull();
  });
});

describe("quickLogV2SavePayload note contract (pure)", () => {
  const resolved: ResolvedQuickLogV2Target = {
    ok: true,
    targetType: "plant",
    targetId: "plant-1",
  } as ResolvedQuickLogV2Target;
  const base = {
    resolved,
    action: "note" as const,
    volumeMl: "",
    temperatureC: "",
    humidityPct: "",
    vpdKpa: "",
  };

  it("an entered note reaches the payload as the exact trimmed value", () => {
    const r = buildQuickLogV2SavePayload({ ...base, note: "  keep this exact text  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.p_note).toBe("keep this exact text");
  });

  it("empty and whitespace-only notes stay OPTIONAL (p_note null, still ok)", () => {
    for (const note of ["", "   ", "\t\n"]) {
      const r = buildQuickLogV2SavePayload({ ...base, note });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.payload.p_note).toBeNull();
    }
  });
});
