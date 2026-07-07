/**
 * Slice A1 — Quick Log note validation sync.
 *
 * Proves the note textarea binding pattern used by the legacy Quick Log
 * (src/components/QuickLog.tsx) keeps three values in agreement at all
 * times:
 *
 *   1. what the grower visibly sees in the textarea
 *   2. what evaluateQuickLogPreview() reads for the note:missing rule
 *   3. what the save handler would submit as the note payload
 *
 * The regression this locks down: React's synthetic `onChange` can be
 * bypassed by native input dispatch (paste, dictation, programmatic
 * events, IME composition), leaving state stale so validation still says
 * "Add a quick note before saving." while the textarea visibly has text.
 *
 * We exercise the exact handler pattern QuickLog uses (onChange +
 * onInput + onCompositionEnd + onBlur) via a minimal harness component
 * so this test stays fast, deterministic, and provider-free.
 *
 * No Supabase. No auth. No writes. No AI. No Action Queue.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useRef, useState } from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { evaluateQuickLogPreview } from "@/lib/quickLogPreviewRules";

afterEach(() => cleanup());

/**
 * Mirrors the QuickLog note textarea binding exactly. Any drift from
 * QuickLog.tsx should be fixed here in lockstep.
 */
function NoteHarness({
  onSubmit,
}: {
  onSubmit?: (payload: { note: string; missing: boolean }) => void;
}) {
  const [note, setNote] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const syncFromEvent = (v: string) =>
    setNote((prev) => (prev === v ? prev : v));

  const preview = evaluateQuickLogPreview({
    note,
    eventType: "observation",
    stage: "veg",
    details: {},
  });
  const missing = preview.warnings.some((w) => w.code === "note:missing");

  return (
    <div>
      <textarea
        data-testid="note"
        ref={ref}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onInput={(e) =>
          syncFromEvent((e.currentTarget as HTMLTextAreaElement).value)
        }
        onCompositionEnd={(e) =>
          syncFromEvent((e.currentTarget as HTMLTextAreaElement).value)
        }
        onBlur={(e) => syncFromEvent(e.currentTarget.value)}
      />
      <span data-testid="missing">{missing ? "yes" : "no"}</span>
      <span data-testid="state-note">{note}</span>
      <button
        type="button"
        data-testid="submit"
        onClick={() => onSubmit?.({ note, missing })}
      >
        Save
      </button>
    </div>
  );
}

function get(id: string) {
  return screen.getByTestId(id);
}

describe("Quick Log note validation sync (Slice A1)", () => {
  it("clears note:missing after typing", () => {
    render(<NoteHarness />);
    expect(get("missing").textContent).toBe("yes");
    fireEvent.change(get("note"), { target: { value: "Looks healthy" } });
    expect(get("missing").textContent).toBe("no");
    expect(get("state-note").textContent).toBe("Looks healthy");
  });

  it("clears note:missing after paste (onInput path)", () => {
    render(<NoteHarness />);
    const ta = get("note") as HTMLTextAreaElement;
    // Simulate paste: browser sets value, then fires 'input' (not React's
    // synthetic change). Our onInput handler must sync state.
    ta.value = "Pasted note text";
    fireEvent.input(ta);
    expect(get("missing").textContent).toBe("no");
    expect(get("state-note").textContent).toBe("Pasted note text");
  });

  it("clears note:missing after a native input dispatch", () => {
    render(<NoteHarness />);
    const ta = get("note") as HTMLTextAreaElement;
    act(() => {
      ta.value = "Dispatched natively";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(get("state-note").textContent).toBe("Dispatched natively");
    expect(get("missing").textContent).toBe("no");
  });

  it("clears note:missing after compositionEnd (IME / dictation)", () => {
    render(<NoteHarness />);
    const ta = get("note") as HTMLTextAreaElement;
    ta.value = "口述筆記";
    fireEvent.compositionEnd(ta, { data: "口述筆記" });
    expect(get("state-note").textContent).toBe("口述筆記");
    expect(get("missing").textContent).toBe("no");
  });

  it("syncs on blur before submit", () => {
    let seen: { note: string; missing: boolean } | null = null;
    render(<NoteHarness onSubmit={(p) => (seen = p)} />);
    const ta = get("note") as HTMLTextAreaElement;
    // Simulate a browser autofill / late paste that never fired input.
    ta.value = "Filled on blur";
    fireEvent.blur(ta);
    fireEvent.click(get("submit"));
    expect(seen).not.toBeNull();
    expect(seen!.note).toBe("Filled on blur");
    expect(seen!.missing).toBe(false);
  });

  it("still flags note:missing for whitespace-only input", () => {
    render(<NoteHarness />);
    fireEvent.change(get("note"), { target: { value: "   \t\n  " } });
    expect(get("missing").textContent).toBe("yes");
  });

  it("save payload note matches what the textarea visibly contains", () => {
    let seen: { note: string; missing: boolean } | null = null;
    render(<NoteHarness onSubmit={(p) => (seen = p)} />);
    const ta = get("note") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "Visible = payload" } });
    fireEvent.click(get("submit"));
    expect(seen!.note).toBe(ta.value);
    expect(seen!.note).toBe("Visible = payload");
    expect(seen!.missing).toBe(false);
  });
});
