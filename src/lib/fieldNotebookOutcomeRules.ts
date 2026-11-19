/**
 * Field notebook save outcomes (Direction A, slice 1).
 *
 * Pure. No clock, no I/O. The caller supplies the server timestamp and
 * whether Timeline, the entry count, and Last Activity already show the
 * saved row. A client clock must never be passed in as server time.
 *
 * Clear failure: offline before the first send, or a definitive rejection
 * that proves no row. An offline Save again after an uncertain send stays
 * uncertain and keeps that key. The note stays. Save again resends the
 * same idempotency key. A retracted key is a follow-up, not this slice.
 */

import { definitiveRejectionProvesNoRow } from "@/lib/quickLogManualRejectionRules";

export type FieldNotebookPhase =
  "editing" | "saving" | "saved" | "clear_failure" | "uncertain" | "check_found" | "check_none";

export interface FieldNotebookAttempt {
  attemptId: string;
  tentId: string;
  tentName: string;
  note: string;
  idempotencyKey: string;
}

export interface FieldNotebookServerEntry {
  growEventId: string;
  tentId: string;
  tentName: string;
  note: string;
  /** Authoritative server timestamp (ISO). */
  occurredAt: string;
}

export type SaveTransport =
  | { kind: "offline_before_dispatch" }
  | { kind: "definitive_rejection"; reason: string }
  | { kind: "dispatched_no_receipt" }
  | { kind: "timeout_after_dispatch" }
  | { kind: "connection_lost_after_dispatch" }
  | { kind: "http_error_after_dispatch"; status: number }
  | { kind: "not_dispatched"; reason: string }
  | { kind: "acknowledged"; entry: FieldNotebookServerEntry }
  | { kind: "idempotency_retracted" };

export interface RefreshReflection {
  timelineHasEntry: boolean;
  countIncludesEntry: boolean;
  lastActivityIncludesEntry: boolean;
}

export function reflectionComplete(reflection: RefreshReflection): boolean {
  return (
    reflection.timelineHasEntry &&
    reflection.countIncludesEntry &&
    reflection.lastActivityIncludesEntry
  );
}

export function isClearFailure(transport: SaveTransport): boolean {
  if (transport.kind === "offline_before_dispatch") return true;
  if (transport.kind === "definitive_rejection") return true;
  return false;
}

export function isUncertain(transport: SaveTransport): boolean {
  switch (transport.kind) {
    case "dispatched_no_receipt":
    case "timeout_after_dispatch":
    case "connection_lost_after_dispatch":
    case "http_error_after_dispatch":
      return true;
    case "offline_before_dispatch":
    case "definitive_rejection":
    case "not_dispatched":
    case "acknowledged":
    case "idempotency_retracted":
      return false;
    default: {
      const _never: never = transport;
      return _never;
    }
  }
}

/**
 * A confirmed write whose refresh has not caught up is not a failed save.
 * Retry stays disabled. The saved line stays hidden until reflection is complete
 * and the entry carries an authoritative timestamp.
 */
export function canPresentSaved(transport: SaveTransport, reflection: RefreshReflection): boolean {
  if (transport.kind !== "acknowledged") return false;
  if (!transport.entry.occurredAt || Number.isNaN(Date.parse(transport.entry.occurredAt))) {
    return false;
  }
  if (!transport.entry.growEventId) return false;
  return reflectionComplete(reflection);
}

export interface ReconcileInput {
  attempt: FieldNotebookAttempt;
  /** Entries returned by an authoritative read, already scoped by the caller. */
  candidates: FieldNotebookServerEntry[];
}

export type ReconcileResult =
  | { status: "found"; entry: FieldNotebookServerEntry }
  | { status: "none" }
  | { status: "unresolved" };

/**
 * Match only on the attempt's known grow event id when the caller has one,
 * or on a single candidate whose id was recorded for this idempotency key.
 * Tent name, note text, and a nearby timestamp never establish identity.
 * More than one id-matched row stays unresolved.
 */
export function reconcileAttempt(
  knownEventId: string | null,
  candidates: FieldNotebookServerEntry[],
  availability: "authoritative" | "unavailable" = "authoritative",
): ReconcileResult {
  if (availability === "unavailable") return { status: "unresolved" };
  if (!knownEventId) {
    return candidates.length === 0 ? { status: "none" } : { status: "unresolved" };
  }
  const matches = candidates.filter((c) => c.growEventId === knownEventId);
  if (matches.length === 1) return { status: "found", entry: matches[0]! };
  if (matches.length === 0) return { status: "none" };
  return { status: "unresolved" };
}

export interface NotebookDraft {
  tentId: string;
  note: string;
  /** Uncertain notes persist per signed-in account. Other phases stay in memory. */
  phase: FieldNotebookPhase;
  attempt: FieldNotebookAttempt | null;
  knownEventId: string | null;
  serverOccurredAt: string | null;
  /** Verified row for this attempt. Never the live textarea. */
  verifiedEntry: FieldNotebookServerEntry | null;
  /** Note text that already completed. A second save requires an edit. */
  completedNote: string | null;
  /** True after an uncertain outcome until the grower confirms J1. Blocks a new write. */
  writeBlocked: boolean;
  /** The server retired this attempt's key. Save again stays hidden. A new attempt is a follow-up. */
  idempotencyRetracted?: boolean;
  recoverySurface: "grow" | "timeline";
}

export function emptyDraft(tentId: string): NotebookDraft {
  return {
    tentId,
    note: "",
    phase: "editing",
    attempt: null,
    knownEventId: null,
    serverOccurredAt: null,
    verifiedEntry: null,
    completedNote: null,
    writeBlocked: false,
    recoverySurface: "grow",
  };
}

export function applyTransport(
  draft: NotebookDraft,
  transport: SaveTransport,
  reflection: RefreshReflection,
): NotebookDraft {
  if (transport.kind === "not_dispatched") {
    return {
      ...draft,
      phase: draft.phase === "saving" ? "editing" : draft.phase,
      writeBlocked: false,
    };
  }
  if (transport.kind === "idempotency_retracted") {
    return {
      ...draft,
      phase: "uncertain",
      writeBlocked: true,
      idempotencyRetracted: true,
      note: draft.attempt?.note ?? draft.note,
      knownEventId: null,
      verifiedEntry: null,
      serverOccurredAt: null,
    };
  }
  if (transport.kind === "acknowledged") {
    const sameTent = transport.entry.tentId === draft.tentId;
    const sameNote =
      !draft.attempt || notesMatchCanonical(transport.entry.note, draft.attempt.note);
    if (!sameTent || !sameNote) {
      return {
        ...draft,
        phase: "uncertain",
        writeBlocked: true,
        knownEventId: null,
        verifiedEntry: null,
      };
    }
    const next: NotebookDraft = {
      ...draft,
      knownEventId: transport.entry.growEventId,
      serverOccurredAt: transport.entry.occurredAt,
      verifiedEntry: transport.entry,
      note: draft.note,
    };
    if (canPresentSaved(transport, reflection)) {
      return {
        ...next,
        phase: "saved",
        writeBlocked: false,
        completedNote: canonicalNotebookNote(transport.entry.note),
        recoverySurface: "grow",
      };
    }
    return { ...next, phase: "uncertain", writeBlocked: true };
  }
  if (isClearFailure(transport)) {
    const resendMayHaveLanded = draft.writeBlocked && draft.attempt != null;
    const offlineResend = resendMayHaveLanded && transport.kind === "offline_before_dispatch";
    const rejectionDoesNotProveNoRow =
      resendMayHaveLanded &&
      transport.kind === "definitive_rejection" &&
      !definitiveRejectionProvesNoRow(transport.reason);
    if (offlineResend || rejectionDoesNotProveNoRow) {
      return {
        ...draft,
        phase: "uncertain",
        writeBlocked: true,
        note: draft.attempt?.note ?? draft.note,
      };
    }
    return {
      ...draft,
      phase: "clear_failure",
      writeBlocked: false,
      note: draft.attempt?.note ?? draft.note,
      recoverySurface: "grow",
    };
  }
  return {
    ...draft,
    phase: "uncertain",
    writeBlocked: true,
    knownEventId: null,
    verifiedEntry: null,
    serverOccurredAt: null,
  };
}

/** J2 "Back to note" keeps the text visible. It does not open a new save. */
export function backToNote(draft: NotebookDraft): NotebookDraft {
  return { ...draft, note: draft.note, phase: "uncertain", writeBlocked: true };
}

/**
 * J1 clears the confirmed attempt. Text typed after that attempt was submitted
 * stays in the editor.
 */
export function acknowledgeFound(draft: NotebookDraft): NotebookDraft {
  const cleared = emptyDraft(draft.tentId);
  const submitted = draft.attempt?.note;
  if (submitted != null && !notesMatchCanonical(draft.note, submitted)) {
    return { ...cleared, note: draft.note };
  }
  return cleared;
}

/** Apply a Timeline check without replacing text typed while the read was in flight. */
export function draftAfterTimelineCheck(
  started: NotebookDraft,
  liveNote: string,
  reconciled: ReconcileResult,
): NotebookDraft {
  const note = liveNote;
  // No event id, a missing row, or an unavailable lookup does not prove the
  // write failed. Keep the submitted attempt fixed. Check Timeline and
  // same-key Save again stay available. A retracted key does not.
  if (!started.knownEventId && reconciled.status !== "found") {
    return {
      ...started,
      note,
      phase: "uncertain",
      verifiedEntry: null,
      knownEventId: null,
      serverOccurredAt: null,
      writeBlocked: true,
      recoverySurface: "grow",
    };
  }
  const verified =
    reconciled.status === "found" &&
    started.attempt &&
    notesMatchCanonical(reconciled.entry.note, started.attempt.note) &&
    reconciled.entry.tentId === started.tentId
      ? reconciled.entry
      : null;
  if (verified) {
    return {
      ...started,
      note,
      phase: "check_found",
      verifiedEntry: verified,
      serverOccurredAt: verified.occurredAt,
      knownEventId: verified.growEventId,
      writeBlocked: true,
      recoverySurface: "timeline",
    };
  }
  if (reconciled.status === "none") {
    return {
      ...started,
      note,
      phase: "check_none",
      verifiedEntry: null,
      writeBlocked: true,
      recoverySurface: "timeline",
    };
  }
  return {
    ...started,
    note,
    phase: "uncertain",
    verifiedEntry: null,
    writeBlocked: true,
    recoverySurface: "grow",
  };
}

export function mayRetry(draft: NotebookDraft): boolean {
  return draft.phase === "clear_failure" && !draft.writeBlocked;
}

/** Text the save payload actually writes. The editor snapshot stays untrimmed. */
export function canonicalNotebookNote(note: string): string {
  return note.trim();
}

/** Receipt and duplicate identity. Padding does not make a second note. */
export function notesMatchCanonical(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (left == null || right == null) return false;
  return canonicalNotebookNote(left) === canonicalNotebookNote(right);
}

export function maySubmit(draft: NotebookDraft): boolean {
  if (draft.writeBlocked) return false;
  if (draft.phase === "uncertain" || draft.phase === "saving") return false;
  if (draft.phase === "saved") {
    return (
      draft.completedNote !== null &&
      !notesMatchCanonical(draft.note, draft.completedNote) &&
      canonicalNotebookNote(draft.note).length > 0
    );
  }
  if (canonicalNotebookNote(draft.note).length === 0) return false;
  if (draft.phase !== "editing") return false;
  if (draft.completedNote !== null && notesMatchCanonical(draft.note, draft.completedNote)) {
    return false;
  }
  return true;
}
