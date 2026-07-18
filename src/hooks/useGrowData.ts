// React Query hooks for Supabase-backed grow data.
//
// These hooks are used by authenticated grower surfaces, so an empty or failed
// database read must stay honest: empty reads return an empty/null value and
// failed tent/plant reads remain React Query errors. Mock fixtures live behind
// the separate, explicit useMockData surface and are never injected here.
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Tent, Plant, SensorReading } from "@/mock";
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

/**
 * Legacy test diagnostic. Counts honest empty/error outcomes, never mock
 * substitution.
 */
export const __growDataFallbacks = { count: 0, lastReason: "" as string };
export function __resetGrowDataMeta(): void {
  metaStore.clear();
  __growDataFallbacks.count = 0;
  __growDataFallbacks.lastReason = "";
}

function recordUnavailableOutcome(reason: string) {
  __growDataFallbacks.count += 1;
  __growDataFallbacks.lastReason = reason;
}

// ---------------------------------------------------------------------------
// Source-aware query boundary
// ---------------------------------------------------------------------------

interface WithSourceMetaOptions<T> {
  scope: string;
  key: readonly unknown[];
  run: () => Promise<T>;
  emptyValue: () => T;
  isEmpty: (v: T) => boolean;
  /** Sensors preserve their existing empty-on-error contract; grow data rethrows. */
  returnEmptyOnError?: boolean;
}

async function withSourceMeta<T>({
  scope,
  key,
  run,
  emptyValue,
  isEmpty,
  returnEmptyOnError = false,
}: WithSourceMetaOptions<T>): Promise<T> {
  try {
    const result = await run();
    if (result == null || isEmpty(result)) {
      recordUnavailableOutcome(`${scope}:empty`);
      recordMeta(key, {
        isDemoData: false,
        dataSource: "unavailable",
        sourceReason: "no-rows",
      });
      return result == null ? emptyValue() : result;
    }
    recordMeta(key, {
      isDemoData: false,
      dataSource: "supabase",
      sourceReason: "supabase:rows",
    });
    return result;
  } catch (err) {
    // Never leak raw error contents into UI-safe metadata or diagnostics.
    recordUnavailableOutcome(`${scope}:error`);
    recordMeta(key, {
      isDemoData: false,
      dataSource: "unavailable",
      sourceReason: "fetch-error",
    });
    if (returnEmptyOnError) return emptyValue();
    throw err;
  }
}

const isArrEmpty = <T,>(v: T[]) => v.length === 0;
const isNullish = <T,>(v: T) => v == null;

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useGrowTents(growId?: string): UseQueryResult<Tent[]> {
  const key = ["grow", "tents", growId ?? "all"] as const;
  return useQuery({
    queryKey: [...key],
    queryFn: () =>
      withSourceMeta({
        scope: "tents",
        key,
        run: () => fetchTents(growId),
        emptyValue: () => [] as Tent[],
        isEmpty: isArrEmpty,
      }),
  });
}

export function useGrowTent(id?: string): UseQueryResult<Tent | null> {
  const key = ["grow", "tent", id ?? null] as const;
  return useQuery({
    queryKey: [...key],
    enabled: !!id,
    queryFn: () =>
      withSourceMeta({
        scope: "tent",
        key,
        run: () => fetchTent(id as string),
        emptyValue: () => null,
        isEmpty: isNullish,
      }),
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
      withSourceMeta({
        scope: "plants",
        key,
        run: () => fetchPlants(tentId, growId, { includeArchived }),
        emptyValue: () => [] as Plant[],
        isEmpty: isArrEmpty,
      }),
  });
}

export function useGrowPlant(id?: string): UseQueryResult<Plant | null> {
  const key = ["grow", "plant", id ?? null] as const;
  return useQuery({
    queryKey: [...key],
    enabled: !!id,
    queryFn: () =>
      withSourceMeta({
        scope: "plant",
        key,
        run: () => fetchPlant(id as string),
        emptyValue: () => null,
        isEmpty: isNullish,
      }),
  });
}

/**
 * Grower-facing sensor readings hook.
 *
 * Sensor Truth P0: this hook MUST NOT fall back to mock/demo readings.
 * When Supabase returns zero rows we surface an honest empty array so
 * grower-facing UIs render an "unavailable — no real sensor data"
 * state instead of demo curves or fake T/RH/VPD chips. Manual and CSV
 * readings still flow through the real `sensor_readings` table with
 * their original `source` label — those are real data, not mock, and
 * are unaffected.
 */
export function useGrowSensorReadings(
  tentId?: string,
): UseQueryResult<SensorReading[]> {
  const key = ["grow", "sensors", tentId ?? "all"] as const;
  return useQuery({
    queryKey: [...key],
    queryFn: () =>
      withSourceMeta({
        scope: "sensors",
        key,
        run: () => fetchSensorReadings(tentId),
        // Honest empty state — no mock/demo fallback for grower sensor UI.
        emptyValue: () => [] as SensorReading[],
        isEmpty: isArrEmpty,
        returnEmptyOnError: true,
      }),
  });
}

