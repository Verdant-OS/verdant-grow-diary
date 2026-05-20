// React Query hooks for Phase 1 Supabase-backed grow data.
// Falls back to mock data on Supabase error, null/undefined data, or empty
// initial result so the UI stays predictable during the live-data transition.
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

// Lightweight observability for tests / future telemetry. Not consumed by UI.
export const __growDataFallbacks = { count: 0, lastReason: "" as string };

function fellBack(reason: string) {
  __growDataFallbacks.count += 1;
  __growDataFallbacks.lastReason = reason;
}

async function withFallback<T>(
  scope: string,
  run: () => Promise<T>,
  fallback: () => T,
  isEmpty: (v: T) => boolean,
): Promise<T> {
  try {
    const result = await run();
    if (result == null || isEmpty(result)) {
      fellBack(`${scope}:empty`);
      return fallback();
    }
    return result;
  } catch (err) {
    fellBack(`${scope}:error:${(err as Error)?.message ?? "unknown"}`);
    return fallback();
  }
}

const isArrEmpty = <T,>(v: T[]) => v.length === 0;
const never = <T,>(_v: T) => false;

export function useGrowTents(growId?: string): UseQueryResult<Tent[]> {
  return useQuery({
    queryKey: ["grow", "tents", growId ?? "all"],
    queryFn: () =>
      withFallback(
        "tents",
        () => fetchTents(growId),
        () => (growId ? tents.filter((t) => t.growId === growId) : tents),
        isArrEmpty,
      ),
  });
}

export function useGrowTent(id?: string): UseQueryResult<Tent | null> {
  return useQuery({
    queryKey: ["grow", "tent", id ?? null],
    enabled: !!id,
    queryFn: () =>
      withFallback(
        "tent",
        () => fetchTent(id as string),
        () => tents.find((t) => t.id === id) ?? null,
        never,
      ),
  });
}

export function useGrowPlants(tentId?: string, growId?: string): UseQueryResult<Plant[]> {
  return useQuery({
    queryKey: ["grow", "plants", tentId ?? "all", growId ?? "all"],
    queryFn: () =>
      withFallback(
        "plants",
        () => fetchPlants(tentId, growId),
        () => {
          let list = plants;
          if (tentId) list = list.filter((p) => p.tentId === tentId);
          if (growId) list = list.filter((p) => p.growId === growId);
          return list;
        },
        isArrEmpty,
      ),
  });
}

export function useGrowPlant(id?: string): UseQueryResult<Plant | null> {
  return useQuery({
    queryKey: ["grow", "plant", id ?? null],
    enabled: !!id,
    queryFn: () =>
      withFallback(
        "plant",
        () => fetchPlant(id as string),
        () => plants.find((p) => p.id === id) ?? null,
        never,
      ),
  });
}

export function useGrowSensorReadings(tentId?: string): UseQueryResult<SensorReading[]> {
  return useQuery({
    queryKey: ["grow", "sensors", tentId ?? "all"],
    queryFn: () =>
      withFallback(
        "sensors",
        () => fetchSensorReadings(tentId),
        () =>
          tentId ? sensorReadings.filter((r) => r.tentId === tentId) : sensorReadings,
        isArrEmpty,
      ),
  });
}
