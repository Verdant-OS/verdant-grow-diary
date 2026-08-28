/**
 * Browser-session retry fence for a Grow, Tent, or Plant insert whose outcome
 * could not be confirmed. The record carries only the exact owner-scoped row
 * identity; it never stores entered form values.
 *
 * An ambiguous create must stay locked for the remainder of the current page
 * runtime. A later page runtime can safely reconcile the exact RLS-visible
 * row because the original populated UI no longer exists.
 */
import type { HierarchyCreateAttempt } from "@/lib/hierarchyCreatePersistence";
import { isUuid } from "@/lib/isUuid";

export const HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY =
  "verdant:hierarchy-create-outcome-unknown:v1" as const;

const RUNTIME_EPOCH_SLOT = "__verdantHierarchyCreateOutcomeRecoveryRuntimeEpoch" as const;
const RUNTIME_STATE_SLOT = "__verdantHierarchyCreateOutcomeRecoveryRuntimeState" as const;

interface StoredHierarchyCreateOutcomeRecovery {
  readonly version: 1;
  readonly attempts: readonly unknown[];
}

export interface HierarchyCreateOutcomeRecoveryRecord {
  readonly attempt: HierarchyCreateAttempt;
  /** Missing only on legacy v1 records, which are adopted fail-closed. */
  readonly runtimeEpoch: string | null;
}

interface RuntimeRecoveryState {
  /** Attempts minted or adopted by this page runtime, including BFCache restores. */
  readonly runtimeAttempts: Map<string, HierarchyCreateOutcomeRecoveryRecord>;
  readonly listeners: Set<() => void>;
  readonly reconciledAttemptKeys: Set<string>;
  revision: number;
}

function runtimeHost(): Record<string, unknown> {
  return globalThis as Record<string, unknown>;
}

function mintRuntimeEpoch(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === "string" && uuid.trim()) return `runtime:${uuid.toLowerCase()}`;

  // The global slot makes this fallback stable for the lifetime of the page,
  // including route remounts and hot module replacement.
  return `runtime:${Date.now().toString(36)}:${globalThis.performance?.now().toString(36) ?? "0"}`;
}

function currentRuntimeEpoch(): string {
  const host = runtimeHost();
  const existing = host[RUNTIME_EPOCH_SLOT];
  if (typeof existing === "string" && existing.trim()) return existing;

  const epoch = mintRuntimeEpoch();
  host[RUNTIME_EPOCH_SLOT] = epoch;
  return epoch;
}

/**
 * Stable for this page runtime; a full reload receives a new epoch.
 *
 * Lazily minted on first call — never at module evaluation. Cloudflare Workers
 * (Nitro SSR) reject Date / crypto / timers / fetch in global scope, and the
 * prior eager `= currentRuntimeEpoch()` export crashed every SSR request that
 * loaded this chunk (`Disallowed operation called within global scope`).
 */
export function getHierarchyCreateOutcomeRecoveryRuntimeEpoch(): string {
  return currentRuntimeEpoch();
}

function recoveryRuntimeState(): RuntimeRecoveryState {
  const host = runtimeHost();
  const existing = host[RUNTIME_STATE_SLOT] as Partial<RuntimeRecoveryState> | undefined;
  if (
    existing?.runtimeAttempts instanceof Map &&
    existing.listeners instanceof Set &&
    existing.reconciledAttemptKeys instanceof Set &&
    typeof existing.revision === "number"
  ) {
    return existing as RuntimeRecoveryState;
  }

  const state: RuntimeRecoveryState = {
    runtimeAttempts: new Map(),
    listeners: new Set(),
    reconciledAttemptKeys: new Set(),
    revision: 0,
  };
  host[RUNTIME_STATE_SLOT] = state;
  return state;
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isUuid(normalized) ? normalized : null;
}

function attemptFromUnknown(value: unknown): HierarchyCreateAttempt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const entity = record.entity;
  const rowId = normalizeUuid(record.rowId);
  const ownerId = normalizeUuid(record.ownerId);
  if (!rowId || !ownerId) return null;

  if (entity === "grow") return { entity, rowId, ownerId };

  const growId = normalizeUuid(record.growId);
  if (!growId) return null;
  if (entity === "tent") return { entity, rowId, ownerId, growId };
  if (entity !== "plant") return null;
  if (record.tentId === null) return { entity, rowId, ownerId, growId, tentId: null };

  // A supplied non-null plant tent id is hierarchy data. Never normalize a
  // malformed value into a tentless plant attempt.
  const tentId = normalizeUuid(record.tentId);
  if (!tentId) return null;
  return { entity, rowId, ownerId, growId, tentId };
}

function runtimeEpochFromUnknown(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const epoch = value.trim();
  return epoch || null;
}

function recoveryRecordFromUnknown(value: unknown): HierarchyCreateOutcomeRecoveryRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const attempt = attemptFromUnknown(record);
  return attempt ? { attempt, runtimeEpoch: runtimeEpochFromUnknown(record.runtimeEpoch) } : null;
}

/** Internal-only stable identity. Do not render this value. */
export function hierarchyCreateOutcomeRecoveryKey(attempt: HierarchyCreateAttempt): string {
  return JSON.stringify([
    attempt.entity,
    attempt.ownerId,
    attempt.rowId,
    attempt.entity === "grow" ? null : attempt.growId,
    attempt.entity === "plant" ? attempt.tentId : null,
  ]);
}

function readStoredAttempts(): Map<string, HierarchyCreateOutcomeRecoveryRecord> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.sessionStorage.getItem(HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Partial<StoredHierarchyCreateOutcomeRecovery>;
    if (parsed.version !== 1 || !Array.isArray(parsed.attempts)) return new Map();

    const attempts = new Map<string, HierarchyCreateOutcomeRecoveryRecord>();
    for (const value of parsed.attempts) {
      const record = recoveryRecordFromUnknown(value);
      if (record) attempts.set(hierarchyCreateOutcomeRecoveryKey(record.attempt), record);
    }
    return attempts;
  } catch {
    return new Map();
  }
}

function allAttempts(): Map<string, HierarchyCreateOutcomeRecoveryRecord> {
  const attempts = readStoredAttempts();
  for (const [key, record] of recoveryRuntimeState().runtimeAttempts) {
    attempts.set(key, record);
  }
  return attempts;
}

function writeStoredAttempts(
  attempts: ReadonlyMap<string, HierarchyCreateOutcomeRecoveryRecord>,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const payload: StoredHierarchyCreateOutcomeRecovery = {
      version: 1,
      attempts: Array.from(attempts.values())
        .sort((left, right) =>
          hierarchyCreateOutcomeRecoveryKey(left.attempt).localeCompare(
            hierarchyCreateOutcomeRecoveryKey(right.attempt),
          ),
        )
        .map(({ attempt, runtimeEpoch }) => ({ ...attempt, runtimeEpoch })),
    };
    window.sessionStorage.setItem(
      HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY,
      JSON.stringify(payload),
    );
    return true;
  } catch {
    return false;
  }
}

function notifyRecoveryRuntime(): void {
  const state = recoveryRuntimeState();
  state.revision += 1;
  for (const listener of Array.from(state.listeners)) listener();
}

/** React hook subscriptions use this revision to share the global owner fence. */
export function subscribeHierarchyCreateOutcomeRecovery(listener: () => void): () => void {
  const state = recoveryRuntimeState();
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function getHierarchyCreateOutcomeRecoveryRevision(): number {
  return recoveryRuntimeState().revision;
}

/** Read every unresolved attempt for the owner, regardless of creator surface. */
export function getHierarchyCreateOutcomeRecoveryAttempts(
  ownerId: string | null | undefined,
): readonly HierarchyCreateOutcomeRecoveryRecord[] {
  const normalizedOwnerId = normalizeUuid(ownerId);
  if (!normalizedOwnerId) return [];
  return Array.from(allAttempts().values())
    .filter((record) => record.attempt.ownerId === normalizedOwnerId)
    .sort((left, right) =>
      hierarchyCreateOutcomeRecoveryKey(left.attempt).localeCompare(
        hierarchyCreateOutcomeRecoveryKey(right.attempt),
      ),
    );
}

/**
 * Persist one exact ambiguous attempt and retain it in this runtime even when
 * storage succeeds. The latter protects a BFCache-restored original form if
 * another page runtime later clears the shared sessionStorage record.
 */
export function recordHierarchyCreateOutcomeRecoveryAttempt(attempt: HierarchyCreateAttempt): void {
  const normalized = attemptFromUnknown(attempt);
  if (!normalized) return;

  const key = hierarchyCreateOutcomeRecoveryKey(normalized);
  const attempts = allAttempts();
  if (attempts.has(key)) return;

  const record: HierarchyCreateOutcomeRecoveryRecord = {
    attempt: normalized,
    runtimeEpoch: getHierarchyCreateOutcomeRecoveryRuntimeEpoch(),
  };
  attempts.set(key, record);
  const state = recoveryRuntimeState();
  state.runtimeAttempts.set(key, record);
  writeStoredAttempts(attempts);
  notifyRecoveryRuntime();
}

/** Clear only an exact RLS-confirmed attempt. Failed persistence keeps the fence. */
export function clearHierarchyCreateOutcomeRecoveryAttempt(
  attempt: HierarchyCreateAttempt,
): boolean {
  const normalized = attemptFromUnknown(attempt);
  if (!normalized) return false;

  const key = hierarchyCreateOutcomeRecoveryKey(normalized);
  const attempts = allAttempts();
  if (!attempts.delete(key)) return false;
  if (!writeStoredAttempts(attempts)) return false;

  recoveryRuntimeState().runtimeAttempts.delete(key);
  notifyRecoveryRuntime();
  return true;
}

/**
 * Legacy records have no runtime epoch, so they are deliberately adopted
 * into the current runtime rather than auto-reconciled by an arbitrary
 * remounted surface. A later page runtime may reconcile them exactly.
 */
export function adoptLegacyHierarchyCreateOutcomeRecoveryAttempts(
  ownerId: string | null | undefined,
): boolean {
  const normalizedOwnerId = normalizeUuid(ownerId);
  if (!normalizedOwnerId) return false;

  const attempts = allAttempts();
  const adopted = new Map<string, HierarchyCreateOutcomeRecoveryRecord>();
  let changed = false;
  for (const [key, record] of attempts) {
    if (record.attempt.ownerId !== normalizedOwnerId || record.runtimeEpoch !== null) continue;
    const adoptedRecord: HierarchyCreateOutcomeRecoveryRecord = {
      attempt: record.attempt,
      runtimeEpoch: getHierarchyCreateOutcomeRecoveryRuntimeEpoch(),
    };
    attempts.set(key, adoptedRecord);
    adopted.set(key, adoptedRecord);
    changed = true;
  }
  if (!changed || !writeStoredAttempts(attempts)) return false;

  const state = recoveryRuntimeState();
  for (const [key, record] of adopted) state.runtimeAttempts.set(key, record);
  notifyRecoveryRuntime();
  return true;
}

/** One new-runtime reconciliation attempt per exact record is enough. */
export function markHierarchyCreateOutcomeRecoveryAttemptReconciled(
  attempt: HierarchyCreateAttempt,
): boolean {
  const key = hierarchyCreateOutcomeRecoveryKey(attempt);
  const reconciled = recoveryRuntimeState().reconciledAttemptKeys;
  if (reconciled.has(key)) return false;
  reconciled.add(key);
  return true;
}
