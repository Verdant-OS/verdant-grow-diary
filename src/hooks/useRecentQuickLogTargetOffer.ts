/**
 * Remembered Quick Log target — the OFFER state machine, shared by surfaces.
 *
 * Slice D5 put the "Continue with <plant>?" chip on the legacy dialog. The
 * approved S5 target is about the GLOBAL entry, and on desktop that entry is
 * `QuickLogV2Fab` → `QuickLogV2Sheet` (the FAB is `hidden md:inline-flex`;
 * mobile goes through AppShell to the legacy dialog). A grower returning
 * through the primary desktop entry therefore never saw the offer at all.
 *
 * This hook owns everything about an offer that is not rendering: which record
 * is current, whether its window is still open, whether another tab replaced
 * it, and whether the grower has already retired it for this open. What it
 * deliberately does NOT own is applying the target — every surface performs its
 * own explicit selection, because "offered, never applied" is the fence the
 * whole slice exists to draw, and a hook that could select would be the silent
 * default this design bans.
 *
 * `QuickLog.tsx` still carries its own equivalent state. Migrating it is a
 * separate change: a dozen wiring pins regex its exact source, and rewriting
 * them while its PR is queued would trade a real risk for a cosmetic gain.
 * Recorded as deferred rather than left implicit.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  RECENT_TARGET_SUGGESTION_MAX_AGE_MS,
  buildRecentTargetStorageKey,
  recentTargetSuggestionFitsPrefillScope,
  resolveRecentTargetSuggestion,
  type RecentTargetPrefillScope,
  type RecentTargetSuggestion,
  type RecentTargetVisibleGrow,
  type RecentTargetVisiblePlant,
  type RecentTargetVisibleTent,
} from "@/lib/quickLogRecentTargetSuggestion";
import { readRecentQuickLogTarget } from "@/lib/quickLogRecentTargetStore";

export interface UseRecentQuickLogTargetOfferInput {
  /** Whether the surface is open. A closed surface offers nothing. */
  open: boolean;
  /** Signed-in account. Without one nothing is stored, so nothing is offered. */
  userId: string | null | undefined;
  /**
   * The scope the launcher asked for, if any. A launcher that names a plant
   * has already answered the question, so it gets no offer; one that names
   * only a grow or tent gets an offer that agrees with that scope.
   */
  scope?: RecentTargetPrefillScope | null;
  /**
   * Additional surface-specific reason to withhold, e.g. the target list has
   * not loaded. Defaults to true. Withholding never falls back to a guess.
   */
  enabled?: boolean;
  visiblePlants: readonly RecentTargetVisiblePlant[] | null | undefined;
  visibleGrows: readonly RecentTargetVisibleGrow[] | null | undefined;
  visibleTents: readonly RecentTargetVisibleTent[] | null | undefined;
}

export interface RecentQuickLogTargetOffer {
  /** What to render, or null when there is nothing to offer. */
  suggestion: RecentTargetSuggestion | null;
  /** Retire the offer for this open — dismissal, and after an acceptance. */
  retire: () => void;
  /**
   * Re-derive from the CURRENT stored value against the CURRENT clock.
   *
   * A surface can sit open across the 14-day boundary, or another tab can
   * replace the record, so the value captured at render is not evidence about
   * the value at click time. Callers must apply THIS result, never the
   * rendered one, and must refuse it when its plant differs from the plant
   * named on the button they clicked.
   */
  revalidate: () => RecentTargetSuggestion | null;
}

export function useRecentQuickLogTargetOffer(
  input: UseRecentQuickLogTargetOfferInput,
): RecentQuickLogTargetOffer {
  const {
    open,
    userId,
    scope = null,
    enabled = true,
    visiblePlants,
    visibleGrows,
    visibleTents,
  } = input;

  const storageKey = buildRecentTargetStorageKey(userId ?? null);
  const eligible = open && enabled && Boolean(storageKey);

  const [dismissed, setDismissed] = useState(false);
  // A single scheduled tick re-evaluates the rendered offer when its window
  // closes. Not a polling clock, and it never changes a selection — it only
  // removes a now-invalid action while the surface stays open.
  const [clockMs, setClockMs] = useState(() => Date.now());
  // The snapshot is paired with the account key that produced it, so an
  // account change makes the previous account's record ineligible during the
  // render before the effect below reloads.
  const [snapshot, setSnapshot] = useState<{
    storageKey: string | null;
    record: ReturnType<typeof readRecentQuickLogTarget>;
  }>(() => ({
    storageKey,
    record: eligible ? readRecentQuickLogTarget(userId ?? null) : null,
  }));

  useEffect(() => {
    // A fresh open is a fresh offer. A dismissal belongs to the open it was
    // made in and must not silence the next one.
    if (open) setDismissed(false);
  }, [open]);

  useEffect(() => {
    if (!eligible) {
      setSnapshot({ storageKey, record: null });
      return;
    }

    setSnapshot({ storageKey, record: readRecentQuickLogTarget(userId ?? null) });

    // `storage` fires in the OTHER document, not the tab that wrote. Follow
    // only this account's key, and always re-read current storage rather than
    // trusting `event.newValue`: if an older event arrives after a newer
    // write, the rendered offer must not regress.
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      if (event.key !== null && event.key !== storageKey) return;
      setSnapshot({ storageKey, record: readRecentQuickLogTarget(userId ?? null) });
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [eligible, storageKey, userId]);

  const record = eligible && snapshot.storageKey === storageKey ? snapshot.record : null;

  useEffect(() => {
    if (!record) return;
    const savedAtMs = Date.parse(record.savedAt);
    if (!Number.isFinite(savedAtMs)) return;

    // The pure rule accepts the record at exactly MAX_AGE and rejects it one
    // millisecond later; schedule that same strict boundary.
    const delayMs = savedAtMs + RECENT_TARGET_SUGGESTION_MAX_AGE_MS + 1 - Date.now();
    if (delayMs <= 0) return;
    const timer = window.setTimeout(() => setClockMs(Date.now()), delayMs);
    return () => window.clearTimeout(timer);
  }, [record]);

  const scopeGrowId = scope?.growId ?? null;
  const scopeTentId = scope?.tentId ?? null;
  const scopePlantId = scope?.plantId ?? null;

  const suggestion = useMemo(() => {
    if (dismissed) return null;
    const resolved = resolveRecentTargetSuggestion({
      record,
      // Date.now() revalidates on ordinary renders; the state timestamp is
      // advanced by the expiry timer to guarantee a render at the boundary.
      now: Math.max(Date.now(), clockMs),
      visiblePlants,
      visibleGrows,
      visibleTents,
    });
    const requestedScope = { plantId: scopePlantId, growId: scopeGrowId, tentId: scopeTentId };
    return recentTargetSuggestionFitsPrefillScope(resolved, requestedScope) ? resolved : null;
  }, [
    dismissed,
    record,
    clockMs,
    visiblePlants,
    visibleGrows,
    visibleTents,
    scopePlantId,
    scopeGrowId,
    scopeTentId,
  ]);

  const revalidate = useCallback((): RecentTargetSuggestion | null => {
    const latest = readRecentQuickLogTarget(userId ?? null);
    // Keep the rendered offer in step with what we just read, so a surface
    // that refuses this result redraws the current record rather than the
    // stale one it was showing.
    setSnapshot({ storageKey, record: latest });
    const resolved = resolveRecentTargetSuggestion({
      record: latest,
      now: Date.now(),
      visiblePlants,
      visibleGrows,
      visibleTents,
    });
    const requestedScope = { plantId: scopePlantId, growId: scopeGrowId, tentId: scopeTentId };
    return recentTargetSuggestionFitsPrefillScope(resolved, requestedScope) ? resolved : null;
  }, [
    userId,
    storageKey,
    visiblePlants,
    visibleGrows,
    visibleTents,
    scopePlantId,
    scopeGrowId,
    scopeTentId,
  ]);

  const retire = useCallback(() => setDismissed(true), []);

  return { suggestion, retire, revalidate };
}
