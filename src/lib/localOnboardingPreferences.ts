/**
 * localOnboardingPreferences — tiny, safe wrapper around localStorage for
 * the first-run onboarding checklist dismiss preference.
 *
 * Rules:
 *  - Never throws. All storage access is try/catch.
 *  - SSR/test-safe: tolerates missing `window` / `localStorage`.
 *  - If storage is unavailable, fails open (treats as "not dismissed") so
 *    the checklist remains visible — never strands the user.
 *  - No Supabase, no network, no database row. Local-only.
 *
 * Reactivity: a tiny pub/sub lets React components re-render after a
 * dismiss flip in the same tab via `useOnboardingChecklistDismissed`.
 */
import { useCallback, useSyncExternalStore } from "react";

export const ONBOARDING_CHECKLIST_DISMISSED_KEY =
  "verdant:onboarding-checklist-dismissed:v1";

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore listener errors */
    }
  }
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    // Touch to confirm access (some envs throw on get).
    s.getItem(ONBOARDING_CHECKLIST_DISMISSED_KEY);
    return s;
  } catch {
    return null;
  }
}

export function isOnboardingChecklistDismissed(): boolean {
  const s = safeStorage();
  if (!s) return false;
  try {
    return s.getItem(ONBOARDING_CHECKLIST_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissOnboardingChecklist(): void {
  const s = safeStorage();
  if (!s) {
    emit();
    return;
  }
  try {
    s.setItem(ONBOARDING_CHECKLIST_DISMISSED_KEY, "1");
  } catch {
    /* fail open — keep visible */
  }
  emit();
}

export function resetOnboardingChecklistDismiss(): void {
  const s = safeStorage();
  if (s) {
    try {
      s.removeItem(ONBOARDING_CHECKLIST_DISMISSED_KEY);
    } catch {
      /* ignore */
    }
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOnboardingChecklistDismissed(): {
  isDismissed: boolean;
  dismiss: () => void;
} {
  const isDismissed = useSyncExternalStore(
    subscribe,
    () => isOnboardingChecklistDismissed(),
    () => false,
  );
  const dismiss = useCallback(() => {
    dismissOnboardingChecklist();
  }, []);
  return { isDismissed, dismiss };
}
