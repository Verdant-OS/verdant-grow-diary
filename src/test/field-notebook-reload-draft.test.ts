import { afterEach, describe, expect, it } from "vitest";
import { emptyDraft } from "@/lib/fieldNotebookOutcomeRules";
import {
  adoptNotebookSessionOwner,
  clearNotebookSession,
  forgetNotebookMemory,
  readNotebookDraft,
  writeNotebookDraft,
} from "@/lib/fieldNotebookSession";

const PREFIX = "verdant:field-notebook-unsaved:";

function editingNote(tentId: string, note: string) {
  return { ...emptyDraft(tentId), note, phase: "editing" as const };
}

describe("field notebook unsaved draft across a full reload", () => {
  afterEach(() => {
    clearNotebookSession();
    forgetNotebookMemory();
  });

  it("restores the same owner's unsaved note after memory is dropped", () => {
    adoptNotebookSessionOwner("owner-a");
    writeNotebookDraft(editingNote("flower", "QA-SYNTH draft run1"));
    forgetNotebookMemory();
    expect(readNotebookDraft("flower").note).toBe("");
    adoptNotebookSessionOwner("owner-a");
    expect(readNotebookDraft("flower").note).toBe("QA-SYNTH draft run1");
    expect(readNotebookDraft("flower").phase).toBe("editing");
    expect(readNotebookDraft("flower").attempt).toBeNull();
  });

  it("does not restore that note for a different signed-in user", () => {
    adoptNotebookSessionOwner("owner-a");
    writeNotebookDraft(editingNote("flower", "QA-SYNTH draft run1"));
    forgetNotebookMemory();
    adoptNotebookSessionOwner("owner-b");
    expect(readNotebookDraft("flower").note).toBe("");
    expect(readNotebookDraft("flower", "owner-b").note).toBe("");
    expect(window.sessionStorage.getItem(`${PREFIX}owner-b`)).toBeNull();
    expect(window.sessionStorage.getItem(`${PREFIX}owner-a`)).toContain("QA-SYNTH draft run1");
  });

  it("clears the persisted note when the owner signs out", () => {
    adoptNotebookSessionOwner("owner-a");
    writeNotebookDraft(editingNote("flower", "QA-SYNTH draft run1"));
    expect(window.sessionStorage.getItem(`${PREFIX}owner-a`)).toContain("QA-SYNTH draft run1");
    adoptNotebookSessionOwner(null);
    expect(window.sessionStorage.getItem(`${PREFIX}owner-a`)).toBeNull();
    forgetNotebookMemory();
    adoptNotebookSessionOwner("owner-a");
    expect(readNotebookDraft("flower").note).toBe("");
  });

  it("clears the persisted note after a successful save", () => {
    adoptNotebookSessionOwner("owner-a");
    writeNotebookDraft(editingNote("flower", "QA-SYNTH draft run1"));
    writeNotebookDraft({
      ...emptyDraft("flower"),
      note: "QA-SYNTH draft run1",
      phase: "saved",
      completedNote: "QA-SYNTH draft run1",
    });
    expect(window.sessionStorage.getItem(`${PREFIX}owner-a`)).toBeNull();
    forgetNotebookMemory();
    adoptNotebookSessionOwner("owner-a");
    expect(readNotebookDraft("flower").note).toBe("");
  });
});
