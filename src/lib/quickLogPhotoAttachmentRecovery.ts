/**
 * Browser-session recovery fence for an unconfirmed standalone Quick Log
 * photo diary insert.
 *
 * The database write helper already reconciles the exact preallocated diary
 * id before returning an ambiguous result. This module owns only the client
 * retry fence after that reconciliation cannot prove the outcome. It never
 * writes to Supabase, deletes an uploaded object, or exposes stored identity
 * values to the UI.
 */

export const QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY =
  "verdant:quick-log:photo-attachment-uncertain:v1" as const;

const PHOTO_DIARY_INSERT_OPERATION = "photo_diary_insert" as const;

export interface QuickLogPhotoAttachmentRecoveryScope {
  readonly ownerId: string | null | undefined;
  readonly growId: string | null | undefined;
  readonly tentId: string | null | undefined;
  readonly plantId: string | null | undefined;
}

interface StoredPhotoAttachmentRecoveryLocks {
  readonly version: 1;
  readonly locks: readonly string[];
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

function readStoredLocks(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Partial<StoredPhotoAttachmentRecoveryLocks>;
    if (parsed.version !== 1 || !Array.isArray(parsed.locks)) return new Set();
    return new Set(parsed.locks.filter((value): value is string => typeof value === "string"));
  } catch {
    // Storage is only a retry fence. If unavailable, the caller's in-memory
    // state still retains the current mount's conservative lock.
    return new Set();
  }
}

function writeStoredLocks(locks: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredPhotoAttachmentRecoveryLocks = {
      version: 1,
      locks: Array.from(locks).sort(),
    };
    window.sessionStorage.setItem(
      QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Browser storage can be disabled or full. Do not remove or overwrite an
    // existing recovery record as a fallback: that would be blind cleanup.
  }
}

/** Read the current browser-session retry fence for one exact owner/target. */
export function hasQuickLogPhotoAttachmentRecoveryLock(
  scope: QuickLogPhotoAttachmentRecoveryScope,
): boolean {
  const key = buildQuickLogPhotoAttachmentRecoveryKey(scope);
  return key !== null && readStoredLocks().has(key);
}

/**
 * Records a recovery fence after an insert remains ambiguous. This deliberately
 * does not clear any existing lock; only a future exact reconciliation or
 * explicit recovery may call the matching clear function.
 */
export function recordQuickLogPhotoAttachmentRecoveryLock(
  scope: QuickLogPhotoAttachmentRecoveryScope,
): string | null {
  const key = buildQuickLogPhotoAttachmentRecoveryKey(scope);
  if (!key) return null;
  const locks = readStoredLocks();
  locks.add(key);
  writeStoredLocks(locks);
  return key;
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
