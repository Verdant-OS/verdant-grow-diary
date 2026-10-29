/**
 * useUiViewPreference — the signed-in grower's home view (Simple or Advanced).
 *
 * Reads the account copy once per user through the shared service, exposes the
 * honest read status, and offers one setter that writes to the account. The
 * Supabase client is resolved lazily so a page test that mocks the client
 * without an auth surface reads as "unavailable" instead of throwing.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ensureUiViewPreferenceLoaded,
  getUiViewPreferenceVersion,
  getUiViewSnapshot,
  resolveUiViewAuthClient,
  retryUiViewPreferenceRead,
  saveUiViewPreference,
  subscribeUiViewPreference,
  type UiViewSnapshot,
} from "@/lib/uiViewPreferenceService";
import type { UiView } from "@/lib/uiViewPreferenceRules";

export interface UiViewPreferenceUser {
  id: string;
  user_metadata?: unknown;
}

export interface UseUiViewPreference extends UiViewSnapshot {
  setView: (view: UiView) => Promise<boolean>;
  retryRead: () => Promise<void>;
}

export function useUiViewPreference(
  user: UiViewPreferenceUser | null | undefined,
): UseUiViewPreference {
  const version = useSyncExternalStore(
    subscribeUiViewPreference,
    getUiViewPreferenceVersion,
    getUiViewPreferenceVersion,
  );
  const userId = user?.id ?? null;
  const sessionMetadata = user?.user_metadata;

  useEffect(() => {
    if (!userId) return;
    void ensureUiViewPreferenceLoaded(resolveUiViewAuthClient(supabase), userId);
  }, [userId]);

  const snapshot = useMemo(
    () => getUiViewSnapshot(userId, sessionMetadata),
    // `version` is the store's change counter; it is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, sessionMetadata, version],
  );

  const setView = useCallback(
    (view: UiView) => {
      if (!userId) return Promise.resolve(false);
      return saveUiViewPreference(resolveUiViewAuthClient(supabase), userId, view);
    },
    [userId],
  );

  const retryRead = useCallback(() => {
    if (!userId) return Promise.resolve();
    return retryUiViewPreferenceRead(resolveUiViewAuthClient(supabase), userId);
  }, [userId]);

  return { ...snapshot, setView, retryRead };
}
