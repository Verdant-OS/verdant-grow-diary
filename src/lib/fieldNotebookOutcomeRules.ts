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
): ReconcileResult {
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
  /** True after an uncertain outcome until the grower confirms J1. Blocks a new write. */
  writeBlocked: boolean;
}

export function emptyDraft(tentId: string): NotebookDraft {
  return {
    tentId,
    note: "",
    phase: "editing",
    attempt: null,
    knownEventId: null,
    serverOccurredAt: null,
    writeBlocked: false,
  };
}

export function applyTransport(
  draft: NotebookDraft,
  transport: SaveTransport,
  reflection: RefreshReflection,
): NotebookDraft {
  if (transport.kind === "acknowledged") {
    const next: NotebookDraft = {
      ...draft,
      knownEventId: transport.entry.growEventId,
      serverOccurredAt: transport.entry.occurredAt,
      note: draft.note,
    };
    if (canPresentSaved(transport, reflection)) {
      return { ...next, phase: "saved", writeBlocked: false };
    }
    return { ...next, phase: "uncertain", writeBlocked: true };
  }
  if (isClearFailure(transport)) {
    return { ...draft, phase: "clear_failure", writeBlocked: false };
  }
  return { ...draft, phase: "uncertain", writeBlocked: true, knownEventId: draft.knownEventId };
}

/** J2 "Back to note" keeps the uncertain attempt. It does not open a new save. */
export function backToNote(draft: NotebookDraft): NotebookDraft {
  return { ...draft, phase: "uncertain", writeBlocked: true };
}

/** J1 acknowledgement is the only path that clears the draft. */
export function acknowledgeFound(draft: NotebookDraft): NotebookDraft {
  return emptyDraft(draft.tentId);
}

export function mayRetry(draft: NotebookDraft): boolean {
  return draft.phase === "clear_failure" && !draft.writeBlocked;
}

export function maySubmit(draft: NotebookDraft): boolean {
  return draft.phase === "editing" && !draft.writeBlocked;
}
