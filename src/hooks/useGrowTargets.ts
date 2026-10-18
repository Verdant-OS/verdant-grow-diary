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
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import type { GrowTargets, MetricKey } from "@/lib/environmentTargetComparison";
import { growTargetsRetryDelayMs } from "@/lib/growTargetsRetryRules";

type InnerState =
  | { status: "idle"; targets: GrowTargets | null }
  | { status: "loading"; targets: GrowTargets | null }
  | { status: "ok"; targets: GrowTargets | null }
  | { status: "unavailable"; targets: GrowTargets | null };

export type TargetsState = InnerState & { reload: () => void };

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

export function normalizeTargetsRow(row: Record<string, unknown> | null): GrowTargets | null {
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

export interface UseGrowTargetsOptions {
  /**
   * Retry an "unavailable" read on a bounded backoff (growTargetsRetryRules).
   * Used by fail-closed alert persistence so a transient error cannot leave
   * it skipped for the rest of the mounted session.
   */
  retryOnUnavailable?: boolean;
}

export function useGrowTargets(
  growId: string | null | undefined,
  options: UseGrowTargetsOptions = {},
): TargetsState {
  const retryOnUnavailable = options.retryOnUnavailable === true;
  const retryAttemptRef = useRef(0);
  const { user } = useAuth();
  const [state, setState] = useState<InnerState>({
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
    retryAttemptRef.current = 0;
    load();
  }, [load]);

  useEffect(() => {
    if (state.status === "ok") retryAttemptRef.current = 0;
    if (!retryOnUnavailable || state.status !== "unavailable") return;
    const delay = growTargetsRetryDelayMs(retryAttemptRef.current);
    if (delay === null) return;
    const timer = window.setTimeout(() => {
      retryAttemptRef.current += 1;
      load();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state.status, retryOnUnavailable, load]);

  return { ...state, reload: load };
}

export default useGrowTargets;
