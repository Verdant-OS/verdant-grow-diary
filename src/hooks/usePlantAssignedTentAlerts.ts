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
  ASSIGNED_TENT_ALERT_STATUSES,
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
  // Ask the server for exactly the statuses the rules layer treats as active.
  //
  // This query used to narrow to open-only, which `listAlerts` turns into an
  // `.eq(...)` on the status column. That dropped acknowledged rows before the
  // rules layer ever saw them, so its acknowledged branch was unreachable and
  // the panel hid alerts the grower had merely acknowledged.
  //
  // The status list is passed from ASSIGNED_TENT_ALERT_STATUSES rather than
  // restated here, so the query cannot drift from the rule again. Filtering
  // server-side (rather than fetching everything and discarding) also means a
  // long tail of resolved/dismissed rows can never crowd an older active alert
  // out of the result set.
  const { status, alerts, error } = useAlertsList(
    { growId: growId ?? null, statuses: ASSIGNED_TENT_ALERT_STATUSES },
    // No tent means the rules layer returns [] regardless — don't read at all.
    { enabled: !!tentId },
  );
  const rows = useMemo(
    () => buildAssignedTentAlerts(alerts, { tentId, growId, limit }),
    [alerts, tentId, growId, limit],
  );
  return { status, rows, error };
}
