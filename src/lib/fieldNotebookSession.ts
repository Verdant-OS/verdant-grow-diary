import { emptyDraft, type NotebookDraft } from "@/lib/fieldNotebookOutcomeRules";

/**
 * In-memory notes for the open page. A reload does not bring an uncertain
 * note back. That restore is a follow-up.
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

/**
 * Drop the previous account's in-memory notes when the signed-in account changes.
 * The notebook and Timeline recovery call this from the signed-in user id.
 * A null owner means signed out: that account's notes are not readable.
 */
export function adoptNotebookSessionOwner(userId: string | null): void {
  if (userId === activeOwnerId) {
    if (userId === null) notifyNotebookSession();
    return;
  }
  const previous = activeOwnerId;
  stores.delete(ownerKey(previous));
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
  stores.clear();
  notifyNotebookSession();
}

/** Drop memory so the next read starts empty. */
export function forgetNotebookMemory(): void {
  stores.clear();
  activeOwnerId = null;
}
