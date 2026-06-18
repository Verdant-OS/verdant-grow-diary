/**
 * useRemoveDiaryEntry — single-entry diary/photo log removal hook.
 *
 * - Hard-deletes ONE diary_entries row by id via the authenticated client.
 * - RLS enforces owner-only deletion. No service role, no admin bypass.
 * - Scope is strictly the diary entry. No other tables are touched.
 * - Does NOT delete storage objects (no tested helper exists for that today).
 * - Toast copy is fixed and never echoes raw DB errors.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  REMOVE_LOG_ERROR_TOAST,
  getRemoveSuccessToast,
} from "@/lib/diaryEntryRemovalRules";

export interface RemoveDiaryEntryArgs {
  id: string;
  isPhotoLog: boolean;
}

export interface UseRemoveDiaryEntryResult {
  remove: (args: RemoveDiaryEntryArgs) => Promise<boolean>;
  isRemoving: boolean;
}

export function useRemoveDiaryEntry(
  onRemoved?: (id: string) => void,
): UseRemoveDiaryEntryResult {
  const [isRemoving, setIsRemoving] = useState(false);

  const remove = useCallback(
    async ({ id, isPhotoLog }: RemoveDiaryEntryArgs): Promise<boolean> => {
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
    [onRemoved],
  );

  return { remove, isRemoving };
}
