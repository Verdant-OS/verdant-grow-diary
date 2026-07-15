/**
 * publicQuickLogStarterDraftStore — safe localStorage wrapper for the single
 * public Quick Log Starter draft (see publicQuickLogStarterRules).
 *
 * Rules (localOnboardingPreferences pattern):
 *  - Never throws. All storage access is try/catch.
 *  - SSR/test-safe: tolerates missing `window` / blocked `localStorage`.
 *  - Writes fail open and never block the grower's action.
 *  - Local-only: no backend, no network, no database row. The draft is
 *    honest on-this-device state until the grower creates an account.
 *
 * Reactivity: a tiny pub/sub + `useSyncExternalStore` re-renders the page
 * after a save/clear in the same tab. The parsed-draft snapshot is cached
 * by raw string so snapshots stay referentially stable between changes.
 *
 * `clearPublicQuickLogStarterDraft` doubles as the consume-once primitive a
 * LATER authed handoff slice will use (read → prefill → clear). That
 * consumer is intentionally not wired here.
 */
import { useSyncExternalStore } from "react";
import {
  PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
  parsePublicQuickLogStarterDraft,
  serializePublicQuickLogStarterDraft,
  type PublicQuickLogStarterDraft,
} from "@/lib/publicQuickLogStarterRules";

const listeners = new Set<() => void>();
function emit(): void {
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
    s.getItem(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY);
    return s;
  } catch {
    return null;
  }
}

// Snapshot cache: useSyncExternalStore requires getSnapshot to return the
// same reference while the underlying data is unchanged.
let cachedRaw: string | null | undefined;
let cachedDraft: PublicQuickLogStarterDraft | null = null;

export function readPublicQuickLogStarterDraft(): PublicQuickLogStarterDraft | null {
  const s = safeStorage();
  if (!s) return null;
  let raw: string | null = null;
  try {
    raw = s.getItem(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY);
  } catch {
    return cachedDraft;
  }
  if (raw !== cachedRaw) {
    cachedDraft = parsePublicQuickLogStarterDraft(raw);
    cachedRaw = raw;
  }
  return cachedDraft;
}

/**
 * Persist the draft. Never throws; returns whether the write actually
 * landed in storage so the page can tell the grower the truth instead of
 * showing an unpersisted draft as "saved on this device" (storage can be
 * full, blocked, or unavailable in private-mode browsers).
 */
export function writePublicQuickLogStarterDraft(draft: PublicQuickLogStarterDraft): boolean {
  const s = safeStorage();
  let persisted = false;
  if (s) {
    try {
      s.setItem(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY, serializePublicQuickLogStarterDraft(draft));
      persisted = true;
    } catch {
      /* storage full/blocked — reported via the return value */
    }
  }
  emit();
  return persisted;
}

/**
 * Remove the draft. Also the consume-once step for the future authed
 * handoff (read → prefill the in-app Quick Log → clear).
 */
export function clearPublicQuickLogStarterDraft(): void {
  const s = safeStorage();
  if (s) {
    try {
      s.removeItem(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY);
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

/** Same-tab reactive view of the stored draft (null when none). */
export function usePublicQuickLogStarterDraft(): PublicQuickLogStarterDraft | null {
  return useSyncExternalStore(
    subscribe,
    () => readPublicQuickLogStarterDraft(),
    () => null,
  );
}
