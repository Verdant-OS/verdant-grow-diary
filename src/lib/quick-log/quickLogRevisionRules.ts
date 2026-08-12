/**
 * Quick Log Corrections & Retractions v1 — pure rules (issue #786).
 *
 * Contracts and deterministic helpers for the append-only revision ledger
 * (public.quicklog_entry_revisions) and the retraction marker
 * (diary_entries.retracted_at / grow_events.is_deleted).
 *
 * Safety posture:
 *  - No I/O in this module. Deterministic, null-safe, injectable time.
 *  - Corrections and retractions are core Free behavior: nothing in this
 *    module (or the service/hooks built on it) may consult plan, tier, or
 *    entitlement state.
 *  - Legacy rows without revision metadata must resolve to a quiet default
 *    (no badge, visible, never a crash).
 */

export const QUICKLOG_REVISION_REASON_CODES = [
  "wrong_plant",
  "wrong_tent",
  "wrong_time",
  "typo",
  "wrong_value",
  "duplicate",
  "test_entry",
  "accidental",
  "other",
] as const;

export type QuickLogRevisionReasonCode = (typeof QUICKLOG_REVISION_REASON_CODES)[number];

export const QUICKLOG_REVISION_REASON_LABELS: Record<QuickLogRevisionReasonCode, string> = {
  wrong_plant: "Wrong plant",
  wrong_tent: "Wrong tent",
  wrong_time: "Wrong time",
  typo: "Typo",
  wrong_value: "Wrong value",
  duplicate: "Duplicate",
  test_entry: "Test entry",
  accidental: "Logged by accident",
  other: "Other",
};

/** Chips offered when correcting an entry. */
export const QUICKLOG_CORRECTION_REASON_CHIPS: QuickLogRevisionReasonCode[] = [
  "wrong_plant",
  "typo",
  "wrong_time",
  "wrong_value",
  "other",
];

/** Chips offered when retracting an entry. */
export const QUICKLOG_RETRACTION_REASON_CHIPS: QuickLogRevisionReasonCode[] = [
  "accidental",
  "test_entry",
  "duplicate",
  "wrong_plant",
  "other",
];

export const QUICKLOG_REVISION_NOTE_MAX_LENGTH = 500;
export const QUICKLOG_CORRECTED_NOTE_MAX_LENGTH = 4000;

export const QUICKLOG_RETRACT_DIALOG_TITLE = "Retract this Quick Log?";
export const QUICKLOG_RETRACT_DIALOG_BODY =
  "This removes the entry from your active history, summaries, and AI context. " +
  "The original entry and this retraction stay in your audit trail — nothing is deleted.";
export const QUICKLOG_RETRACT_CONFIRM_LABEL = "Retract entry";
export const QUICKLOG_CORRECT_DIALOG_TITLE = "Correct this Quick Log";
export const QUICKLOG_CORRECT_DIALOG_BODY = "The original values are kept in the entry's history.";
export const QUICKLOG_EDITED_BADGE_LABEL = "edited";
export const QUICKLOG_RETRACTED_BADGE_LABEL = "retracted";

export type QuickLogRevisionKind = "correction" | "retraction";

/** Raw ledger row as selected from public.quicklog_entry_revisions. */
export interface QuickLogRevisionRow {
  id: string;
  grow_event_id: string | null;
  diary_entry_id: string | null;
  root_id: string;
  user_id: string;
  actor_id: string;
  revision_no: number;
  kind: string;
  reason_code: string;
  reason_note: string | null;
  previous_state: unknown;
  new_state: unknown;
  created_at: string;
}

export interface QuickLogRevision {
  id: string;
  rootId: string;
  growEventId: string | null;
  diaryEntryId: string | null;
  revisionNo: number;
  kind: QuickLogRevisionKind;
  reasonCode: QuickLogRevisionReasonCode;
  reasonNote: string | null;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown> | null;
  createdAt: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Parse one ledger row. Malformed rows return null instead of throwing so a
 * single bad row can never take down a timeline surface.
 */
export function parseQuickLogRevisionRow(
  row: QuickLogRevisionRow | null | undefined,
): QuickLogRevision | null {
  if (!row || !isNonEmptyString(row.id) || !isNonEmptyString(row.root_id)) {
    return null;
  }
  if (row.kind !== "correction" && row.kind !== "retraction") return null;
  if (!Number.isInteger(row.revision_no) || (row.revision_no as number) < 1) {
    return null;
  }
  const reason = (QUICKLOG_REVISION_REASON_CODES as readonly string[]).includes(row.reason_code)
    ? (row.reason_code as QuickLogRevisionReasonCode)
    : null;
  if (!reason) return null;
  if (!isNonEmptyString(row.created_at)) return null;
  return {
    id: row.id,
    rootId: row.root_id,
    growEventId: row.grow_event_id ?? null,
    diaryEntryId: row.diary_entry_id ?? null,
    revisionNo: row.revision_no,
    kind: row.kind,
    reasonCode: reason,
    reasonNote: isNonEmptyString(row.reason_note) ? row.reason_note : null,
    previousState: isPlainObject(row.previous_state) ? row.previous_state : {},
    newState: isPlainObject(row.new_state) ? row.new_state : null,
    createdAt: row.created_at,
  };
}

/** Deterministic order: revision_no ascending, id as an explicit tiebreaker. */
export function sortQuickLogRevisions(revisions: readonly QuickLogRevision[]): QuickLogRevision[] {
  return [...revisions].sort((a, b) => {
    if (a.revisionNo !== b.revisionNo) return a.revisionNo - b.revisionNo;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface QuickLogRevisionBadge {
  correctionCount: number;
  retracted: boolean;
  lastRevisionAt: string | null;
}

/** Legacy default: entries with no ledger rows are badge-free. */
export const EMPTY_QUICKLOG_REVISION_BADGE: QuickLogRevisionBadge = {
  correctionCount: 0,
  retracted: false,
  lastRevisionAt: null,
};

/**
 * Group parsed ledger rows by root id into compact badge state for the
 * timeline/history surfaces. Roots absent from the map are untouched legacy
 * entries and must render exactly as before.
 */
export function buildQuickLogRevisionBadges(
  rows: readonly (QuickLogRevisionRow | null | undefined)[] | null | undefined,
): Map<string, QuickLogRevisionBadge> {
  const badges = new Map<string, QuickLogRevisionBadge>();
  if (!rows) return badges;
  for (const raw of rows) {
    const rev = parseQuickLogRevisionRow(raw);
    if (!rev) continue;
    const prior = badges.get(rev.rootId) ?? { ...EMPTY_QUICKLOG_REVISION_BADGE };
    const next: QuickLogRevisionBadge = {
      correctionCount: prior.correctionCount + (rev.kind === "correction" ? 1 : 0),
      retracted: prior.retracted || rev.kind === "retraction",
      lastRevisionAt:
        prior.lastRevisionAt === null || prior.lastRevisionAt < rev.createdAt
          ? rev.createdAt
          : prior.lastRevisionAt,
    };
    badges.set(rev.rootId, next);
  }
  return badges;
}

/** Row shapes the retraction predicate accepts (diary reads select details + retracted_at). */
export interface RetractableDiaryRowLike {
  retracted_at?: string | null;
}

/**
 * Operational-read predicate for diary rows. Null/undefined (legacy rows and
 * readers that have not selected the column) means NOT retracted.
 */
export function isRetractedDiaryRow(row: RetractableDiaryRowLike | null | undefined): boolean {
  return typeof row?.retracted_at === "string" && row.retracted_at.length > 0;
}

export interface QuickLogCorrectionChanges {
  note?: string | null;
  occurredAt?: string;
  targetType?: "plant" | "tent";
  targetId?: string;
}

export type QuickLogCorrectionValidation =
  | { ok: true; changes: Record<string, unknown> }
  | { ok: false; reason: "no_changes" | "invalid_changes" | "invalid_note" };

/**
 * Client-side pre-validation mirroring the RPC's checks. The RPC remains
 * authoritative; this exists so the dialog can fail fast and calmly.
 */
export function validateQuickLogCorrection(
  input: QuickLogCorrectionChanges | null | undefined,
  reasonNote?: string | null,
  now: () => Date = () => new Date(),
): QuickLogCorrectionValidation {
  if (reasonNote && reasonNote.length > QUICKLOG_REVISION_NOTE_MAX_LENGTH) {
    return { ok: false, reason: "invalid_note" };
  }
  if (!input) return { ok: false, reason: "no_changes" };
  const changes: Record<string, unknown> = {};
  if (input.note !== undefined) {
    if (typeof input.note === "string" && input.note.length > QUICKLOG_CORRECTED_NOTE_MAX_LENGTH) {
      return { ok: false, reason: "invalid_changes" };
    }
    changes.note = input.note;
  }
  if (input.occurredAt !== undefined) {
    const parsed = Date.parse(input.occurredAt);
    if (Number.isNaN(parsed)) return { ok: false, reason: "invalid_changes" };
    if (parsed > now().getTime() + 5 * 60 * 1000) {
      return { ok: false, reason: "invalid_changes" };
    }
    changes.occurred_at = input.occurredAt;
  }
  const hasType = input.targetType !== undefined;
  const hasId = input.targetId !== undefined;
  if (hasType !== hasId) return { ok: false, reason: "invalid_changes" };
  if (hasType) {
    if (input.targetType !== "plant" && input.targetType !== "tent") {
      return { ok: false, reason: "invalid_changes" };
    }
    if (!isNonEmptyString(input.targetId)) {
      return { ok: false, reason: "invalid_changes" };
    }
    changes.target_type = input.targetType;
    changes.target_id = input.targetId;
  }
  if (Object.keys(changes).length === 0) {
    return { ok: false, reason: "no_changes" };
  }
  return { ok: true, changes };
}

export interface QuickLogEntryHandleRef {
  growEventId?: string;
  diaryEntryId?: string;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Resolve the correction/retraction handle for one loose raw entry as seen
 * by the history panels. Returns null for rows that cannot be identified as
 * Quick Log entries — those keep their existing Edit/Remove controls and get
 * no new affordances (legacy-safe default).
 */
export function resolveQuickLogEntryHandle(
  raw: { id?: unknown; details?: unknown } | null | undefined,
): QuickLogEntryHandleRef | null {
  if (!raw) return null;
  const id = nonEmpty(raw.id);
  const details = isPlainObject(raw.details) ? raw.details : null;
  if (!details) return null;
  const origin = nonEmpty(details.origin_grow_event_id);
  if (origin) return { growEventId: origin };
  const linked = nonEmpty(details.linked_grow_event_id) ?? nonEmpty(details.grow_event_id);
  if (linked) return { growEventId: linked };
  if (!id) return null;
  if (
    "quick_log_version" in details ||
    details.event_type === "quicklog_photo_attachment" ||
    details.kind === "pheno_evidence_receipt"
  ) {
    return { diaryEntryId: id };
  }
  return null;
}

/**
 * Index raw entries by their row id so history rows (which only keep the id)
 * can look their handle back up. Rows without a handle are simply absent.
 */
export function buildQuickLogEntryHandleIndex(
  rawEntries: readonly unknown[] | null | undefined,
): Map<string, QuickLogEntryHandleRef> {
  const index = new Map<string, QuickLogEntryHandleRef>();
  for (const raw of rawEntries ?? []) {
    if (!isPlainObject(raw)) continue;
    const id = nonEmpty(raw.id);
    if (!id) continue;
    const handle = resolveQuickLogEntryHandle(raw);
    if (handle) index.set(id, handle);
  }
  return index;
}

/** Root id used for badge lookups: the spine id when present, else the diary id. */
export function handleRootId(handle: QuickLogEntryHandleRef): string {
  return handle.growEventId ?? handle.diaryEntryId ?? "";
}

/** Calm copy for expected RPC failure reasons. */
export const QUICKLOG_REVISION_FAILURE_COPY: Record<string, string> = {
  not_authenticated: "Sign in to change this entry.",
  missing_root: "This entry could not be identified.",
  not_found_or_not_owned: "This entry could not be found in your diary.",
  not_quicklog: "Only Quick Log entries can be changed here.",
  already_retracted: "This entry was already retracted.",
  invalid_reason: "Pick a reason for the change.",
  invalid_note: "The note is too long.",
  no_changes: "Nothing to change yet.",
  unsupported_change: "That change is not supported for this entry.",
  invalid_changes: "Those changes could not be applied.",
  target_not_owned: "That plant or tent is not in your grows.",
  grow_not_owned: "That grow is not yours.",
  rpc_error: "The change could not be saved. Try again.",
};

export function quickLogRevisionFailureCopy(reason: string | null | undefined): string {
  if (reason && QUICKLOG_REVISION_FAILURE_COPY[reason]) {
    return QUICKLOG_REVISION_FAILURE_COPY[reason];
  }
  return QUICKLOG_REVISION_FAILURE_COPY.rpc_error;
}
