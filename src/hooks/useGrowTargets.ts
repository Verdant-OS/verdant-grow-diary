/**
 * useGrowTargets — read-only loader for per-grow environment targets.
 *
 * The `grow_targets` table is not currently part of the schema. This hook
 * attempts the query defensively so that when the table is added later the
 * Dashboard automatically picks it up — but today it safely resolves to
 * `null` and the UI renders "No grow targets configured."
 *
 * Read-only: SELECT only. No ai-coach call. No external-control surface.
 * No service_role. No new write paths.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import type { GrowTargets, MetricKey } from "@/lib/environmentTargetComparison";

export type TargetsState =
  | { status: "idle"; targets: GrowTargets | null }
  | { status: "loading"; targets: GrowTargets | null }
  | { status: "ok"; targets: GrowTargets | null }
  | { status: "unavailable"; targets: GrowTargets | null };

const FIELD_MAP: Record<string, MetricKey> = {
  temp: "temp",
  temperature: "temp",
  rh: "rh",
  humidity: "rh",
  vpd: "vpd",
  soil: "soil",
  soil_moisture: "soil",
  soil_ec: "soil_ec",
  ec: "soil_ec",
  soil_temp: "soil_temp",
  ppfd: "ppfd",
};

function normalize(row: Record<string, unknown> | null): GrowTargets | null {
  if (!row) return null;
  const out: GrowTargets = {};
  for (const [k, target] of Object.entries(FIELD_MAP)) {
    const min = row[`${k}_min`];
    const max = row[`${k}_max`];
    const minN = typeof min === "number" && Number.isFinite(min) ? min : null;
    const maxN = typeof max === "number" && Number.isFinite(max) ? max : null;
    if (minN !== null || maxN !== null) {
      out[target] = { min: minN, max: maxN };
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
      // Defensive: the table may not exist in the current schema. The
      // typed client only knows generated tables, so cast through `any`
      // and swallow schema errors as "no targets configured".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { data, error } = await client
        .from("grow_targets")
        .select("*")
        .eq("grow_id", growId)
        .maybeSingle();
      if (error) {
        // Missing table or RLS error → treat as no configured targets.
        setState({ status: "ok", targets: null });
        return;
      }
      setState({ status: "ok", targets: normalize(data) });
    } catch {
      setState({ status: "ok", targets: null });
    }
  }, [user, growId]);

  useEffect(() => {
    load();
  }, [load]);

  return state;
}

export default useGrowTargets;
