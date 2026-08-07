/**
 * Read-only hook: still-active (open or acknowledged) alerts for a plant's
 * assigned tent.
 *
 * Wraps `useAlertsList` (which reads `public.alerts` under RLS) scoped to the
 * plant's grow when known. Tent-level AND status filtering happen in the pure
 * rules layer so they stay deterministic and testable.
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
  // Read every status and let `buildAssignedTentAlerts` decide what still
  // counts as active (ASSIGNED_TENT_ALERT_STATUSES = open + acknowledged).
  //
  // This query used to narrow to open-only, which `listAlerts` turns into an
  // `.eq(...)` on the status column. That dropped acknowledged rows before the
  // rules layer ever saw them, so its acknowledged branch was unreachable and
  // the panel hid alerts the grower had merely acknowledged. Status filtering
  // lives in one place — the rules layer — so the two cannot drift again.
  const { status, alerts, error } = useAlertsList({
    growId: growId ?? null,
    status: "all",
  });
  const rows = useMemo(
    () => buildAssignedTentAlerts(alerts, { tentId, growId, limit }),
    [alerts, tentId, growId, limit],
  );
  return { status, rows, error };
}
