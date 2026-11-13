import { emptyDraft, type NotebookDraft } from "@/lib/fieldNotebookOutcomeRules";

/**
 * Notes for the open page. An unsaved editing note also lives in
 * sessionStorage under the signed-in user id so a full reload can restore
 * that text for the same owner. Uncertain, saving, and saved phases stay
 * in memory only. A reload still does not bring an uncertain note back.
 */
const UNSAVED_NOTE_PREFIX = "verdant:field-notebook-unsaved:";

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

function draftStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function unsavedStorageKey(ownerId: string): string {
  return `${UNSAVED_NOTE_PREFIX}${ownerId}`;
}

function readPersistedNotes(ownerId: string): Record<string, string> {
  const raw = draftStorage()?.getItem(unsavedStorageKey(ownerId));
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("notes" in parsed)) return {};
    const notes = (parsed as { notes?: unknown }).notes;
    if (!notes || typeof notes !== "object") return {};
    const kept: Record<string, string> = {};
    for (const [tentId, note] of Object.entries(notes)) {
      if (typeof note === "string" && note.length > 0) kept[tentId] = note;
    }
    return kept;
  } catch {
    return {};
  }
}

function writePersistedNotes(ownerId: string, notes: Record<string, string>): void {
  const storage = draftStorage();
  if (!storage) return;
  const key = unsavedStorageKey(ownerId);
  try {
    if (Object.keys(notes).length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ ownerId, notes }));
  } catch {
    // A full or blocked sessionStorage must not fail the in-memory note.
  }
}

function persistUnsavedNote(ownerId: string | null, draft: NotebookDraft): void {
  if (!ownerId) return;
  const notes = readPersistedNotes(ownerId);
  if (draft.phase === "editing" && draft.note.length > 0) notes[draft.tentId] = draft.note;
  else delete notes[draft.tentId];
  writePersistedNotes(ownerId, notes);
}

function dropPersistedOwner(ownerId: string | null): void {
  if (!ownerId) return;
  try {
    draftStorage()?.removeItem(unsavedStorageKey(ownerId));
  } catch {
    // Sign-out still clears memory when storage is unavailable.
  }
}

function dropAllPersistedNotes(): void {
  const storage = draftStorage();
  if (!storage) return;
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(UNSAVED_NOTE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Same as a single-owner drop: memory is still cleared by the caller.
  }
}

function hydrateUnsavedNotes(ownerId: string): void {
  const store = storeFor(ownerId);
  for (const [tentId, note] of Object.entries(readPersistedNotes(ownerId))) {
    if (store.has(tentId)) continue;
    store.set(tentId, { ...emptyDraft(tentId), note, phase: "editing" });
  }
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
 * AppShell adopts the signed-in id and clears notes on unmount only while a
 * sign-out is pending, or when a resolved user id becomes null. A read that names a
 * viewer returns nothing unless that viewer is the stored owner.
 */
export function adoptNotebookSessionOwner(userId: string | null): void {
  if (userId === activeOwnerId) {
    if (userId === null) notifyNotebookSession();
    return;
  }
  const previous = activeOwnerId;
  stores.delete(ownerKey(previous));
  dropPersistedOwner(previous);
  activeOwnerId = userId;
  storeFor(userId);
  if (userId) hydrateUnsavedNotes(userId);
  notifyNotebookSession();
}

export function readNotebookDraft(tentId: string, viewerId?: string | null): NotebookDraft {
  if (viewerId !== undefined && viewerId !== activeOwnerId) return emptyDraft(tentId);
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
  persistUnsavedNote(activeOwnerId, draft);
  notifyNotebookSession();
  return true;
}

export function notebookDrafts(viewerId?: string | null): NotebookDraft[] {
  if (viewerId !== undefined && viewerId !== activeOwnerId) return [];
  return [...storeFor(activeOwnerId).values()];
}

export function clearNotebookSession(): void {
  stores.clear();
  dropAllPersistedNotes();
  notifyNotebookSession();
}

/** Drop memory so the next read starts empty. */
export function forgetNotebookMemory(): void {
  stores.clear();
  activeOwnerId = null;
}
