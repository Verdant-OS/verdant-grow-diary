/**
 * useGuidance — the signed-in grower's tips setting and tip state.
 *
 * Reads the account copy once per user, exposes the honest read status, and
 * offers setters that write the whole state back to the account. Changes are
 * refused until the account read has settled, so a write never replaces
 * account state this device has not seen.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveUiViewAuthClient } from "@/lib/uiViewPreferenceService";
import {
  ensureGuidanceLoaded,
  forgetGuidanceState,
  getGuidanceGeneration,
  getGuidanceSnapshot,
  getGuidanceVersion,
  retryGuidanceRead,
  saveGuidanceState,
  subscribeGuidance,
  type GuidanceSnapshot,
} from "@/lib/guidancePreferenceService";
import {
  applyGuidanceNoticeAction,
  type GuidanceStepId,
  type GuidanceTips,
} from "@/lib/simpleHomeGuidanceRules";
import type { NoticeAction } from "@/lib/noticeStateRules";

export interface UseGuidance extends GuidanceSnapshot {
  act: (id: GuidanceStepId, action: NoticeAction) => Promise<boolean>;
  setTips: (tips: GuidanceTips) => Promise<boolean>;
  restoreAll: () => Promise<boolean>;
  retryRead: () => Promise<void>;
}

let authEventsBound = false;

function bindAuthEventsOnce(): void {
  if (authEventsBound) return;
  const auth = (supabase as { auth?: { onAuthStateChange?: unknown } } | null | undefined)?.auth;
  if (!auth || typeof auth.onAuthStateChange !== "function") return;
  authEventsBound = true;
  (auth.onAuthStateChange as (cb: (event: string) => void) => unknown)((event) => {
    if (event === "SIGNED_OUT") forgetGuidanceState();
  });
}

export function useGuidance(
  user: { id: string } | null | undefined,
  now: () => Date = () => new Date(),
): UseGuidance {
  const version = useSyncExternalStore(subscribeGuidance, getGuidanceVersion, getGuidanceVersion);
  const generation = useSyncExternalStore(
    subscribeGuidance,
    getGuidanceGeneration,
    getGuidanceGeneration,
  );
  const userId = user?.id ?? null;

  useEffect(() => {
    bindAuthEventsOnce();
    if (!userId) return;
    void ensureGuidanceLoaded(resolveUiViewAuthClient(supabase), userId);
  }, [userId, generation]);

  // `version` is the store's change counter; it is the dependency that matters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snapshot = useMemo(() => getGuidanceSnapshot(userId), [userId, version]);

  const write = useCallback(
    (build: (current: GuidanceSnapshot["state"]) => GuidanceSnapshot["state"]) => {
      if (!userId) return Promise.resolve(false);
      const current = getGuidanceSnapshot(userId);
      if (current.status !== "ready") return Promise.resolve(false);
      return saveGuidanceState(resolveUiViewAuthClient(supabase), userId, build(current.state));
    },
    [userId],
  );

  const act = useCallback(
    (id: GuidanceStepId, action: NoticeAction) =>
      write((state) => applyGuidanceNoticeAction(state, id, action, now())),
    [write, now],
  );
  const setTips = useCallback(
    (tips: GuidanceTips) => write((state) => ({ ...state, tips })),
    [write],
  );
  const restoreAll = useCallback(() => write((state) => ({ ...state, notices: {} })), [write]);
  const retryRead = useCallback(() => {
    if (!userId) return Promise.resolve();
    return retryGuidanceRead(resolveUiViewAuthClient(supabase), userId);
  }, [userId]);

  return { ...snapshot, act, setTips, restoreAll, retryRead };
}
