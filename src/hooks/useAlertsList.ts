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

export interface UseAlertsListOptions {
  /**
   * When false, the hook performs no network read and reports an idle,
   * empty state. Lets scope-gated pages avoid firing the alerts query
   * before their gate resolves (e.g. an unauthenticated load that is
   * about to redirect, or no grow selected yet). Defaults to true so
   * existing call sites keep their behavior.
   */
  enabled?: boolean;
}

export function useAlertsList(
  query: AlertsQuery = {},
  options: UseAlertsListOptions = {},
): UseAlertsListState {
  const [status, setStatus] = useState<AlertsListStatus>("idle");
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const growId = query.growId ?? null;
  const queryStatus = query.status ?? "all";
  const querySeverity = query.severity ?? "all";
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setAlerts([]);
      setError(null);
      return;
    }
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
  }, [growId, queryStatus, querySeverity, nonce, enabled]);

  return { status, alerts, error, reload };
}
