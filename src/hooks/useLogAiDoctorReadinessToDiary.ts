/**
 * useLogAiDoctorReadinessToDiary — thin hook wrapping a single
 * `diary_entries` insert that records an AI Doctor readiness check
 * (fresh vs stale vs missing snapshot, blocked vs allowed).
 *
 * Hard constraints:
 *  - Presenter-facing wrapper only. Never calls AI, RPC, functions.invoke,
 *    edge functions, or device control.
 *  - Never sets `user_id` (DB default = auth.uid()).
 *  - Never writes fake sensor readings; snapshot info is presence + age.
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  buildAiDoctorReadinessDiaryEntry,
  type BuildAiDoctorReadinessDiaryEntryArgs,
} from "@/lib/aiDoctorReadinessDiaryEntryRules";

export interface LogAiDoctorReadinessResult {
  ok: boolean;
  reason?: string;
}

export function useLogAiDoctorReadinessToDiary() {
  const queryClient = useQueryClient();
  const [logging, setLogging] = useState(false);

  const log = useCallback(
    async (
      args: BuildAiDoctorReadinessDiaryEntryArgs,
    ): Promise<LogAiDoctorReadinessResult> => {
      setLogging(true);
      const built = buildAiDoctorReadinessDiaryEntry(args);
      if (!built.ok) {
        const reason = (built as { ok: false; reason: string }).reason;
        toast.error("Could not log readiness", { description: reason });
        setLogging(false);
        return { ok: false, reason };
      }
      const { draft } = built;
      const { error } = await supabase.from("diary_entries").insert({
        grow_id: draft.grow_id,
        plant_id: draft.plant_id,
        tent_id: draft.tent_id,
        note: draft.note,
        details: draft.details as unknown as Json,
      });
      setLogging(false);
      if (error) {
        toast.error("Failed to log readiness", { description: error.message });
        return { ok: false, reason: error.message };
      }
      toast.success("Readiness logged to diary");
      queryClient.invalidateQueries({ queryKey: ["diary_entries"] });
      queryClient.invalidateQueries({ queryKey: ["timeline-memory"] });
      queryClient.invalidateQueries({ queryKey: ["plant-recent-activity"] });
      return { ok: true };
    },
    [queryClient],
  );

  return { log, logging };
}
