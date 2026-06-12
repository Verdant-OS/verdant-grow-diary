/**
 * useRecentFeedingsForDefaults — read-only fetch of the most recent diary
 * rows scoped to the QuickLog target, used SOLELY to derive Last-Used
 * feeding defaults for QuickLogV2 Feed.
 *
 * Read-only. Never writes. Never exposes raw rows to UI directly — pass the
 * result to `buildFeedingDefaults` (pure) before rendering.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const RECENT_FEEDINGS_DEFAULTS_LIMIT = 20;

export interface RecentFeedingsForDefaultsInput {
  plantId?: string | null;
  tentId?: string | null;
  growId?: string | null;
}

export function useRecentFeedingsForDefaults(
  input: RecentFeedingsForDefaultsInput,
) {
  const plantId = input.plantId ?? null;
  const tentId = input.tentId ?? null;
  const growId = input.growId ?? null;
  const enabled = Boolean(plantId || tentId || growId);

  return useQuery({
    queryKey: [
      "quicklog_v2_feed_defaults",
      plantId,
      tentId,
      growId,
    ],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("diary_entries")
        .select("*")
        .order("entry_at", { ascending: false })
        .limit(RECENT_FEEDINGS_DEFAULTS_LIMIT);
      if (plantId) {
        q = q.eq("plant_id", plantId);
      } else if (tentId) {
        q = q.eq("tent_id", tentId);
      } else if (growId) {
        q = q.eq("grow_id", growId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown[];
    },
  });
}
