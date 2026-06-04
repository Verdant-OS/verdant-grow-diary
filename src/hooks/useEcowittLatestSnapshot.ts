/**
 * useEcowittLatestSnapshot — read-only loader that wires persisted
 * `sensor_readings` rows into the pure EcoWitt latest-snapshot view-model.
 *
 * Pipeline:
 *   sensor_readings (RLS-scoped to auth.uid)
 *     → ecowittLatestSnapshotFilter.selectEcowittCandidates
 *     → buildEcowittSnapshotViewModel
 *     → EcowittLatestSnapshotCard
 *
 * Hard constraints (stop-ship if violated):
 *  - Read-only: no .insert/.update/.delete/.upsert/.rpc, no edge-function
 *    invoke, no service_role, no device control.
 *  - Tent-scoped: only rows whose `tent_id` matches the selected tent are
 *    considered. A newer reading from a different tent MUST NOT bleed in.
 *  - Never fabricates a live reading. Empty input → calm empty state.
 *  - VPD is derived inside the view-model from temp + RH. This hook never
 *    computes VPD, never labels anything "Live VPD".
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  buildEcowittLatestSnapshot,
  type EcowittSensorReadingRow,
} from "@/lib/ecowittLatestSnapshotFilter";
import type { EcowittSnapshotViewModel } from "@/lib/ecowittReadingViewModel";

export interface UseEcowittLatestSnapshotInput {
  tentId: string | null | undefined;
  /** Optional plant scope. When set, only rows whose plant_id matches are kept. */
  plantId?: string | null;
  /** Optional ceiling on how many recent rows to fetch. */
  limit?: number;
  /** Wall-clock — injected for deterministic tests. */
  now?: Date;
}

export type EcowittSnapshotStatus = "idle" | "loading" | "ok" | "error";

export interface UseEcowittLatestSnapshotResult {
  status: EcowittSnapshotStatus;
  viewModel: EcowittSnapshotViewModel | null;
  /** Friendly retry-friendly error copy when status === "error". */
  errorMessage: string | null;
}

const ERROR_COPY =
  "Couldn’t load EcoWitt readings. Check your connection and try again.";

/**
 * Pure transform — exported for tests that feed in fake rows without
 * spinning up TanStack Query / Supabase.
 */
export function buildEcowittSnapshotFromRows(
  rows: readonly EcowittSensorReadingRow[] | null | undefined,
  input: UseEcowittLatestSnapshotInput,
): EcowittSnapshotViewModel | null {
  if (!input.tentId) return null;
  return buildEcowittLatestSnapshot(
    rows ?? [],
    { tentId: input.tentId, plantId: input.plantId ?? null },
    { now: input.now },
  );
}

export function useEcowittLatestSnapshot(
  input: UseEcowittLatestSnapshotInput,
): UseEcowittLatestSnapshotResult {
  const { user } = useAuth();
  const { tentId, plantId, limit, now } = input;
  const enabled = !!user && !!tentId;

  const query = useQuery<EcowittSensorReadingRow[]>({
    queryKey: [
      "ecowitt-latest-snapshot",
      user?.id ?? "anon",
      tentId ?? "none",
      plantId ?? "none",
    ],
    enabled,
    queryFn: async () => {
      // Newest first; oversample so the view-model can pick the newest
      // valid candidate even if recent rows are partial/suspicious.
      const { data, error } = await supabase
        .from("sensor_readings")
        .select("id,tent_id,source,captured_at,ts,raw_payload")
        .eq("tent_id", tentId!)
        .order("captured_at", { ascending: false, nullsFirst: false })
        .order("ts", { ascending: false })
        .limit(Math.max(1, Math.min(limit ?? 50, 200)));
      if (error) throw error;
      return (data ?? []) as EcowittSensorReadingRow[];
    },
  });

  if (!enabled) {
    return { status: "idle", viewModel: null, errorMessage: null };
  }
  if (query.isLoading || (query.isFetching && !query.data)) {
    return { status: "loading", viewModel: null, errorMessage: null };
  }
  if (query.isError) {
    return { status: "error", viewModel: null, errorMessage: ERROR_COPY };
  }

  const vm = buildEcowittSnapshotFromRows(query.data ?? [], {
    tentId,
    plantId: plantId ?? null,
    now,
  });
  return { status: "ok", viewModel: vm, errorMessage: null };
}

export const ECOWITT_LATEST_SNAPSHOT_ERROR_COPY = ERROR_COPY;

export default useEcowittLatestSnapshot;
