import { emptyDraft, type NotebookDraft } from "@/lib/fieldNotebookOutcomeRules";

/**
 * One map per signed-in account. Only an uncertain note is stored in
 * localStorage under that account id, so a reload can offer Check Timeline
 * and Save again. Sign-out removes that key. Another account never reads it.
 */
const STORAGE_PREFIX = "verdant.fieldNotebook.v1:";

const stores = new Map<string, Map<string, NotebookDraft>>();
const listeners = new Set<() => void>();
let activeOwnerId: string | null = null;

function notifyNotebookSession(): void {
  for (const listener of listeners) listener();
}

export function subscribeNotebookSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function ownerKey(userId: string | null): string {
  return userId ?? "";
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/** `typeof localStorage` throws when the browser blocks storage. Keep it inside try. */
function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readStoredDrafts(userId: string): Map<string, NotebookDraft> {
  const map = new Map<string, NotebookDraft>();
  const storage = safeStorage();
  if (!storage) return map;
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return map;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return map;
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const draft = item as NotebookDraft;
      if (typeof draft.tentId !== "string" || draft.tentId.length === 0) continue;
      if (draft.phase === "saving") {
        map.set(draft.tentId, { ...draft, phase: "uncertain", writeBlocked: true });
        continue;
      }
      if (draft.phase !== "uncertain") continue;
      map.set(draft.tentId, draft);
    }
  } catch {
    return map;
  }
  return map;
}

function draftToPersist(draft: NotebookDraft): NotebookDraft | null {
  if (draft.phase === "uncertain") return draft;
  if (draft.phase === "saving") {
    return { ...draft, phase: "uncertain", writeBlocked: true };
  }
  return null;
}

function persistOwner(userId: string | null): void {
  if (!userId) return;
  const drafts = [...(stores.get(userId)?.values() ?? [])]
    .map(draftToPersist)
    .filter((draft): draft is NotebookDraft => draft !== null);
  const storage = safeStorage();
  if (!storage) return;
  try {
    if (drafts.length === 0) {
      storage.removeItem(storageKey(userId));
      return;
    }
    storage.setItem(storageKey(userId), JSON.stringify(drafts));
  } catch {
    // A full or disabled store must not throw into typing or saving.
  }
}

function removeStored(userId: string): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(userId));
  } catch {
    // Sign-out still drops memory when storage is unavailable.
  }
}

function storeFor(userId: string | null): Map<string, NotebookDraft> {
  const key = ownerKey(userId);
  let store = stores.get(key);
  if (!store) {
    store = userId ? readStoredDrafts(userId) : new Map();
    stores.set(key, store);
  }
  return store;
}

export function notebookSessionOwner(): string | null {
  return activeOwnerId;
}

/**
 * Drop the previous account's memory. Sign-out removes its stored notes even
 * when this page load never adopted an owner (same-tab reload, then sign-out).
 * `knownPreviousUserId` is that last resolved id.
 */
export function adoptNotebookSessionOwner(
  userId: string | null,
  knownPreviousUserId: string | null = null,
): void {
  if (userId === null) {
    const target = activeOwnerId ?? knownPreviousUserId;
    if (target) removeStored(target);
  }
  if (userId === activeOwnerId) {
    if (userId === null) notifyNotebookSession();
    return;
  }
  const previous = activeOwnerId;
  stores.delete(ownerKey(previous));
  if (userId === null && previous && previous !== knownPreviousUserId) removeStored(previous);
  activeOwnerId = userId;
  storeFor(userId);
  notifyNotebookSession();
}

export function readNotebookDraft(tentId: string): NotebookDraft {
  return storeFor(activeOwnerId).get(tentId) ?? emptyDraft(tentId);
}

/**
 * Writes land only for the owner captured when the attempt started.
 * A late write from the previous account is dropped.
 */
export function writeNotebookDraft(
  draft: NotebookDraft,
  asOwner: string | null = activeOwnerId,
): boolean {
  if (asOwner !== activeOwnerId) return false;
  storeFor(activeOwnerId).set(draft.tentId, draft);
  persistOwner(activeOwnerId);
  notifyNotebookSession();
  return true;
}

export function notebookDrafts(): NotebookDraft[] {
  return [...storeFor(activeOwnerId).values()];
}

export function clearNotebookSession(): void {
  stores.clear();
  const storage = safeStorage();
  if (storage) {
    try {
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
      }
      for (const key of keys) storage.removeItem(key);
    } catch {
      // A blocked store must not throw out of a test or sign-out helper.
    }
  }
  notifyNotebookSession();
}

/** Drop memory only, so the next read reloads the signed-in account's storage. */
export function forgetNotebookMemory(): void {
  stores.clear();
  activeOwnerId = null;
}
