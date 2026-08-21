import { useQuery, type UseQueryResult } from "@tanstack/react-query";

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
  const growId = isUuid(args.growId) ? args.growId : null;
  const tentId = isUuid(args.tentId) ? args.tentId : null;
  const enabled = Boolean(growId && tentId);

  const query = useQuery<SoilMoistureCalibrationReadResult>({
    queryKey: ["soil_moisture_calibrations", growId ?? "none", tentId ?? "none"],
    enabled,
    queryFn: async () => {
      if (!growId || !tentId) return { availability: "available", calibrations: [] };
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

      return resolveSoilMoistureCalibrationRead(data as SoilMoistureCalibrationRow[] | null, error);
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
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
