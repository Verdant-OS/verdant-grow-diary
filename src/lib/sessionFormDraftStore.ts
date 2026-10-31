import {
  loadSessionFormDraft,
  removeSessionFormDraft,
  saveSessionFormDraft,
  type SessionFormDraftStorage,
} from "@/lib/sessionFormDraftRules";

function browserSessionStorage(): SessionFormDraftStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readBrowserSessionFormDraft<T>(
  userId: string,
  formId: string,
  parse: (value: unknown) => T | null,
): T | null {
  const storage = browserSessionStorage();
  if (!storage) return null;
  return loadSessionFormDraft(storage, userId, formId, parse);
}

export function writeBrowserSessionFormDraft(userId: string, formId: string, value: unknown): void {
  const storage = browserSessionStorage();
  if (!storage) return;
  saveSessionFormDraft(storage, userId, formId, value);
}

export function clearBrowserSessionFormDraft(userId: string, formId: string): void {
  const storage = browserSessionStorage();
  if (!storage) return;
  removeSessionFormDraft(storage, userId, formId);
}
