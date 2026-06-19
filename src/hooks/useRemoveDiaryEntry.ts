/**
 * useRemoveDiaryEntry — single-entry diary/photo log removal hook.
 *
 * - Hard-deletes ONE diary_entries row by id via the authenticated client.
 * - RLS enforces owner-only deletion. No service role, no admin bypass.
 * - Scope is strictly the diary entry. No other tables are touched.
 * - Does NOT delete storage objects (no tested helper exists for that today).
 * - Toast copy is fixed and never echoes raw DB errors.
 * - On success, invalidates read-side query caches so Timeline, Plant
 *   Detail recent activity, Tent Plant Roster recency, Tent Detail
 *   Activity Panels, and Harvest Watch derivations refresh immediately.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  REMOVE_LOG_ERROR_TOAST,
  getRemoveSuccessToast,
} from "@/lib/diaryEntryRemovalRules";
import {
  buildDiaryRemovalInvalidationKeys,
  type DiaryEntryRemovalMetadata,
} from "@/lib/diaryEntryRemovalInvalidationRules";

export interface RemoveDiaryEntryArgs {
  id: string;
  isPhotoLog: boolean;
  /** Optional metadata used to invalidate downstream read queries. */
  plantId?: string | null;
  tentId?: string | null;
  growId?: string | null;
}

export interface UseRemoveDiaryEntryResult {
  remove: (args: RemoveDiaryEntryArgs) => Promise<boolean>;
  isRemoving: boolean;
}

export function useRemoveDiaryEntry(
  onRemoved?: (id: string) => void,
): UseRemoveDiaryEntryResult {
  const [isRemoving, setIsRemoving] = useState(false);
  const queryClient = useQueryClient();

  const remove = useCallback(
    async ({
      id,
      isPhotoLog,
      plantId,
      tentId,
      growId,
    }: RemoveDiaryEntryArgs): Promise<boolean> => {
      if (!id) return false;
      setIsRemoving(true);
      try {
        const { error } = await supabase
          .from("diary_entries")
          .delete()
          .eq("id", id);
        if (error) {
          // Safe diagnostic only; UI copy is generic.
          console.warn("[diary] remove failed", { code: error.code });
          toast.error(REMOVE_LOG_ERROR_TOAST);
          return false;
        }
        toast.success(getRemoveSuccessToast(isPhotoLog));
        const meta: DiaryEntryRemovalMetadata = {
          entryId: id,
          plantId,
          tentId,
          growId,
          isPhotoLog,
        };
        for (const key of buildDiaryRemovalInvalidationKeys(meta)) {
          queryClient.invalidateQueries({ queryKey: key });
        }
        onRemoved?.(id);
        return true;
      } catch (err) {
        console.warn("[diary] remove threw", {
          name: (err as { name?: string })?.name,
        });
        toast.error(REMOVE_LOG_ERROR_TOAST);
        return false;
      } finally {
        setIsRemoving(false);
      }
    },
    [onRemoved, queryClient],
  );

  return { remove, isRemoving };
}
