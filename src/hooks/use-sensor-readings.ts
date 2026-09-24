import { useCallback, useRef } from "react";
import {
  useQueries,
  useQuery,
  type QueryObserverResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  effectiveSensorReadingsQuery,
  requireEffectiveSensorReadings,
  EFFECTIVE_SENSOR_QUERY_VERSION,
} from "@/lib/effectiveSensorReadings";
import type { SensorReadingRow } from "@/lib/db";
import { buildPrivateSensorQueryKey } from "@/lib/growDataQueryKeyRules";
import { isUuid } from "@/lib/isUuid";
import {
  combineTentScopedSensorWindows,
  normalizeSensorReadingTentScope,
  type TentScopedReadStatus,
} from "@/lib/tentScopedSensorReadingsRules";
import { useAuth } from "@/store/auth";

/**
 * Explicit multi-tent scope for aggregate surfaces (Plants, Dashboard).
 * `tentIds: null` means the caller's tents are not resolved yet; the read
 * stays pending instead of reporting an empty (falsely "no evidence") result.
 */
export interface SensorReadingsTentScope {
  tentIds: readonly (string | null | undefined)[] | null;
  /** The read that resolves `tentIds` failed: report an error, not endless loading. */
  scopeError?: boolean;
  /** Re-run the scope read on Retry (for example the tents query's `refetch`). */
  retryScope?: () => unknown;
}

/** Query-like result for a tent-scoped read (one bounded window per tent). */
export interface TentScopedSensorReadingsResult {
  data: SensorReadingRow[] | undefined;
  status: TentScopedReadStatus;
  isPending: boolean;
  /** True until every tent window has data, including while scope is unresolved. */
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  isFetching: boolean;
  fetchStatus: "fetching" | "paused" | "idle";
  isPlaceholderData: false;
  error: unknown;
  refetch: () => Promise<void>;
}

const NO_TENT_SCOPE: string[] = [];

function tentWindowQueryKey(
  userId: string | null | undefined,
  tentId: string,
  perTentLimit: number,
  sources: readonly string[],
) {
  return buildPrivateSensorQueryKey(userId, [
    tentId,
    perTentLimit,
    sources.length > 0 ? sources.join("|") : "all-sources",
    EFFECTIVE_SENSOR_QUERY_VERSION,
  ]);
}

async function fetchTentSensorWindow(
  tentId: string,
  perTentLimit: number,
  sources: readonly string[],
): Promise<SensorReadingRow[]> {
  let query = effectiveSensorReadingsQuery().select("*").eq("tent_id", tentId);
  // Apply source scope before ordering/limiting. This prevents a busy
  // live stream from crowding older imported history out of a bounded
  // CSV-only read window.
  if (sources.length > 0) {
    query = query.in("source", [...sources]);
  }
  const { data, error } = await query
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("ts", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(perTentLimit);
  if (error) throw error;
  return requireEffectiveSensorReadings(data);
}

/**
 * Sensor readings for one tent, all tents, or an explicit set of tents.
 *
 * - `{ tentIds }` reads one bounded window per tent (`limit` rows each) and
 *   merges them newest-first. Aggregate surfaces must use this form: the
 *   unscoped all-tents read timed out in production (Postgres `57014`) while
 *   tent-scoped reads over the same view are index-bounded.
 * - `undefined` keeps the legacy unscoped all-tents read.
 * - `null` is an explicit no-scope sentinel; a non-UUID legacy/mock id must
 *   never be sent to a UUID column.
 */
export function useSensorReadings(
  scope: SensorReadingsTentScope,
  limit?: number,
): TentScopedSensorReadingsResult;
export function useSensorReadings(
  tentId?: string | null,
  limit?: number,
): UseQueryResult<SensorReadingRow[]>;
export function useSensorReadings(
  scopeOrTentId?: string | null | SensorReadingsTentScope,
  limit = 200,
): UseQueryResult<SensorReadingRow[]> | TentScopedSensorReadingsResult {
  const { user } = useAuth();
  const tentScope =
    typeof scopeOrTentId === "object" && scopeOrTentId !== null ? scopeOrTentId : null;
  const tentId = tentScope ? null : (scopeOrTentId as string | null | undefined);
  // Both hooks run on every render (rules of hooks); only one is active.
  const normalizedScope = tentScope ? normalizeSensorReadingTentScope(tentScope.tentIds) : null;
  const scopeIds = normalizedScope ?? NO_TENT_SCOPE;
  const scopeFailed = Boolean(tentScope?.scopeError) && normalizedScope === null;
  const scopeSignature = tentScope
    ? (normalizedScope?.join(",") ?? (scopeFailed ? "failed" : "unresolved"))
    : "off";
  const retryScopeRef = useRef<(() => unknown) | undefined>(undefined);
  retryScopeRef.current = tentScope?.retryScope;
  const combineTentWindows = useCallback(
    (results: QueryObserverResult<SensorReadingRow[]>[]): TentScopedSensorReadingsResult => {
      const combined =
        scopeSignature === "failed"
          ? { status: "error" as const, data: undefined }
          : combineTentScopedSensorWindows(
              scopeSignature === "unresolved" ? null : scopeIds,
              results.map((r) => ({ data: r.data, isPending: r.isPending, isError: r.isError })),
            );
      return {
        data: combined.data,
        status: combined.status,
        isPending: combined.status === "pending",
        isLoading: combined.status === "pending",
        isError: combined.status === "error",
        isSuccess: combined.status === "success",
        isFetching: results.some((r) => r.isFetching),
        fetchStatus: results.some((r) => r.fetchStatus === "fetching")
          ? "fetching"
          : results.some((r) => r.fetchStatus === "paused")
            ? "paused"
            : "idle",
        isPlaceholderData: false,
        error: results.find((r) => r.isError)?.error ?? null,
        refetch: async () => {
          await Promise.all([...results.map((r) => r.refetch()), retryScopeRef.current?.()]);
        },
      };
    },
    // scopeIds is derived from scopeSignature; the signature is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeSignature],
  );
  const tentScoped = useQueries({
    queries: scopeIds.map((id) => ({
      queryKey: tentWindowQueryKey(user?.id, id, limit, NO_TENT_SCOPE),
      retry: false,
      queryFn: () => fetchTentSensorWindow(id, limit, NO_TENT_SCOPE),
    })),
    combine: combineTentWindows,
  });

  // `undefined` intentionally preserves the existing all-tents query used by
  // aggregate dashboards. `null` is an explicit no-scope sentinel, while a
  // non-UUID legacy/mock id must never be sent to a UUID column.
  const enabled = !tentScope && (tentId === undefined || isUuid(tentId));
  const scopeKey = enabled ? (tentId ?? "all") : "none";
  const single = useQuery({
    // Keep explicit no-scope separate from the intentional all-tents cache so
    // a disabled query can never surface aggregate readings from cache.
    queryKey: buildPrivateSensorQueryKey(user?.id, [
      scopeKey,
      limit,
      EFFECTIVE_SENSOR_QUERY_VERSION,
    ]),
    enabled,
    retry: false,
    queryFn: async () => {
      if (!enabled) return [];
      let q = effectiveSensorReadingsQuery()
        .select("*")
        // Actual observation time takes precedence. CSV rows retain historical
        // `captured_at` while `ts` can be one shared import time.
        .order("captured_at", { ascending: false, nullsFirst: false })
        .order("ts", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (tentId) q = q.eq("tent_id", tentId);
      const { data, error } = await q;
      if (error) throw error;
      return requireEffectiveSensorReadings(data);
    },
  });
  return tentScope ? tentScoped : single;
}

/** Per-tent outcome; loading includes a first read paused for connectivity. */
export type TentSensorReadStatus = "loading" | "error" | "refresh_error" | "success";

/**
 * Per-tent sensor reading fetch. Each tent gets its own `limit`-bounded
 * window so a busy tent cannot starve another tent's readings out of a
 * shared global cap (which previously made Dashboard stability summaries
 * report "unavailable" even when valid VPD rows existed for the tent).
 *
 * Returns a map keyed by tentId. Tents with no rows map to `[]`.
 * `statusByTent` distinguishes a genuinely empty result ("success" + [])
 * from a pending or failed request — SENSOR TRUTH: absence must be
 * established, never assumed from an unset slot.
 * An optional explicit source filter is applied before the per-tent limit;
 * callers that need historical CSV evidence are therefore not starved by a
 * higher-volume live stream.
 * Read-only: no writes, no automation, no device control.
 */
export function useSensorReadingsByTents(
  tentIds: string[],
  perTentLimit = 200,
  sourceFilter?: readonly string[] | null,
): {
  byTent: Record<string, SensorReadingRow[]>;
  statusByTent: Record<string, TentSensorReadStatus>;
  refreshingByTent: Record<string, boolean>;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<void>;
  /** Re-fetch exactly one tent window; unknown ids are a safe no-op. */
  retryTent: (tentId: string) => Promise<void>;
} {
  const { user } = useAuth();
  // Stable, de-duplicated id list so query order is deterministic and the
  // hook count is stable across renders for a given tent set.
  const ids = Array.from(new Set(tentIds)).sort();
  const sources = Array.from(
    new Set((sourceFilter ?? []).map((source) => source.trim().toLowerCase()).filter(Boolean)),
  ).sort();
  const results = useQueries({
    queries: ids.map((tentId) => ({
      queryKey: tentWindowQueryKey(user?.id, tentId, perTentLimit, sources),
      retry: false,
      queryFn: () => fetchTentSensorWindow(tentId, perTentLimit, sources),
    })),
  });
  const byTent: Record<string, SensorReadingRow[]> = {};
  const statusByTent: Record<string, TentSensorReadStatus> = {};
  const refreshingByTent: Record<string, boolean> = {};
  ids.forEach((id, i) => {
    const result = results[i];
    byTent[id] = (result?.data as SensorReadingRow[] | undefined) ?? [];
    refreshingByTent[id] = Boolean(result?.isFetching && !result.isLoading);
    // isLoading excludes pending+paused reads. No first result still means
    // unresolved, even when connectivity has prevented the request starting.
    statusByTent[id] =
      !result || result.isPending
        ? "loading"
        : result?.isError
          ? result.data !== undefined
            ? "refresh_error"
            : "error"
          : "success";
  });
  return {
    byTent,
    statusByTent,
    refreshingByTent,
    isLoading: results.some((r) => r.isPending),
    isError: results.some((r) => r.isError),
    refetch: async () => {
      await Promise.all(results.map((result) => result.refetch()));
    },
    retryTent: async (tentId: string) => {
      const index = ids.indexOf(tentId);
      const result = index >= 0 ? results[index] : undefined;
      if (!result) return;
      await result.refetch();
    },
  };
}
