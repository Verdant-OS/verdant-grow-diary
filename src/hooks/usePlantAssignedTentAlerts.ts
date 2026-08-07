/**
 * Read-only hook: tent-scoped alerts for plant/tent surfaces.
 *
 * One `useAlertsList` read with status `"all"` (RLS-scoped). Pure rules split
 * open vs closed history so Pro history reuses the same payload — no second
 * network read, no schema change.
 *
 * No writes. No action_queue. No alert mutations.
 */
import { useMemo } from "react";
import { useAlertsList } from "@/hooks/useAlertsList";
import {
  buildAssignedTentAlertHistory,
  buildAssignedTentAlerts,
  type PlantAssignedTentAlertRow,
} from "@/lib/plantAssignedTentAlertRules";

export interface UsePlantAssignedTentAlertsResult {
  status: ReturnType<typeof useAlertsList>["status"];
  rows: PlantAssignedTentAlertRow[];
  historyRows: PlantAssignedTentAlertRow[];
  error: string | null;
}

export function usePlantAssignedTentAlerts(
  tentId: string | null | undefined,
  growId: string | null | undefined,
  limit?: number,
  historyLimit?: number,
  options?: { enabled?: boolean },
): UsePlantAssignedTentAlertsResult {
  const enabled = options?.enabled ?? true;
  // Single read: open + closed. Callers discard what they do not surface.
  const { status, alerts, error } = useAlertsList(
    {
      growId: growId ?? null,
      status: "all",
    },
    { enabled },
  );
  const rows = useMemo(
    () => (enabled ? buildAssignedTentAlerts(alerts, { tentId, growId, limit }) : []),
    [enabled, alerts, tentId, growId, limit],
  );
  const historyRows = useMemo(
    () =>
      enabled ? buildAssignedTentAlertHistory(alerts, { tentId, growId, limit: historyLimit }) : [],
    [enabled, alerts, tentId, growId, historyLimit],
  );
  return { status: enabled ? status : "idle", rows, historyRows, error: enabled ? error : null };
}
