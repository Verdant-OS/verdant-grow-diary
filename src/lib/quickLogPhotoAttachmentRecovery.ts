/**
 * Browser-session recovery fence for an unconfirmed standalone Quick Log
 * photo diary insert.
 *
 * The database write helper already reconciles the exact preallocated diary
 * id before returning an ambiguous result. This module owns only the client
 * retry fence: claimed before the insert is awaited, kept while it is pending
 * or after reconciliation cannot prove the outcome, and released only for a
 * confirmed or definitively non-committed attempt. It never
 * writes to Supabase, deletes an uploaded object, or exposes stored identity
 * values to the UI.
 */

export const QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY =
  "verdant:quick-log:photo-attachment-uncertain:v1" as const;

/**
 * Window event sent after a fence is durably released in this page, so a sheet
 * that is locked by that fence (for example one remounted while the original
 * insert was pending) can re-check it. Carries no detail; listeners re-read.
 */
export const QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_CHANGED_EVENT =
  "verdant:quick-log:photo-attachment-recovery-changed" as const;

function notifyRecoveryChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_CHANGED_EVENT));
  } catch {
    // A notification failure must never turn a settled save into an error.
  }
}

const PHOTO_DIARY_INSERT_OPERATION = "photo_diary_insert" as const;

export interface QuickLogPhotoAttachmentRecoveryScope {
  readonly ownerId: string | null | undefined;
  readonly growId: string | null | undefined;
  readonly tentId: string | null | undefined;
  readonly plantId: string | null | undefined;
}

interface LegacyStoredPhotoAttachmentRecoveryLocks {
  readonly version: 1;
  readonly locks: readonly string[];
}

/**
 * `upload`: reserved before the photo upload; no diary insert has started, so
 * no row can exist for the id. `insert`: the insert may have committed. A
 * record without a phase (older format) is treated as `insert`, fail-closed.
 */
type PhotoAttachmentRecoveryPhase = "upload" | "insert";

interface StoredPhotoAttachmentRecoveryLock {
  readonly key: string;
  /** Exact preallocated diary id. Internal-only; never render this value. */
  readonly diaryEntryId: string | null;
  readonly phase?: PhotoAttachmentRecoveryPhase;
}

interface LockEntry {
  readonly diaryEntryId: string | null;
  readonly phase: PhotoAttachmentRecoveryPhase;
}

/**
 * Attempts still running in THIS page (JavaScript context). A reload ends
 * every one of them, so an `upload`-phase reservation whose id is not here
 * belongs to an upload that can no longer reach its insert: it is stale and
 * is treated as absent. Not exported; never rendered.
 */
const liveUploadReservations = new Set<string>();

/** Entry ids whose confirmed completion was already announced in this page. */
const announcedCompletions = new Set<string>();

interface StoredPhotoAttachmentRecoveryLocks {
  readonly version: 2;
  readonly locks: readonly StoredPhotoAttachmentRecoveryLock[];
}

export interface QuickLogPhotoAttachmentRecoveryRecord {
  /** Internal recovery identity for an owner-scoped exact diary-row lookup. */
  readonly diaryEntryId: string | null;
}

function normalizeRequiredId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function normalizeOptionalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function normalizeDiaryEntryId(value: unknown): string | null {
  return normalizeRequiredId(value);
}

/**
 * Creates an internal-only scope key for this one retry fence. The owner and
 * exact target are all required to prevent an uncertain write from blocking a
 * different signed-in account or target. Callers must never render this key.
 */
export function buildQuickLogPhotoAttachmentRecoveryKey(
  scope: QuickLogPhotoAttachmentRecoveryScope,
): string | null {
  const ownerId = normalizeRequiredId(scope.ownerId);
  const growId = normalizeRequiredId(scope.growId);
  if (!ownerId || !growId) return null;

  return JSON.stringify([
    PHOTO_DIARY_INSERT_OPERATION,
    ownerId,
    growId,
    normalizeOptionalId(scope.tentId),
    normalizeOptionalId(scope.plantId),
  ]);
}

function isStaleUploadReservation(entry: LockEntry): boolean {
  return (
    entry.phase === "upload" &&
    (entry.diaryEntryId === null || !liveUploadReservations.has(entry.diaryEntryId))
  );
}

/** Stored locks, with stale upload-phase reservations treated as absent. */
function readStoredLocks(): Map<string, LockEntry> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.sessionStorage.getItem(QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as
      | Partial<LegacyStoredPhotoAttachmentRecoveryLocks>
      | Partial<StoredPhotoAttachmentRecoveryLocks>;
    if (!Array.isArray(parsed.locks)) return new Map();
    if (parsed.version === 1) {
      // Preserve old scope-only locks fail-closed. They cannot be reconciled
      // automatically because the previous format did not retain an attempt id.
      return new Map(
        parsed.locks
          .filter((value): value is string => typeof value === "string" && value !== "")
          .map((key) => [key, { diaryEntryId: null, phase: "insert" as const }]),
      );
    }
    if (parsed.version !== 2) return new Map();
    return new Map(
      parsed.locks.flatMap((value) => {
        if (typeof value !== "object" || value === null) return [];
        const key = (value as { key?: unknown }).key;
        if (typeof key !== "string" || key === "") return [];
        const entry: LockEntry = {
          diaryEntryId: normalizeDiaryEntryId((value as { diaryEntryId?: unknown }).diaryEntryId),
          phase: (value as { phase?: unknown }).phase === "upload" ? "upload" : "insert",
        };
        return isStaleUploadReservation(entry) ? [] : [[key, entry] as const];
      }),
    );
  } catch {
    // Storage is only a retry fence. If unavailable, the caller's in-memory
    // state still retains the current mount's conservative lock.
    return new Map();
  }
}

/** Returns whether the browser accepted the write. Never throws. */
function writeStoredLocks(locks: ReadonlyMap<string, LockEntry>): boolean {
  if (typeof window === "undefined") return false;
  try {
    const payload: StoredPhotoAttachmentRecoveryLocks = {
      version: 2,
      locks: Array.from(locks.entries())
        .map(([key, entry]) => ({ key, diaryEntryId: entry.diaryEntryId, phase: entry.phase }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    };
    window.sessionStorage.setItem(
      QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY,
      JSON.stringify(payload),
    );
    return true;
  } catch {
    // Browser storage can be disabled or full. Do not remove or overwrite an
    // existing recovery record as a fallback: that would be blind cleanup.
    return false;
  }
}

/** Durable read-back: does the stored fence still hold this exact id? */
function storedLockHolds(key: string, entryId: string): boolean {
  return readStoredLocks().get(key)?.diaryEntryId === entryId;
}

/** Read the current browser-session retry fence for one exact owner/target. */
export function hasQuickLogPhotoAttachmentRecoveryLock(
  scope: QuickLogPhotoAttachmentRecoveryScope,
): boolean {
  const key = buildQuickLogPhotoAttachmentRecoveryKey(scope);
  return key !== null && readStoredLocks().has(key);
}

/**
 * Returns the internal exact diary identity for a stored lock. The caller must
 * use it only with an owner-scoped RLS lookup and must never render it.
 */
export function getQuickLogPhotoAttachmentRecoveryRecord(
  scope: QuickLogPhotoAttachmentRecoveryScope,
): QuickLogPhotoAttachmentRecoveryRecord | null {
  const key = buildQuickLogPhotoAttachmentRecoveryKey(scope);
  if (!key) return null;
  const entry = readStoredLocks().get(key);
  if (!entry) return null;
  return { diaryEntryId: entry.diaryEntryId };
}

/**
 * Records a recovery fence after an insert remains ambiguous. This deliberately
 * does not clear any existing lock; only a future exact reconciliation or
 * explicit recovery may call the matching clear function.
 */
export function recordQuickLogPhotoAttachmentRecoveryLock(
  scope: QuickLogPhotoAttachmentRecoveryScope,
  diaryEntryId?: string | null,
): string | null {
  const key = buildQuickLogPhotoAttachmentRecoveryKey(scope);
  if (!key) return null;
  const locks = readStoredLocks();
  const entryId = normalizeDiaryEntryId(diaryEntryId);
  const existing = locks.get(key);
  // Never replace an existing exact attempt id with a missing/other value.
  // A previous unresolved write remains the only safe reconciliation target.
  // Recording happens after an insert was attempted, so the phase is `insert`.
  if (!existing) {
    locks.set(key, { diaryEntryId: entryId, phase: "insert" });
  } else if (existing.diaryEntryId === entryId && existing.phase !== "insert") {
    locks.set(key, { diaryEntryId: entryId, phase: "insert" });
  }
  writeStoredLocks(locks);
  return key;
}

export type QuickLogPhotoAttachmentClaimResult =
  /** The exact scope now durably holds this entry id (new or already held). */
  | "claimed"
  /** Another unresolved attempt already holds this scope; do not insert. */
  | "held_by_other"
  /** Browser storage could not persist the claim; only in-memory guards apply. */
  | "unavailable";

/**
 * Claims the exact owner/target scope for one preallocated diary id.
 *
 * - `phase: "upload"` reserves the scope BEFORE the photo upload, so an
 *   unmount + remount of the same target in this page cannot start a second
 *   attempt in any interleaving. A reload ends the attempt, and its
 *   reservation is then stale and ignored, because no insert had started.
 * - `phase: "insert"` (the default) must succeed before the insert is awaited.
 *   It promotes this attempt's own reservation and is verified by read-back,
 *   so a reload during the insert keeps the fence.
 *
 * An existing claim for a different (or unknown) id is never replaced.
 */
export function claimQuickLogPhotoAttachmentRecoveryLock(
  scope: QuickLogPhotoAttachmentRecoveryScope,
  diaryEntryId: string,
  phase: PhotoAttachmentRecoveryPhase = "insert",
): QuickLogPhotoAttachmentClaimResult {
  const key = buildQuickLogPhotoAttachmentRecoveryKey(scope);
  const entryId = normalizeDiaryEntryId(diaryEntryId);
  if (!key || !entryId) return "unavailable";
  const locks = readStoredLocks();
  const existing = locks.get(key);
  if (existing && existing.diaryEntryId !== entryId) return "held_by_other";
  if (existing && (existing.phase === "insert" || phase === "upload")) {
    if (phase === "upload") liveUploadReservations.add(entryId);
    return "claimed";
  }
  if (phase === "upload") liveUploadReservations.add(entryId);
  locks.set(key, { diaryEntryId: entryId, phase });
  writeStoredLocks(locks);
  const stored = readStoredLocks().get(key);
  if (stored?.diaryEntryId === entryId && stored.phase === phase) return "claimed";
  if (phase === "upload") liveUploadReservations.delete(entryId);
  return "unavailable";
}

/**
 * Releases the claim only when it still holds this exact diary id, after the
 * insert is confirmed, definitively not committed, or never started. Returns
 * true only when a read-back proves the stored claim is gone; false means
 * another path already released it, a different attempt holds the scope, or
 * the browser refused the removal (the fence then stays, fail-closed).
 */
export function releaseQuickLogPhotoAttachmentRecoveryLockForEntry(
  scope: QuickLogPhotoAttachmentRecoveryScope,
  diaryEntryId: string,
): boolean {
  const key = buildQuickLogPhotoAttachmentRecoveryKey(scope);
  const entryId = normalizeDiaryEntryId(diaryEntryId);
  if (!key || !entryId) return false;
  // Read while this attempt still counts as live: the reader drops upload
  // records with no live owner, so reading after the delete below would hide
  // this very reservation and skip both its removal and the notification.
  const locks = readStoredLocks();
  // This attempt no longer runs in this page either way.
  liveUploadReservations.delete(entryId);
  if (locks.get(key)?.diaryEntryId !== entryId) return false;
  locks.delete(key);
  writeStoredLocks(locks);
  const released = !storedLockHolds(key, entryId);
  if (released) notifyRecoveryChanged();
  return released;
}

/**
 * Settles one confirmed photo row and decides who announces it. Returns true
 * for exactly one caller per entry id in this page: the first to complete an
 * attempt whose fence it still finds held. The save response and a remount's
 * exact reconciliation both call this, so whichever settles first announces
 * and the other does not, even when the browser refuses to remove the fence.
 */
export function completeQuickLogPhotoAttachmentAttempt(
  scope: QuickLogPhotoAttachmentRecoveryScope,
  diaryEntryId: string,
): boolean {
  const key = buildQuickLogPhotoAttachmentRecoveryKey(scope);
  const entryId = normalizeDiaryEntryId(diaryEntryId);
  if (!key || !entryId) return false;
  const heldHere = storedLockHolds(key, entryId);
  if (heldHere) releaseQuickLogPhotoAttachmentRecoveryLockForEntry(scope, entryId);
  else liveUploadReservations.delete(entryId);
  if (!heldHere || announcedCompletions.has(entryId)) return false;
  announcedCompletions.add(entryId);
  return true;
}

/**
 * Narrow escape hatch for a future exact reconciliation or explicit recovery
 * UI. It is intentionally never called as part of a failed save path.
 */
export function clearQuickLogPhotoAttachmentRecoveryLock(
  scope: QuickLogPhotoAttachmentRecoveryScope,
): void {
  const key = buildQuickLogPhotoAttachmentRecoveryKey(scope);
  if (!key) return;
  const locks = readStoredLocks();
  if (!locks.delete(key)) return;
  writeStoredLocks(locks);
}

/** Test-only: forget this page's in-memory attempt registries. */
export function resetQuickLogPhotoAttachmentRecoveryMemoryForTests(): void {
  liveUploadReservations.clear();
  announcedCompletions.clear();
}
