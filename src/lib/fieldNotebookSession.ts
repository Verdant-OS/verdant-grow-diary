import { emptyDraft, type NotebookDraft } from "@/lib/fieldNotebookOutcomeRules";

/**
 * In-memory only, one map per signed-in account. A reload still drops drafts
 * (#2806). The active owner changes only through the auth identity fence.
 */
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

function storeFor(userId: string | null): Map<string, NotebookDraft> {
  const key = ownerKey(userId);
  let store = stores.get(key);
  if (!store) {
    store = new Map();
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
  notifyNotebookSession();
  return true;
}

export function notebookDrafts(): NotebookDraft[] {
  return [...storeFor(activeOwnerId).values()];
}

export function clearNotebookSession(): void {
  stores.delete(ownerKey(activeOwnerId));
  notifyNotebookSession();
}
