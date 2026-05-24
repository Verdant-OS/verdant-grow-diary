// React Query hooks for Phase 1 Supabase-backed grow data.
// Falls back to mock data on Supabase error, null/undefined data, or empty
// initial result so the UI stays predictable during the live-data transition.
//
// The fallback is NOT silent: every query records explicit source metadata
// (see GrowDataSourceMeta) so consuming pages can label demo/mock data
// honestly via growDataSourceLabelRules + GrowDataSourceBadge.
//
// Naming mirrors useMockData.ts (useTents -> useGrowTents, etc.) to keep a
// later 1:1 page migration mechanical. Query keys are namespaced under
// ["grow", ...] to avoid clashing with the existing useMockData cache.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { tents, plants, sensorReadings, type Tent, type Plant, type SensorReading } from "@/mock";
import {
  fetchTents,
  fetchTent,
  fetchPlants,
  fetchPlant,
  fetchSensorReadings,
} from "@/lib/growRepo";

// ---------------------------------------------------------------------------
// Source metadata
// ---------------------------------------------------------------------------

export type GrowDataSource = "supabase" | "mock" | "mixed" | "unavailable";

export interface GrowDataSourceMeta {
  isDemoData: boolean;
  dataSource: GrowDataSource;
  /** Short, UI-safe reason code. Never contains raw error messages. */
  sourceReason: string;
}

export const DEFAULT_GROW_DATA_META: GrowDataSourceMeta = {
  isDemoData: false,
  dataSource: "unavailable",
  sourceReason: "no-data",
};

function metaKey(parts: readonly unknown[]): string {
  return parts.map((p) => (p == null ? "null" : String(p))).join("|");
}

const metaStore = new Map<string, GrowDataSourceMeta>();

function recordMeta(key: readonly unknown[], meta: GrowDataSourceMeta): void {
  metaStore.set(metaKey(key), meta);
}

export function getGrowDataMeta(key: readonly unknown[]): GrowDataSourceMeta {
  return metaStore.get(metaKey(key)) ?? DEFAULT_GROW_DATA_META;
}

/** Combine multiple section metas into a single status. Pure + deterministic. */
export function combineGrowDataMeta(
  metas: readonly GrowDataSourceMeta[],
): GrowDataSourceMeta {
  if (metas.length === 0) return DEFAULT_GROW_DATA_META;
  const sources = new Set(metas.map((m) => m.dataSource));
  if (sources.size === 1) {
    const only = metas[0];
    return { ...only, sourceReason: only.sourceReason };
  }
  const hasReal = sources.has("supabase");
  const hasMock = sources.has("mock");
  if (hasReal && hasMock) {
    return {
      isDemoData: true,
      dataSource: "mixed",
      sourceReason: "mixed:real-and-demo",
    };
  }
  // Any combination involving unavailable is treated as unavailable-degraded.
  return {
    isDemoData: metas.some((m) => m.isDemoData),
    dataSource: hasReal ? "mixed" : "unavailable",
    sourceReason: "partial",
  };
}

/** Test helper. Not for UI consumption. */
export const __growDataFallbacks = { count: 0, lastReason: "" as string };
export function __resetGrowDataMeta(): void {
  metaStore.clear();
  __growDataFallbacks.count = 0;
  __growDataFallbacks.lastReason = "";
}

function fellBack(reason: string) {
  __growDataFallbacks.count += 1;
  __growDataFallbacks.lastReason = reason;
}

// ---------------------------------------------------------------------------
// withFallback
// ---------------------------------------------------------------------------

async function withFallback<T>(
  scope: string,
  key: readonly unknown[],
  run: () => Promise<T>,
  fallback: () => T,
  isEmpty: (v: T) => boolean,
): Promise<T> {
  try {
    const result = await run();
    if (result == null || isEmpty(result)) {
      fellBack(`${scope}:empty`);
      const fb = fallback();
      const fbEmpty = fb == null || isEmpty(fb);
      recordMeta(key, {
        isDemoData: !fbEmpty,
        dataSource: fbEmpty ? "unavailable" : "mock",
        sourceReason: fbEmpty ? "no-rows" : "fallback:empty",
      });
      return fb;
    }
    recordMeta(key, {
      isDemoData: false,
      dataSource: "supabase",
      sourceReason: "live:rows",
    });
    return result;
  } catch (err) {
    // Never leak raw error contents into UI-safe metadata.
    fellBack(`${scope}:error:${(err as Error)?.message ?? "unknown"}`);
    const fb = fallback();
    const fbEmpty = fb == null || isEmpty(fb);
    recordMeta(key, {
      isDemoData: !fbEmpty,
      dataSource: fbEmpty ? "unavailable" : "mock",
      sourceReason: fbEmpty ? "fallback:error:no-rows" : "fallback:error",
    });
    return fb;
  }
}

const isArrEmpty = <T,>(v: T[]) => v.length === 0;
const never = <T,>(_v: T) => false;
const isNullish = <T,>(v: T) => v == null;

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useGrowTents(growId?: string): UseQueryResult<Tent[]> {
  const key = ["grow", "tents", growId ?? "all"] as const;
  return useQuery({
    queryKey: [...key],
    queryFn: () =>
      withFallback(
        "tents",
        key,
        () => fetchTents(growId),
        () => (growId ? tents.filter((t) => t.growId === growId) : tents),
        isArrEmpty,
      ),
  });
}

export function useGrowTent(id?: string): UseQueryResult<Tent | null> {
  const key = ["grow", "tent", id ?? null] as const;
  return useQuery({
    queryKey: [...key],
    enabled: !!id,
    queryFn: () =>
      withFallback(
        "tent",
        key,
        () => fetchTent(id as string),
        () => tents.find((t) => t.id === id) ?? null,
        isNullish,
      ),
  });
}

export interface UseGrowPlantsOptions {
  /** Include archived/merged plants. Defaults to false. */
  includeArchived?: boolean;
}

export function useGrowPlants(
  tentId?: string,
  growId?: string,
  opts: UseGrowPlantsOptions = {},
): UseQueryResult<Plant[]> {
  const includeArchived = !!opts.includeArchived;
  const key = (
    includeArchived
      ? ["grow", "plants", tentId ?? "all", growId ?? "all", "with-archived"]
      : ["grow", "plants", tentId ?? "all", growId ?? "all"]
  ) as readonly unknown[];
  return useQuery({
    queryKey: [...key],
    queryFn: () =>
      withFallback(
        "plants",
        key,
        () => fetchPlants(tentId, growId, { includeArchived }),
        () => {
          let list = plants;
          if (tentId) list = list.filter((p) => p.tentId === tentId);
          if (growId) list = list.filter((p) => p.growId === growId);
          if (!includeArchived) list = list.filter((p) => !p.isArchived);
          return list;
        },
        isArrEmpty,
      ),
  });
}

export function useGrowPlant(id?: string): UseQueryResult<Plant | null> {
  const key = ["grow", "plant", id ?? null] as const;
  return useQuery({
    queryKey: [...key],
    enabled: !!id,
    queryFn: () =>
      withFallback(
        "plant",
        key,
        () => fetchPlant(id as string),
        () => plants.find((p) => p.id === id) ?? null,
        isNullish,
      ),
  });
}

export function useGrowSensorReadings(tentId?: string): UseQueryResult<SensorReading[]> {
  const key = ["grow", "sensors", tentId ?? "all"] as const;
  return useQuery({
    queryKey: [...key],
    queryFn: () =>
      withFallback(
        "sensors",
        key,
        () => fetchSensorReadings(tentId),
        () =>
          tentId ? sensorReadings.filter((r) => r.tentId === tentId) : sensorReadings,
        isArrEmpty,
      ),
  });
}
