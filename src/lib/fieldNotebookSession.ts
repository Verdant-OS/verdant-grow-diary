import { emptyDraft, type NotebookDraft } from "@/lib/fieldNotebookOutcomeRules";

/**
 * One map per signed-in account. Uncertain notes are also stored in
 * localStorage under that account id so a reload keeps the text. Another
 * account never reads that key. A signed-out session is memory only.
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

function readStoredDrafts(userId: string): Map<string, NotebookDraft> {
  const map = new Map<string, NotebookDraft>();
  if (typeof localStorage === "undefined") return map;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return map;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return map;
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const draft = item as NotebookDraft;
      if (typeof draft.tentId !== "string" || draft.tentId.length === 0) continue;
      map.set(draft.tentId, draft);
    }
  } catch {
    return map;
  }
  return map;
}

function persistOwner(userId: string | null): void {
  if (!userId || typeof localStorage === "undefined") return;
  const drafts = [...(stores.get(userId)?.values() ?? [])];
  localStorage.setItem(storageKey(userId), JSON.stringify(drafts));
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

/** Drop the previous account's drafts, then publish the next owner. */
export function adoptNotebookSessionOwner(userId: string | null): void {
  if (userId === activeOwnerId) return;
  stores.delete(ownerKey(activeOwnerId));
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
  if (typeof localStorage !== "undefined") {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  }
  notifyNotebookSession();
}

/** Drop memory only, so the next read reloads the signed-in account's storage. */
export function forgetNotebookMemory(): void {
  stores.clear();
  activeOwnerId = null;
}
