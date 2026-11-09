/**
 * Field notebook save outcomes (Direction A, slice 1).
 *
 * Pure. No clock, no I/O. The caller supplies the server timestamp and
 * whether Timeline, the entry count, and Last Activity already show the
 * saved row. A client clock must never be passed in as server time.
 *
 * Clear failure: evidence this attempt did not create an entry.
 * Uncertain: the write may have landed. No retry, no second write.
 */

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
  | { kind: "acknowledged"; entry: FieldNotebookServerEntry };

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
  /** In-memory only. Reload persistence is issue #2806 and is not this slice. */
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
  if (transport.kind === "acknowledged") {
    const sameTent = transport.entry.tentId === draft.tentId;
    const sameNote = !draft.attempt || transport.entry.note === draft.attempt.note;
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
        completedNote: transport.entry.note,
        recoverySurface: "grow",
      };
    }
    return { ...next, phase: "uncertain", writeBlocked: true };
  }
  if (isClearFailure(transport)) {
    return { ...draft, phase: "clear_failure", writeBlocked: false, recoverySurface: "grow" };
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

/** J2 "Back to note" keeps the uncertain attempt. It does not open a new save. */
export function backToNote(draft: NotebookDraft): NotebookDraft {
  return { ...draft, phase: "uncertain", writeBlocked: true };
}

/**
 * J1 clears the confirmed attempt. Text typed after that attempt was submitted
 * stays in the editor.
 */
export function acknowledgeFound(draft: NotebookDraft): NotebookDraft {
  const cleared = emptyDraft(draft.tentId);
  const submitted = draft.attempt?.note;
  if (submitted != null && draft.note !== submitted) {
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
  const verified =
    reconciled.status === "found" &&
    started.attempt &&
    reconciled.entry.note === started.attempt.note &&
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

export function maySubmit(draft: NotebookDraft): boolean {
  if (draft.phase !== "editing" || draft.writeBlocked) return false;
  if (draft.completedNote !== null && draft.note === draft.completedNote) return false;
  return true;
}
