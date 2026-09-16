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
import { useEffect, useMemo, useState } from "react";
import { useAlertsList } from "@/hooks/useAlertsList";
import {
  ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT,
  ASSIGNED_TENT_ALERT_STATUSES,
  countOpenAlerts,
  selectActiveTentAlerts,
  type PlantAssignedTentAlertRow,
} from "@/lib/plantAssignedTentAlertRules";

export interface UsePlantAssignedTentAlertsResult {
  status: ReturnType<typeof useAlertsList>["status"];
  /** Capped for display (see ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT). */
  rows: PlantAssignedTentAlertRow[];
  /**
   * Strictly-open count across ALL active alerts for the tent, computed before
   * the display cap. Surfaces whose copy says "open alerts" must use this and
   * never count `rows`: acknowledged alerts of higher severity can fill every
   * capped slot, which would report zero open alerts on a tent that has one.
   */
  openCount: number;
  /** Active (open + acknowledged) count for the tent, also uncapped. */
  activeCount: number;
  error: string | null;
  /** Retry only the existing alerts read; performs no writes. */
  reload: ReturnType<typeof useAlertsList>["reload"];
}

export function usePlantAssignedTentAlerts(
  tentId: string | null | undefined,
  growId: string | null | undefined,
  limit?: number,
): UsePlantAssignedTentAlertsResult {
  const scopedGrowId = growId ?? null;
  const enabled = !!tentId;
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
  const { status, alerts, error, reload } = useAlertsList(
    { growId: scopedGrowId, statuses: ASSIGNED_TENT_ALERT_STATUSES },
    // No tent means the rules layer returns [] regardless — don't read at all.
    { enabled: !!tentId },
  );
  // useAlertsList updates its state in a passive effect. Until that effect
  // starts the new read, its previous 'ok' must not validate a different scope.
  // This effect follows useAlertsList's effect, so accepting the scope and its
  // loading state happen together. Changing tents within one grow needs no read.
  const [readScope, setReadScope] = useState({ growId: scopedGrowId, enabled });
  useEffect(() => {
    setReadScope((previous) =>
      previous.growId === scopedGrowId && previous.enabled === enabled
        ? previous
        : { growId: scopedGrowId, enabled },
    );
  }, [scopedGrowId, enabled]);
  const scopedStatus = !enabled
    ? "idle"
    : readScope.growId !== scopedGrowId || readScope.enabled !== enabled
      ? "loading"
      : status;
  // Select once, uncapped, then derive both the display slice and the counts
  // from it — counting the capped slice is what produced the false zero.
  const active = useMemo(
    () => selectActiveTentAlerts(alerts, { tentId, growId }),
    [alerts, tentId, growId],
  );
  const rows = useMemo(
    () => active.slice(0, Math.max(1, limit ?? ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT)),
    [active, limit],
  );
  const openCount = useMemo(() => countOpenAlerts(active), [active]);
  return { status: scopedStatus, rows, openCount, activeCount: active.length, error, reload };
}
