import { describe, expect, it } from "vitest";
import {
  acknowledgeFound,
  applyTransport,
  backToNote,
  canPresentSaved,
  emptyDraft,
  isClearFailure,
  isUncertain,
  mayRetry,
  maySubmit,
  reconcileAttempt,
  type FieldNotebookAttempt,
  type FieldNotebookServerEntry,
  type RefreshReflection,
} from "@/lib/fieldNotebookOutcomeRules";
import {
  FIELD_NOTEBOOK_EMPTY_NOTE_PLACEHOLDER,
  FIELD_NOTEBOOK_READING_MISSING,
  formatReadingProvenance,
  formatSavedLine,
  statusView,
  vpdAllowed,
  type ReadingSlot,
} from "@/lib/fieldNotebookViewModel";

const attempt: FieldNotebookAttempt = {
  attemptId: "a1",
  tentId: "tent-flower",
  tentName: "Flower Tent 2",
  note: "Bud sites are building.",
  idempotencyKey: "idem-1",
};

const entry: FieldNotebookServerEntry = {
  growEventId: "11111111-1111-1111-1111-111111111111",
  tentId: "tent-flower",
  tentName: "Flower Tent 2",
  note: attempt.note,
  occurredAt: "2025-01-08T15:24:00.000Z",
};

const reflected: RefreshReflection = {
  timelineHasEntry: true,
  countIncludesEntry: true,
  lastActivityIncludesEntry: true,
};

const pending: RefreshReflection = {
  timelineHasEntry: false,
  countIncludesEntry: false,
  lastActivityIncludesEntry: false,
};

function slot(partial: Partial<ReadingSlot>): ReadingSlot {
  return {
    label: "TEMP",
    value: "76°F",
    source: "EcoWitt",
    ageLabel: "3 min ago",
    capturedAtMs: 1_000,
    ...partial,
  };
}

describe("field notebook outcomes", () => {
  it("treats offline-before-dispatch and a definitive rejection as clear failure", () => {
    expect(isClearFailure({ kind: "offline_before_dispatch" })).toBe(true);
    expect(isClearFailure({ kind: "definitive_rejection", reason: "validation" })).toBe(true);
    expect(isUncertain({ kind: "offline_before_dispatch" })).toBe(false);
  });

  it("treats timeout, connection loss, and HTTP after dispatch as uncertain", () => {
    expect(isUncertain({ kind: "timeout_after_dispatch" })).toBe(true);
    expect(isUncertain({ kind: "connection_lost_after_dispatch" })).toBe(true);
    expect(isUncertain({ kind: "http_error_after_dispatch", status: 500 })).toBe(true);
    expect(isClearFailure({ kind: "http_error_after_dispatch", status: 500 })).toBe(false);
  });

  it("hides the saved line until reflection is complete and a server timestamp exists", () => {
    const ack = { kind: "acknowledged" as const, entry };
    expect(canPresentSaved(ack, pending)).toBe(false);
    expect(canPresentSaved(ack, reflected)).toBe(true);
    expect(
      canPresentSaved({ kind: "acknowledged", entry: { ...entry, occurredAt: "" } }, reflected),
    ).toBe(false);
    const draft = emptyDraft("tent-flower");
    draft.note = attempt.note;
    const waiting = applyTransport(draft, ack, pending);
    expect(waiting.phase).toBe("uncertain");
    expect(waiting.writeBlocked).toBe(true);
    expect(mayRetry(waiting)).toBe(false);
    const saved = applyTransport(draft, ack, reflected);
    expect(saved.phase).toBe("saved");
    expect(saved.serverOccurredAt).toBe(entry.occurredAt);
    expect(formatSavedLine("Flower Tent 2", "10:24 AM")).toBe("Saved to Flower Tent 2 · 10:24 AM");
  });

  it("preserves the note on clear failure and allows exactly one retry phase", () => {
    const draft = { ...emptyDraft("tent-flower"), note: "still here" };
    const failed = applyTransport(draft, { kind: "offline_before_dispatch" }, pending);
    expect(failed.note).toBe("still here");
    expect(failed.phase).toBe("clear_failure");
    expect(mayRetry(failed)).toBe(true);
    const view = statusView({
      phase: failed.phase,
      tentName: "Flower Tent 2",
      serverTimeLabel: null,
    });
    expect(view.primaryLabel).toBe("Retry");
    expect(view.showRetry).toBe(true);
    expect(view.showCheckTimeline).toBe(false);
  });

  it("blocks a second write after an uncertain outcome, including Back to note", () => {
    const draft = { ...emptyDraft("tent-flower"), note: "maybe saved", attempt };
    const uncertain = applyTransport(draft, { kind: "dispatched_no_receipt" }, pending);
    expect(uncertain.writeBlocked).toBe(true);
    expect(maySubmit(uncertain)).toBe(false);
    const back = backToNote(uncertain);
    expect(back.note).toBe("maybe saved");
    expect(back.writeBlocked).toBe(true);
    expect(maySubmit(back)).toBe(false);
    expect(mayRetry(back)).toBe(false);
    const view = statusView({
      phase: "check_none",
      tentName: "Flower Tent 2",
      serverTimeLabel: null,
    });
    expect(view.statusLine).toBe("No matching entry found");
    expect(view.primaryLabel).toBe("Back to note");
    expect(view.showRetry).toBe(false);
  });

  it("clears the draft only after the grower confirms the id-matched entry", () => {
    const draft = {
      ...emptyDraft("tent-flower"),
      note: attempt.note,
      phase: "check_found" as const,
      knownEventId: entry.growEventId,
      writeBlocked: true,
    };
    expect(acknowledgeFound(draft)).toEqual(emptyDraft("tent-flower"));
    const found = reconcileAttempt(entry.growEventId, [entry, { ...entry, growEventId: "other" }]);
    expect(found).toEqual({ status: "found", entry });
  });

  it("does not match on note text or tent name, and stays unresolved when several ids match", () => {
    const lookalike: FieldNotebookServerEntry = {
      ...entry,
      growEventId: "22222222-2222-2222-2222-222222222222",
    };
    expect(reconcileAttempt(null, [lookalike])).toEqual({ status: "unresolved" });
    expect(reconcileAttempt(null, [])).toEqual({ status: "none" });
    expect(reconcileAttempt(entry.growEventId, [entry, entry])).toEqual({ status: "unresolved" });
  });

  it("keeps a late acknowledgement for one tent from clearing another tent's draft", () => {
    const flower = { ...emptyDraft("flower"), note: "flower note" };
    const veg = { ...emptyDraft("veg"), note: "veg note" };
    const late = applyTransport(
      flower,
      { kind: "acknowledged", entry: { ...entry, tentId: "flower" } },
      reflected,
    );
    expect(late.tentId).toBe("flower");
    expect(veg.note).toBe("veg note");
    expect(veg.phase).toBe("editing");
  });

  it("shows VPD only when TEMP and RH share a captured instant, and missing readings have no provenance", () => {
    const temp = slot({ label: "TEMP", capturedAtMs: 5_000 });
    const rh = slot({ label: "RH", value: "52%", capturedAtMs: 5_000 });
    const staleRh = slot({ label: "RH", value: "52%", capturedAtMs: 9_000 });
    expect(vpdAllowed(temp, rh)).toBe(true);
    expect(vpdAllowed(temp, staleRh)).toBe(false);
    const missing = slot({
      label: "PPFD",
      value: null,
      source: null,
      ageLabel: null,
      capturedAtMs: null,
    });
    expect(formatReadingProvenance(missing)).toBeNull();
    const zero = slot({ label: "TEMP", value: "0" });
    expect(formatReadingProvenance(zero)).toBe("EcoWitt · 3 min ago");
  });

  it("uses the notebook empty-note placeholder and never the old empty-note warning", () => {
    expect(FIELD_NOTEBOOK_EMPTY_NOTE_PLACEHOLDER).toBe("Add what you observed.");
    expect(FIELD_NOTEBOOK_EMPTY_NOTE_PLACEHOLDER.toLowerCase()).not.toMatch(/note field is empty/);
    expect(FIELD_NOTEBOOK_READING_MISSING).toBe("—");
    const found = statusView({
      phase: "check_found",
      tentName: "Flower Tent 2",
      serverTimeLabel: "10:24 AM",
    });
    expect(found.primaryLabel).toBe("Yes, that's it");
    expect(found.statusLine).toBe("Not sure this saved");
  });
});
