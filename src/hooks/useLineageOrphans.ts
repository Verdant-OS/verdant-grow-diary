/**
 * useLineageOrphans — load unbound tents/plants (null grow_id) for the
 * signed-in user. RLS-scoped. Read-only until bulk assign is invoked.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";

export interface LineageOrphanIds {
  tentIds: string[];
  plantIds: string[];
}

export function useLineageOrphans() {
  const { user } = useAuth();
  const [data, setData] = useState<LineageOrphanIds>({ tentIds: [], plantIds: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setData({ tentIds: [], plantIds: [] });
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    const [tentsRes, plantsRes] = await Promise.all([
      supabase
        .from("tents")
        .select("id")
        .eq("user_id", user.id)
        .is("grow_id", null)
        .eq("is_archived", false),
      supabase
        .from("plants")
        .select("id")
        .eq("user_id", user.id)
        .is("grow_id", null)
        .eq("is_archived", false),
    ]);
    if (tentsRes.error || plantsRes.error) {
      setError(tentsRes.error?.message ?? plantsRes.error?.message ?? "Failed to load orphans");
      setData({ tentIds: [], plantIds: [] });
    } else {
      setError(null);
      setData({
        tentIds: (tentsRes.data ?? []).map((r) => r.id as string),
        plantIds: (plantsRes.data ?? []).map((r) => r.id as string),
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    tentIds: data.tentIds,
    plantIds: data.plantIds,
    unboundTentCount: data.tentIds.length,
    unboundPlantCount: data.plantIds.length,
    loading,
    error,
    refresh,
  };
}

/**
 * Bulk-assign all null-grow_id tents and plants to the given grow.
 * Order: tents first (then backfill plants in those tents), then remaining
 * plants still missing grow_id. Only updates grow_id; never diary/AQ/devices.
 */
export async function bulkAssignOrphansToGrow(input: {
  userId: string;
  growId: string;
  ownedGrowIds: readonly string[];
}): Promise<
  { ok: true; tentsUpdated: number; plantsUpdated: number } | { ok: false; message: string }
> {
  const { userId, growId, ownedGrowIds } = input;
  if (!userId || !growId) {
    return { ok: false, message: "Missing user or grow." };
  }
  if (!ownedGrowIds.includes(growId)) {
    return { ok: false, message: "You do not own that grow." };
  }

  // 1) Unbound tents → grow
  const { data: tents, error: tentErr } = await supabase
    .from("tents")
    .update({ grow_id: growId })
    .eq("user_id", userId)
    .is("grow_id", null)
    .eq("is_archived", false)
    .select("id");
  if (tentErr) return { ok: false, message: tentErr.message };
  const tentIds = (tents ?? []).map((t) => t.id as string);

  // 2) Backfill plants in those tents (any plant still missing or mismatched)
  let plantBackfill = 0;
  if (tentIds.length > 0) {
    const { data: linked, error: linkErr } = await supabase
      .from("plants")
      .update({ grow_id: growId })
      .eq("user_id", userId)
      .in("tent_id", tentIds)
      .eq("is_archived", false)
      .select("id");
    if (linkErr)
      return { ok: false, message: `Tents updated, plant backfill failed: ${linkErr.message}` };
    plantBackfill = linked?.length ?? 0;
  }

  // 3) Remaining plants with null grow_id (no tent or still unbound)
  const { data: plants, error: plantErr } = await supabase
    .from("plants")
    .update({ grow_id: growId })
    .eq("user_id", userId)
    .is("grow_id", null)
    .eq("is_archived", false)
    .select("id");
  if (plantErr) return { ok: false, message: plantErr.message };

  // plantBackfill may include plants already counted in plants — report
  // remaining-null updates + tent count; total plants touched = backfill + remaining
  // but remaining is only still-null after backfill. Use remaining + backfill for toast.
  const remainingPlants = plants?.length ?? 0;

  return {
    ok: true,
    tentsUpdated: tentIds.length,
    plantsUpdated: plantBackfill + remainingPlants,
  };
}
