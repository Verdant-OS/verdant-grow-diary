/**
 * Session drafts for multi-step grower forms.
 * Pure: callers pass storage. Clear only after the server confirms the save.
 */

export const SESSION_FORM_DRAFT_VERSION = 1 as const;

export function sessionFormDraftStorageKey(userId: string, formId: string): string {
  const user = userId.trim();
  const form = formId.trim();
  if (!user || !form) return "";
  return `verdant.session-form.${SESSION_FORM_DRAFT_VERSION}.${user}.${form}`;
}

export function readSessionFormDraft<T>(
  raw: string | null,
  parse: (value: unknown) => T | null,
): T | null {
  if (!raw) return null;
  try {
    return parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export interface SessionFormDraftStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function loadSessionFormDraft<T>(
  storage: SessionFormDraftStorage,
  userId: string,
  formId: string,
  parse: (value: unknown) => T | null,
): T | null {
  const key = sessionFormDraftStorageKey(userId, formId);
  if (!key) return null;
  try {
    return readSessionFormDraft(storage.getItem(key), parse);
  } catch {
    return null;
  }
}

export function saveSessionFormDraft(
  storage: SessionFormDraftStorage,
  userId: string,
  formId: string,
  value: unknown,
): boolean {
  const key = sessionFormDraftStorageKey(userId, formId);
  if (!key) return false;
  try {
    const raw = JSON.stringify(value);
    storage.setItem(key, raw);
    return storage.getItem(key) === raw;
  } catch {
    return false;
  }
}

export function removeSessionFormDraft(
  storage: SessionFormDraftStorage,
  userId: string,
  formId: string,
): void {
  const key = sessionFormDraftStorageKey(userId, formId);
  if (!key) return;
  try {
    storage.removeItem(key);
  } catch {
    /* session storage can throw in private mode */
  }
}
