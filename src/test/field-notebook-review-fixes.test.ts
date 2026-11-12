import { describe, expect, it } from "vitest";
import {
  applyTransport,
  emptyDraft,
  maySubmit,
  reconcileAttempt,
  type FieldNotebookAttempt,
  type FieldNotebookServerEntry,
} from "@/lib/fieldNotebookOutcomeRules";
import { vpdAllowed, type ReadingSlot } from "@/lib/fieldNotebookViewModel";
import { reflectionFromEvidence } from "@/lib/fieldNotebookReflection";

const attempt: FieldNotebookAttempt = {
  attemptId: "a1",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: "Bud sites are building.",
  idempotencyKey: "idem-1",
};

const entry: FieldNotebookServerEntry = {
  growEventId: "11111111-1111-4111-8111-111111111111",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: attempt.note,
  occurredAt: "2025-01-08T15:24:00.000Z",
};

const pending = {
  timelineHasEntry: false,
  countIncludesEntry: false,
  lastActivityIncludesEntry: false,
};

function slot(value: string | null): ReadingSlot {
  return { label: "TEMP", value, source: "EcoWitt", ageLabel: "3 min ago", capturedAtMs: 1 };
}

describe("field notebook review fixes", () => {
  it("does not open a second save for the completed note", () => {
    const draft = {
      ...emptyDraft("flower"),
      note: attempt.note,
      completedNote: attempt.note,
      phase: "editing" as const,
    };
    expect(maySubmit(draft)).toBe(false);
    expect(maySubmit({ ...draft, note: "a new observation" })).toBe(true);
  });

  it("keeps a pre-dispatch refusal editable", () => {
    const draft = {
      ...emptyDraft("flower"),
      note: "still here",
      phase: "saving" as const,
      attempt,
    };
    const next = applyTransport(
      draft,
      { kind: "not_dispatched", reason: "save_in_flight" },
      pending,
    );
    expect(next.phase).toBe("editing");
    expect(next.writeBlocked).toBe(false);
    expect(next.note).toBe("still here");
  });

  it("does not let another tent's receipt confirm this note", () => {
    const draft = {
      ...emptyDraft("veg"),
      note: "veg note",
      attempt: { ...attempt, tentId: "veg" },
    };
    const next = applyTransport(
      draft,
      { kind: "acknowledged", entry: { ...entry, tentId: "flower" } },
      { timelineHasEntry: true, countIncludesEntry: true, lastActivityIncludesEntry: true },
    );
    expect(next.phase).not.toBe("saved");
    expect(next.knownEventId).toBeNull();
  });

  it("treats an unreadable receipt as unresolved rather than no match", () => {
    expect(reconcileAttempt(null, [], "unavailable")).toEqual({ status: "unresolved" });
    expect(reconcileAttempt(entry.growEventId, [], "unavailable")).toEqual({
      status: "unresolved",
    });
  });

  it("withholds VPD when TEMP is blank", () => {
    expect(vpdAllowed(slot(""), slot("52%"))).toBe(false);
    expect(vpdAllowed(slot("76°F"), slot("52%"))).toBe(true);
  });

  it("requires each reflection flag from its own evidence", () => {
    const flags = reflectionFromEvidence({
      timelineCaches: [[{ id: entry.growEventId }]],
      recentItems: [{ id: "something-else" }],
      growEventId: entry.growEventId,
    });
    expect(flags.timelineHasEntry).toBe(true);
    expect(flags.countIncludesEntry).toBe(true);
    expect(flags.lastActivityIncludesEntry).toBe(false);
  });
});
