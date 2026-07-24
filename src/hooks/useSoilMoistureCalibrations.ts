import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { SoilMoistureCalibrationRow } from "@/lib/db";
import type { SoilMoistureCalibrationCandidate } from "@/lib/soilMoistureCalibrationSelectionRules";
import { isUuid } from "@/lib/isUuid";

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

export function useSoilMoistureCalibrations(args: {
  growId: string | null | undefined;
  tentId: string | null | undefined;
}): UseQueryResult<SoilMoistureCalibrationCandidate[]> {
  const growId = isUuid(args.growId) ? args.growId : null;
  const tentId = isUuid(args.tentId) ? args.tentId : null;
  const enabled = Boolean(growId && tentId);

  return useQuery({
    queryKey: ["soil_moisture_calibrations", growId ?? "none", tentId ?? "none"],
    enabled,
    queryFn: async () => {
      if (!growId || !tentId) return [];
      // soil_moisture_calibrations is not in the generated Supabase types
      // (no migration yet). Cast the client to bypass the table-name guard
      // without introducing a schema change.
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

      if (error) throw error;
      return ((data ?? []) as SoilMoistureCalibrationRow[]).map(mapSoilMoistureCalibrationRow);
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    // A failed calibration read is a first-class unavailable state in the
    // Sensors presenter. Do not hide it behind automatic retries or let an
    // empty default masquerade as "Uncalibrated" while the request repeats.
    retry: false,
  });
}
