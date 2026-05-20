/**
 * useGrowTargets — read-only loader for per-grow environment targets.
 *
 * Loads the single grow_targets row for the scoped grow (if any) and
 * normalizes it into the shared GrowTargets shape. RLS enforces that users
 * only see their own targets.
 *
 * Read-only: SELECT only. No ai-coach call. No external-control surface.
 * No elevated keys. No new write paths.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import type { GrowTargets, MetricKey } from "@/lib/environmentTargetComparison";

export type TargetsState = (
  | { status: "idle"; targets: GrowTargets | null }
  | { status: "loading"; targets: GrowTargets | null }
  | { status: "ok"; targets: GrowTargets | null }
  | { status: "unavailable"; targets: GrowTargets | null }
) & { reload: () => void };


const COLUMN_TO_METRIC: Record<string, MetricKey> = {
  temp: "temp",
  rh: "rh",
  vpd: "vpd",
  soil_wc: "soil",
  soil_ec: "soil_ec",
  soil_temp: "soil_temp",
  ppfd: "ppfd",
};

function toFinite(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeTargetsRow(
  row: Record<string, unknown> | null,
): GrowTargets | null {
  if (!row) return null;
  const out: GrowTargets = {};
  for (const [col, metric] of Object.entries(COLUMN_TO_METRIC)) {
    const min = toFinite(row[`${col}_min`]);
    const max = toFinite(row[`${col}_max`]);
    if (min !== null || max !== null) {
      out[metric] = { min, max };
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function useGrowTargets(
  growId: string | null | undefined,
): TargetsState {
  const { user } = useAuth();
  const [state, setState] = useState<TargetsState>({
    status: "idle",
    targets: null,
  });

  const load = useCallback(async () => {
    if (!user || !growId) {
      setState({ status: "idle", targets: null });
      return;
    }
    setState({ status: "loading", targets: null });
    try {
      const { data, error } = await supabase
        .from("grow_targets")
        .select("*")
        .eq("grow_id", growId)
        .maybeSingle();
      if (error) {
        setState({ status: "unavailable", targets: null });
        return;
      }
      setState({
        status: "ok",
        targets: normalizeTargetsRow(data as Record<string, unknown> | null),
      });
    } catch {
      setState({ status: "unavailable", targets: null });
    }
  }, [user, growId]);

  useEffect(() => {
    load();
  }, [load]);

  return state;
}

export default useGrowTargets;
