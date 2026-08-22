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

interface LegacyStoredPhotoAttachmentRecoveryLocks {
  readonly version: 1;
  readonly locks: readonly string[];
}

interface StoredPhotoAttachmentRecoveryLock {
  readonly key: string;
  /** Exact preallocated diary id. Internal-only; never render this value. */
  readonly diaryEntryId: string | null;
}

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

function readStoredLocks(): Map<string, string | null> {
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
          .map((key) => [key, null]),
      );
    }
    if (parsed.version !== 2) return new Map();
    return new Map(
      parsed.locks.flatMap((value) => {
        if (typeof value !== "object" || value === null) return [];
        const key = (value as { key?: unknown }).key;
        if (typeof key !== "string" || key === "") return [];
        return [[key, normalizeDiaryEntryId((value as { diaryEntryId?: unknown }).diaryEntryId)]];
      }),
    );
  } catch {
    // Storage is only a retry fence. If unavailable, the caller's in-memory
    // state still retains the current mount's conservative lock.
    return new Map();
  }
}

function writeStoredLocks(locks: ReadonlyMap<string, string | null>): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredPhotoAttachmentRecoveryLocks = {
      version: 2,
      locks: Array.from(locks.entries())
        .map(([key, diaryEntryId]) => ({ key, diaryEntryId }))
        .sort((a, b) => a.key.localeCompare(b.key)),
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
 * Returns the internal exact diary identity for a stored lock. The caller must
 * use it only with an owner-scoped RLS lookup and must never render it.
 */
export function getQuickLogPhotoAttachmentRecoveryRecord(
  scope: QuickLogPhotoAttachmentRecoveryScope,
): QuickLogPhotoAttachmentRecoveryRecord | null {
  const key = buildQuickLogPhotoAttachmentRecoveryKey(scope);
  if (!key) return null;
  const locks = readStoredLocks();
  if (!locks.has(key)) return null;
  return { diaryEntryId: locks.get(key) ?? null };
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
  // Never replace an existing exact attempt id with a missing/other value.
  // A previous unresolved write remains the only safe reconciliation target.
  if (!locks.has(key)) locks.set(key, normalizeDiaryEntryId(diaryEntryId));
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
