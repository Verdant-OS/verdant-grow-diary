/**
 * One-session dismiss store for the Daily Grow Check onboarding card.
 *
 * In-memory only. Dismissals live until the page is refreshed (full reload).
 * No localStorage, no sessionStorage, no Supabase write — explicitly per the
 * "until they refresh" requirement.
 *
 * Multiple card instances (e.g. Dashboard + Plant Detail) can share the same
 * dismissal scope by passing the same key.
 */
import { useSyncExternalStore, useCallback } from "react";

const dismissed = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dismissOnboardingForSession(scope: string): void {
  if (dismissed.has(scope)) return;
  dismissed.add(scope);
  emit();
}

export function resetOnboardingDismissals(): void {
  if (dismissed.size === 0) return;
  dismissed.clear();
  emit();
}

export function isOnboardingDismissedForSession(scope: string): boolean {
  return dismissed.has(scope);
}

export function useOnboardingDismissed(scope: string): {
  isDismissed: boolean;
  dismiss: () => void;
} {
  const isDismissed = useSyncExternalStore(
    subscribe,
    () => dismissed.has(scope),
    () => false,
  );
  const dismiss = useCallback(() => {
    dismissOnboardingForSession(scope);
  }, [scope]);
  return { isDismissed, dismiss };
}
