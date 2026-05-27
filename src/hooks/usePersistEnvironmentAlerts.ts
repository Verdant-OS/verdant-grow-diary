/**
 * usePersistEnvironmentAlerts — promotes derived Environment Alerts into
 * persistent rows in `public.alerts` (+ a 'created' audit event in
 * `public.alert_events`) so the Alerts page, Timeline, AI Doctor context,
 * and Action Queue loop can work from real alert records.
 *
 * SAFETY:
 *   - This is persistence only. NOT automation. NOT device control.
 *   - Only writes when the snapshot is real and valid (see
 *     isSnapshotPersistable). Never writes from stale, unavailable, demo,
 *     fallback, or mock readings.
 *   - Idempotent: dedupes against currently-open alert rows for the grow
 *     by a deterministic rule key (source + metric + reason). A per-session
 *     in-memory guard avoids re-issuing the same insert across re-renders
 *     before the open-list query refreshes.
 *   - Never sends user_id from the client. Ownership is anchored on
 *     auth.uid() via DB defaults + RLS.
 *   - No elevated keys. No AI calls. No Action Queue writes.
 *   - On audit-log failure the alert row remains; the failure is surfaced
 *     via the returned state, never silently retried into automation.
 */
import { useEffect, useRef, useState } from "react";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SensorQualityResult } from "@/lib/sensorQuality";
import type { TargetComparisonResult } from "@/lib/environmentTargetComparison";
import {
  buildEnvironmentAlerts,
  type EnvironmentAlert,
} from "@/lib/environmentAlerts";
import {
  derivedAlertKey,
  selectPersistableAlerts,
} from "@/lib/environmentAlertPersistence";
import { listAlerts, saveAlert, logAlertEvent } from "@/lib/alerts";

export type PersistStatus =
  | "idle"
  | "skipped"
  | "checking"
  | "writing"
  | "done"
  | "error";

export interface PersistEnvironmentAlertsState {
  status: PersistStatus;
  persistedCount: number;
  lastError: string | null;
}

export interface PersistEnvironmentAlertsInput {
  growId: string | null | undefined;
  snapshot: SensorSnapshot | null;
  quality: SensorQualityResult;
  targets: TargetComparisonResult;
  /** True when the upstream data layer flagged this as demo/fallback/mock. */
  isDemoData?: boolean;
  /** Default false. Setting false short-circuits the hook entirely. */
  enabled?: boolean;
  /**
   * Plant/grow/tent stage. When provided, VPD alerts are evaluated against
   * stage-aware bands instead of the legacy generic 0.6–1.6 kPa default.
   */
  stage?: string | null;
}

const SOURCE = "environment_alerts";

export function usePersistEnvironmentAlerts(
  input: PersistEnvironmentAlertsInput,
): PersistEnvironmentAlertsState {
  const [state, setState] = useState<PersistEnvironmentAlertsState>({
    status: "idle",
    persistedCount: 0,
    lastError: null,
  });

  // Per-session guard to avoid re-issuing the same insert within the same
  // render window (before the open-list refresh would naturally dedupe it).
  const inFlightKeys = useRef<Set<string>>(new Set());

  // Stable deps — recompute on snapshot ts / quality / targets identity.
  const tsKey = input.snapshot?.ts ?? "";
  const sourceKey = input.snapshot?.source ?? "unavailable";
  const qualityKey = input.quality?.quality ?? "unavailable";
  const targetsKey =
    input.targets?.status === "out_of_range"
      ? input.targets.metrics
          .map((m) => `${m.metric}:${m.state}`)
          .sort()
          .join("|")
      : input.targets?.status ?? "missing_targets";
  const enabled = input.enabled !== false;
  const growId = input.growId ?? null;
  const isDemoData = input.isDemoData === true;

  useEffect(() => {
    if (!enabled || !growId) {
      setState({ status: "skipped", persistedCount: 0, lastError: null });
      return;
    }

    let cancelled = false;

    (async () => {
      // 1. Re-derive alerts from the rules layer (single source of truth).
      const derived: EnvironmentAlert[] = buildEnvironmentAlerts({
        snapshot: input.snapshot,
        quality: input.quality,
        targets: input.targets,
      });

      // 2. Filter to alerts derived from real, valid sensor readings only.
      const persistable = selectPersistableAlerts(derived, {
        snapshot: input.snapshot,
        quality: input.quality.quality,
        isDemoData,
      });

      if (persistable.length === 0) {
        if (!cancelled) {
          setState({ status: "skipped", persistedCount: 0, lastError: null });
        }
        return;
      }

      if (!cancelled) {
        setState((s) => ({ ...s, status: "checking", lastError: null }));
      }

      // 3. Load currently-open alerts for this grow and dedupe by rule key.
      let openRows: { metric: string | null; source: string | null; title: string }[] = [];
      try {
        const rows = await listAlerts({ growId, status: "open" });
        openRows = rows.map((r) => ({
          metric: r.metric ?? null,
          source: r.source ?? null,
          title: r.title,
        }));
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            persistedCount: 0,
            lastError: (err as Error).message ?? "list failed",
          });
        }
        return;
      }

      const existing = new Set(
        openRows.map((r) =>
          derivedAlertKey(
            // Shape-compatible: derivedAlertKey only reads metric/title.
            {
              id: "",
              severity: "info",
              metric: (r.metric ?? "snapshot") as EnvironmentAlert["metric"],
              title: r.title,
              reason: "",
              source: "sensor_snapshot",
              createdAt: "",
            },
            r.source ?? SOURCE,
          ),
        ),
      );

      const toInsert = persistable.filter((a) => {
        const key = derivedAlertKey(a, SOURCE);
        if (existing.has(key)) return false;
        if (inFlightKeys.current.has(key)) return false;
        inFlightKeys.current.add(key);
        return true;
      });

      if (toInsert.length === 0) {
        if (!cancelled) {
          setState({ status: "done", persistedCount: 0, lastError: null });
        }
        return;
      }

      if (!cancelled) {
        setState((s) => ({ ...s, status: "writing" }));
      }

      let persistedCount = 0;
      let lastError: string | null = null;

      for (const a of toInsert) {
        const key = derivedAlertKey(a, SOURCE);
        try {
          const saved = await saveAlert({
            grow_id: growId,
            severity: a.severity,
            title: a.title,
            reason: a.reason,
            metric: typeof a.metric === "string" ? a.metric : null,
            source: SOURCE,
          });
          try {
            await logAlertEvent({
              alert_id: saved.id,
              grow_id: growId,
              event_type: "created",
              new_status: "open",
            });
          } catch (logErr) {
            lastError = `audit log failed: ${(logErr as Error).message}`;
          }
          persistedCount += 1;
        } catch (err) {
          // Release the in-flight guard so a later real attempt can retry.
          inFlightKeys.current.delete(key);
          lastError = (err as Error).message ?? "insert failed";
        }
      }

      if (!cancelled) {
        setState({
          status: lastError ? "error" : "done",
          persistedCount,
          lastError,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, growId, tsKey, sourceKey, qualityKey, targetsKey, isDemoData]);

  return state;
}

export default usePersistEnvironmentAlerts;
