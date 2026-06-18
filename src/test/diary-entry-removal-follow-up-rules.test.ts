/**
 * Pure tests for buildCorrectedQuickLogHandoff + dispatcher.
 */
import { describe, it, expect, vi } from "vitest";
import {
  CORRECTED_QUICKLOG_EVENT,
  FOLLOW_UP_ACCESSIBLE_LABEL,
  FOLLOW_UP_BUTTON_LABEL,
  FOLLOW_UP_HELPER_COPY,
  FOLLOW_UP_NOTE_PREFILL,
  buildCorrectedQuickLogHandoff,
  dispatchCorrectedQuickLogHandoff,
} from "@/lib/diaryEntryRemovalFollowUpRules";

describe("buildCorrectedQuickLogHandoff", () => {
  it("always sets eventType=observation and suggestSnapshot=true", () => {
    const p = buildCorrectedQuickLogHandoff({});
    expect(p.eventType).toBe("observation");
    expect(p.suggestSnapshot).toBe(true);
  });

  it("includes tentId/tentName/growId when provided", () => {
    const p = buildCorrectedQuickLogHandoff({
      tentId: "tent-1",
      tentName: "Flower",
      growId: "grow-1",
    });
    expect(p.tentId).toBe("tent-1");
    expect(p.tentName).toBe("Flower");
    expect(p.growId).toBe("grow-1");
  });

  it("NEVER includes plantId or plantName", () => {
    const p = buildCorrectedQuickLogHandoff({
      tentId: "tent-1",
      growId: "grow-1",
      // @ts-expect-error guard: callers must not pass plant identifiers
      plantId: "plant-X",
      // @ts-expect-error guard: callers must not pass plant identifiers
      plantName: "Wrong plant",
    });
    expect((p as Record<string, unknown>).plantId).toBeUndefined();
    expect((p as Record<string, unknown>).plantName).toBeUndefined();
  });

  it("omits whitespace-only / empty strings", () => {
    const p = buildCorrectedQuickLogHandoff({
      tentId: "   ",
      tentName: "",
      growId: null,
    });
    expect(p.tentId).toBeUndefined();
    expect(p.tentName).toBeUndefined();
    expect(p.growId).toBeUndefined();
  });

  it("includes trimmed note when provided", () => {
    const p = buildCorrectedQuickLogHandoff({ note: "  hello  " });
    expect(p.note).toBe("hello");
  });

  it("exposes the required copy constants", () => {
    expect(FOLLOW_UP_BUTTON_LABEL).toBe("Add to correct plant");
    expect(FOLLOW_UP_HELPER_COPY).toBe(
      "Open Quick Log and choose the correct plant for this entry.",
    );
    expect(FOLLOW_UP_ACCESSIBLE_LABEL).toBe(
      "Add corrected Quick Log to the correct plant",
    );
    expect(FOLLOW_UP_NOTE_PREFILL).toBe(
      "Re-entering log after removing it from the wrong plant.",
    );
  });
});

describe("dispatchCorrectedQuickLogHandoff", () => {
  it("dispatches the reused open-quicklog event with the built payload", () => {
    const listener = vi.fn();
    const target = { dispatchEvent: vi.fn((ev: Event) => { listener(ev); return true; }) };
    const payload = dispatchCorrectedQuickLogHandoff(
      { tentId: "t1", growId: "g1", note: "n" },
      target,
    );
    expect(target.dispatchEvent).toHaveBeenCalledTimes(1);
    const ev = listener.mock.calls[0][0] as CustomEvent;
    expect(ev.type).toBe(CORRECTED_QUICKLOG_EVENT);
    expect(CORRECTED_QUICKLOG_EVENT).toBe("verdant:open-quicklog");
    expect(ev.detail).toEqual(payload);
    expect(payload.tentId).toBe("t1");
    expect(payload.growId).toBe("g1");
    expect(payload.note).toBe("n");
    expect((payload as Record<string, unknown>).plantId).toBeUndefined();
  });
});
