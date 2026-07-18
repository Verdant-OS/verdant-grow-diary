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
import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";
import { useAuth } from "@/store/auth";

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

/**
 * Source disclosure is private account state just like the React Query rows
 * that produced it. Keep the owner in the metadata key so a late request
 * from a previous session cannot relabel the next grower's UI after a cache
 * clear. The owner is cache identity only; RLS remains the read authority.
 */
function privateMetaKey(
  ownerId: string | null | undefined,
  key: readonly unknown[],
): readonly unknown[] {
  const parts = key[0] === "grow" ? key.slice(1) : key;
  return buildPrivateGrowQueryKey(ownerId, parts);
}

function recordMeta(
  ownerId: string | null | undefined,
  key: readonly unknown[],
  meta: GrowDataSourceMeta,
): void {
  metaStore.set(metaKey(privateMetaKey(ownerId, key)), meta);
}

export function getGrowDataMeta(
  key: readonly unknown[],
  ownerId: string | null | undefined = null,
): GrowDataSourceMeta {
  return metaStore.get(metaKey(privateMetaKey(ownerId, key))) ?? DEFAULT_GROW_DATA_META;
}

/** Combine multiple section metas into a single status. Pure + deterministic. */
export function combineGrowDataMeta(metas: readonly GrowDataSourceMeta[]): GrowDataSourceMeta {
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
/** Clear private source-disclosure state when the authenticated owner changes. */
export function clearGrowDataMeta(): void {
  metaStore.clear();
  __growDataFallbacks.count = 0;
  __growDataFallbacks.lastReason = "";
}

/** Legacy test alias. */
export function __resetGrowDataMeta(): void {
  clearGrowDataMeta();
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
  ownerId: string | null | undefined;
  key: readonly unknown[];
  run: () => Promise<T>;
  emptyValue: () => T;
  isEmpty: (v: T) => boolean;
}

async function withSourceMeta<T>({
  scope,
  ownerId,
  key,
  run,
  emptyValue,
  isEmpty,
}: WithSourceMetaOptions<T>): Promise<T> {
  try {
    const result = await run();
    if (result == null || isEmpty(result)) {
      recordUnavailableOutcome(`${scope}:empty`);
      recordMeta(ownerId, key, {
        isDemoData: false,
        dataSource: "unavailable",
        sourceReason: "no-rows",
      });
      return result == null ? emptyValue() : result;
    }
    recordMeta(ownerId, key, {
      isDemoData: false,
      dataSource: "supabase",
      sourceReason: "supabase:rows",
    });
    return result;
  } catch (err) {
    // Never leak raw error contents into UI-safe metadata or diagnostics.
    recordUnavailableOutcome(`${scope}:error`);
    recordMeta(ownerId, key, {
      isDemoData: false,
      dataSource: "unavailable",
      sourceReason: "fetch-error",
    });
    throw err;
  }
}

const isArrEmpty = <T>(v: T[]) => v.length === 0;
const isNullish = <T>(v: T) => v == null;

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useGrowTents(growId?: string): UseQueryResult<Tent[]> {
  const ownerId = useAuth().user?.id ?? null;
  const key = ["grow", "tents", growId ?? "all"] as const;
  return useQuery({
    queryKey: buildPrivateGrowQueryKey(ownerId, ["tents", growId ?? "all"]),
    retry: false,
    queryFn: () =>
      withSourceMeta({
        scope: "tents",
        ownerId,
        key,
        run: () => fetchTents(growId),
        emptyValue: () => [] as Tent[],
        isEmpty: isArrEmpty,
      }),
  });
}

export function useGrowTent(id?: string): UseQueryResult<Tent | null> {
  const ownerId = useAuth().user?.id ?? null;
  const key = ["grow", "tent", id ?? null] as const;
  return useQuery({
    queryKey: buildPrivateGrowQueryKey(ownerId, ["tent", id ?? null]),
    enabled: !!id,
    retry: false,
    queryFn: () =>
      withSourceMeta({
        scope: "tent",
        ownerId,
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
  const ownerId = useAuth().user?.id ?? null;
  const includeArchived = !!opts.includeArchived;
  const key = (
    includeArchived
      ? ["grow", "plants", tentId ?? "all", growId ?? "all", "with-archived"]
      : ["grow", "plants", tentId ?? "all", growId ?? "all"]
  ) as readonly unknown[];
  return useQuery({
    queryKey: buildPrivateGrowQueryKey(ownerId, [
      "plants",
      tentId ?? "all",
      growId ?? "all",
      ...(includeArchived ? ["with-archived"] : []),
    ]),
    retry: false,
    queryFn: () =>
      withSourceMeta({
        scope: "plants",
        ownerId,
        key,
        run: () => fetchPlants(tentId, growId, { includeArchived }),
        emptyValue: () => [] as Plant[],
        isEmpty: isArrEmpty,
      }),
  });
}

export function useGrowPlant(id?: string): UseQueryResult<Plant | null> {
  const ownerId = useAuth().user?.id ?? null;
  const key = ["grow", "plant", id ?? null] as const;
  return useQuery({
    queryKey: buildPrivateGrowQueryKey(ownerId, ["plant", id ?? null]),
    enabled: !!id,
    retry: false,
    queryFn: () =>
      withSourceMeta({
        scope: "plant",
        ownerId,
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
export function useGrowSensorReadings(tentId?: string | null): UseQueryResult<SensorReading[]> {
  const ownerId = useAuth().user?.id ?? null;
  const scopeKey = tentId === null ? "none" : (tentId ?? "all");
  const key = ["grow", "sensors", scopeKey] as const;
  return useQuery({
    queryKey: buildPrivateGrowQueryKey(ownerId, ["sensors", scopeKey]),
    // `undefined` is the intentional all-tents aggregate used by Coach.
    // `null` is an explicit no-scope sentinel used while Sensors has no
    // selected tent, and must never fetch or reuse aggregate data.
    enabled: tentId !== null,
    retry: false,
    queryFn: () =>
      withSourceMeta({
        scope: "sensors",
        ownerId,
        key,
        run: () => fetchSensorReadings(tentId),
        // Honest empty state — no mock/demo fallback for grower sensor UI.
        emptyValue: () => [] as SensorReading[],
        isEmpty: isArrEmpty,
      }),
  });
}
