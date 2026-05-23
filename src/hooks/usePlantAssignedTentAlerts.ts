/**
 * Read-only hook: open alerts for a plant's assigned tent.
 *
 * Wraps `useAlertsList` (which reads `public.alerts` under RLS) scoped to the
 * plant's grow when known. Tent-level filtering happens in the pure rules
 * layer so it stays deterministic and testable.
 *
 * No writes. No action_queue. No alert mutations.
 */
import { useMemo } from "react";
import { useAlertsList } from "@/hooks/useAlertsList";
import {
  buildAssignedTentAlerts,
  type PlantAssignedTentAlertRow,
} from "@/lib/plantAssignedTentAlertRules";

export interface UsePlantAssignedTentAlertsResult {
  status: ReturnType<typeof useAlertsList>["status"];
  rows: PlantAssignedTentAlertRow[];
  error: string | null;
}

export function usePlantAssignedTentAlerts(
  tentId: string | null | undefined,
  growId: string | null | undefined,
  limit?: number,
): UsePlantAssignedTentAlertsResult {
  const { status, alerts, error } = useAlertsList({
    growId: growId ?? null,
    status: "open",
  });
  const rows = useMemo(
    () => buildAssignedTentAlerts(alerts, { tentId, growId, limit }),
    [alerts, tentId, growId, limit],
  );
  return { status, rows, error };
}
