import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { SoilMoistureCalibrationRow } from "@/lib/db";
import type { SoilMoistureCalibrationCandidate } from "@/lib/soilMoistureCalibrationSelectionRules";
import { isUuid } from "@/lib/isUuid";

export type SoilMoistureCalibrationAvailability =
  "idle" | "loading" | "available" | "schema_unavailable" | "error";

interface SoilMoistureCalibrationReadResult {
  availability: "available" | "schema_unavailable";
  calibrations: SoilMoistureCalibrationCandidate[];
}

export type UseSoilMoistureCalibrationsResult = Omit<
  UseQueryResult<SoilMoistureCalibrationReadResult>,
  "data"
> & {
  data: SoilMoistureCalibrationCandidate[] | undefined;
  availability: SoilMoistureCalibrationAvailability;
};

/**
 * Match only the two missing-relation error shapes emitted by PostgREST or
 * Postgres, and only when they identify the optional calibration table.
 */
export function isMissingSoilMoistureCalibrationsTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  if (code !== "PGRST205" && code !== "42P01") return false;
  const description = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return description.includes("soil_moisture_calibrations");
}

/**
 * Session marker for a confirmed missing calibration table. Lives on the
 * QueryClient (one per router) so a later tent or page does not repeat the
 * PostgREST 404. A full reload builds a new client and checks once more.
 */
const SOIL_MOISTURE_CALIBRATION_SCHEMA_UNAVAILABLE_KEY = [
  "soil_moisture_calibrations",
  "schema_unavailable",
] as const;

const SCHEMA_UNAVAILABLE_RESULT: SoilMoistureCalibrationReadResult = {
  availability: "schema_unavailable",
  calibrations: [],
};

const schemaUnavailableClients = new WeakSet<QueryClient>();
const inflightSchemaCheckByClient = new WeakMap<QueryClient, Promise<boolean>>();

/**
 * Checks whether a QueryClient has already recorded that
 * `soil_moisture_calibrations` is missing on this deployment.
 */
function soilMoistureCalibrationSchemaUnavailableCached(client: QueryClient): boolean {
  if (schemaUnavailableClients.has(client)) return true;
  if (client.getQueryData(SOIL_MOISTURE_CALIBRATION_SCHEMA_UNAVAILABLE_KEY) === true) {
    schemaUnavailableClients.add(client);
    return true;
  }
  return false;
}

/**
 * Records a confirmed missing `soil_moisture_calibrations` table on the
 * QueryClient and propagates `SCHEMA_UNAVAILABLE_RESULT` to any existing
 * calibration query keys on that client.
 */
function rememberSoilMoistureCalibrationSchemaUnavailable(client: QueryClient): void {
  schemaUnavailableClients.add(client);
  client.setQueryDefaults(SOIL_MOISTURE_CALIBRATION_SCHEMA_UNAVAILABLE_KEY, {
    gcTime: Number.POSITIVE_INFINITY,
  });
  client.setQueryData(SOIL_MOISTURE_CALIBRATION_SCHEMA_UNAVAILABLE_KEY, true);
  client.setQueriesData<SoilMoistureCalibrationReadResult>(
    {
      queryKey: ["soil_moisture_calibrations"],
      predicate: (query) =>
        query.queryKey[0] === "soil_moisture_calibrations" &&
        query.queryKey[1] !== "schema_unavailable",
    },
    SCHEMA_UNAVAILABLE_RESULT,
  );
}

export function mapSoilMoistureCalibrationRow(
  row: SoilMoistureCalibrationRow,
): SoilMoistureCalibrationCandidate {
  return {
    id: row.id,
    growId: row.grow_id,
    tentId: row.tent_id,
    plantId: row.plant_id,
    deviceId: row.device_id,
    dryRaw: row.dry_raw,
    wetRaw: row.wet_raw,
    source: row.source,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function resolveSoilMoistureCalibrationRead(
  rows: SoilMoistureCalibrationRow[] | null | undefined,
  error: unknown,
): SoilMoistureCalibrationReadResult {
  if (error) {
    if (isMissingSoilMoistureCalibrationsTableError(error)) {
      return { availability: "schema_unavailable", calibrations: [] };
    }
    throw error;
  }
  return {
    availability: "available",
    calibrations: (rows ?? []).map(mapSoilMoistureCalibrationRow),
  };
}

export function useSoilMoistureCalibrations(args: {
  growId: string | null | undefined;
  tentId: string | null | undefined;
}): UseSoilMoistureCalibrationsResult {
  const activeQueryClient = useQueryClient();
  const growId = isUuid(args.growId) ? args.growId : null;
  const tentId = isUuid(args.tentId) ? args.tentId : null;
  const enabled = Boolean(growId && tentId);
  const schemaUnavailableCached =
    enabled && soilMoistureCalibrationSchemaUnavailableCached(activeQueryClient);

  const query = useQuery<SoilMoistureCalibrationReadResult>({
    queryKey: ["soil_moisture_calibrations", growId ?? "none", tentId ?? "none"],
    enabled,
    initialData: schemaUnavailableCached ? SCHEMA_UNAVAILABLE_RESULT : undefined,
    queryFn: async ({ client: queryClient }) => {
      if (soilMoistureCalibrationSchemaUnavailableCached(queryClient)) {
        return SCHEMA_UNAVAILABLE_RESULT;
      }
      if (!growId || !tentId) return { availability: "available", calibrations: [] };

      const existingInflight = inflightSchemaCheckByClient.get(queryClient);
      if (existingInflight) {
        const missingSchema = await existingInflight;
        if (missingSchema || soilMoistureCalibrationSchemaUnavailableCached(queryClient)) {
          return SCHEMA_UNAVAILABLE_RESULT;
        }
      }

      let resolveInflight!: (missingSchema: boolean) => void;
      const inflightPromise = new Promise<boolean>((resolve) => {
        resolveInflight = resolve;
      });
      inflightSchemaCheckByClient.set(queryClient, inflightPromise);

      try {
        // The calibration migration exists, but the checked-in generated
        // Supabase types do not include this table yet. Keep this narrow cast
        // until production schema parity is confirmed and types are regenerated.
        const client = supabase as unknown as {
          from: (table: string) => {
            select: (cols: string) => {
              eq: (col: string, val: unknown) => any;
            };
          };
        };
        const { data, error } = await client
          .from("soil_moisture_calibrations")
          .select(
            "id,grow_id,tent_id,plant_id,device_id,dry_raw,wet_raw,source,is_active,created_at,updated_at",
          )
          .eq("grow_id", growId)
          .eq("tent_id", tentId)
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        const result = resolveSoilMoistureCalibrationRead(
          data as SoilMoistureCalibrationRow[] | null,
          error,
        );
        if (
          result.availability === "schema_unavailable" ||
          soilMoistureCalibrationSchemaUnavailableCached(queryClient)
        ) {
          rememberSoilMoistureCalibrationSchemaUnavailable(queryClient);
          resolveInflight(true);
          return SCHEMA_UNAVAILABLE_RESULT;
        }
        resolveInflight(false);
        return result;
      } catch (err) {
        resolveInflight(false);
        throw err;
      } finally {
        if (inflightSchemaCheckByClient.get(queryClient) === inflightPromise) {
          inflightSchemaCheckByClient.delete(queryClient);
        }
      }
    },
    staleTime: schemaUnavailableCached ? Number.POSITIVE_INFINITY : 1000 * 60,
    gcTime: schemaUnavailableCached ? Number.POSITIVE_INFINITY : 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    // Missing schema resolves to an explicit tagged state above. Every other
    // failed read remains a first-class query error; do not retry it into an
    // empty default that could masquerade as "Uncalibrated".
    retry: false,
  });

  const availability: SoilMoistureCalibrationAvailability = !enabled
    ? "idle"
    : query.isLoading
      ? "loading"
      : query.isError
        ? "error"
        : (query.data?.availability ?? "loading");

  return {
    ...query,
    data: query.data?.calibrations,
    availability,
  };
}
