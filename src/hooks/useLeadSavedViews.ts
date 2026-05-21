/**
 * Hook for operator-saved /leads views, persisted to localStorage.
 *
 * Only filter/search/sort preferences are stored — never lead data.
 * Malformed storage is dropped silently via parseStoredViews.
 */
import { useCallback, useEffect, useState } from "react";
import {
  addView,
  buildView,
  parseStoredViews,
  removeView,
  renameView,
  serializeViews,
  STORAGE_KEY,
  type LeadSavedView,
  type SavedViewDraft,
} from "@/lib/leadSavedViewsRules";

function readStorage(): LeadSavedView[] {
  if (typeof window === "undefined") return [];
  try {
    return parseStoredViews(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeStorage(views: LeadSavedView[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeViews(views));
  } catch {
    /* quota / disabled storage — ignore */
  }
}

export interface UseLeadSavedViewsResult {
  views: LeadSavedView[];
  saveView: (draft: SavedViewDraft) => LeadSavedView | null;
  renameView: (id: string, name: string) => void;
  deleteView: (id: string) => void;
}

export function useLeadSavedViews(): UseLeadSavedViewsResult {
  const [views, setViews] = useState<LeadSavedView[]>(() => readStorage());

  useEffect(() => {
    writeStorage(views);
  }, [views]);

  const saveView = useCallback<UseLeadSavedViewsResult["saveView"]>(
    (draft) => {
      const v = buildView(draft);
      if (!v) return null;
      setViews((prev) => addView(prev, v));
      return v;
    },
    [],
  );

  const renameViewCb = useCallback<UseLeadSavedViewsResult["renameView"]>(
    (id, name) => setViews((prev) => renameView(prev, id, name)),
    [],
  );

  const deleteViewCb = useCallback<UseLeadSavedViewsResult["deleteView"]>(
    (id) => setViews((prev) => removeView(prev, id)),
    [],
  );

  return {
    views,
    saveView,
    renameView: renameViewCb,
    deleteView: deleteViewCb,
  };
}
