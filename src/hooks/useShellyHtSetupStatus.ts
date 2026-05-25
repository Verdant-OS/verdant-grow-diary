/**
 * useShellyHtSetupStatus — read-only loader for the Shelly H&T Gen4
 * Setup card. Invokes the `shelly-ht-status` edge function which returns
 * server-resolved configuration flags (never the raw token).
 *
 * Read-only. Never writes. Never triggers automation or device control.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ShellyHtSetupStatusPayload {
  configured: boolean;
  tentAssignedToCaller: boolean;
  tentId: string | null;
  tentName: string | null;
  /** Masked token suffix like "••••abcd" or null when not configured. */
  tokenMask: string | null;
  webhookUrl: string;
}

export function useShellyHtSetupStatus(): UseQueryResult<ShellyHtSetupStatusPayload> {
  return useQuery({
    queryKey: ["shelly-ht-setup-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "shelly-ht-status",
        { method: "GET" },
      );
      if (error) throw error;
      return data as ShellyHtSetupStatusPayload;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
