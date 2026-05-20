/**
 * Read-only React hook for the immutable `public.alert_events` audit table.
 * Returns recent lifecycle events for a single alert (newest first).
 * RLS enforces ownership.
 */
import { useCallback, useEffect, useState } from "react";
import { listAlertEvents, type AlertEventRow } from "@/lib/alerts";

export type AlertEventsStatus = "idle" | "loading" | "ok" | "unavailable";

export interface UseAlertEventsState {
  status: AlertEventsStatus;
  events: AlertEventRow[];
  error: string | null;
  reload: () => void;
}

export function useAlertEvents(
  alertId: string | null,
  reloadKey = 0,
): UseAlertEventsState {
  const [status, setStatus] = useState<AlertEventsStatus>("idle");
  const [events, setEvents] = useState<AlertEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!alertId) {
      setEvents([]);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    listAlertEvents(alertId)
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
        setStatus("ok");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setEvents([]);
        setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [alertId, nonce, reloadKey]);

  return { status, events, error, reload };
}
