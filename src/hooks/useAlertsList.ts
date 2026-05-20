/**
 * Read-only React hook for the persistent `public.alerts` table.
 *
 * Returns alerts the authenticated user owns. RLS does the enforcement.
 */
import { useCallback, useEffect, useState } from "react";
import { listAlerts, type AlertRow, type AlertsQuery } from "@/lib/alerts";

export type AlertsListStatus = "idle" | "loading" | "ok" | "unavailable";

export interface UseAlertsListState {
  status: AlertsListStatus;
  alerts: AlertRow[];
  error: string | null;
  reload: () => void;
}

export function useAlertsList(query: AlertsQuery = {}): UseAlertsListState {
  const [status, setStatus] = useState<AlertsListStatus>("idle");
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const growId = query.growId ?? null;
  const queryStatus = query.status ?? "all";
  const querySeverity = query.severity ?? "all";

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    listAlerts({ growId, status: queryStatus, severity: querySeverity })
      .then((rows) => {
        if (cancelled) return;
        setAlerts(rows);
        setStatus("ok");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setAlerts([]);
        setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [growId, queryStatus, querySeverity, nonce]);

  return { status, alerts, error, reload };
}
