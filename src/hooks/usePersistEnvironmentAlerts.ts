import { sanitizedMetricsFromSensorSnapshot } from "@/lib/actionQueueEvidenceSnapshotRules";
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
import type { SensorSnapshot, SensorSnapshotMetricRefKey } from "@/lib/sensorSnapshot";
import type { SensorQualityResult } from "@/lib/sensorQuality";
import type { TargetComparisonResult } from "@/lib/environmentTargetComparison";
import { buildEnvironmentAlerts, type EnvironmentAlert } from "@/lib/environmentAlerts";
import { derivedAlertKey, selectPersistableAlerts } from "@/lib/environmentAlertPersistence";
import { listAlerts, saveAlert, logAlertEvent } from "@/lib/alerts";
import { buildSensorSnapshotEvidenceRefs } from "@/lib/sensorSnapshotEvidenceRefRules";
import { buildDiaryEntryEvidenceRefs } from "@/lib/diaryEntryEvidenceRefRules";
import type { OriginatingTimelineEventRef } from "@/lib/originatingTimelineEventRules";

export type PersistStatus = "idle" | "skipped" | "checking" | "writing" | "done" | "error";

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
  /**
   * Tent the breach was observed in, when the evidence unambiguously points
   * at one (normally `snapshot.tent_id`). Persisted on the alert so
   * tent-scoped surfaces can attribute it, and folded into the dedupe key so
   * two tents breaching the same metric each get their own row. Null is
   * honest and expected for multi-tent (e.g. "All tents") views.
   */
  tentId?: string | null;
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

/**
 * Resolve originating timeline refs for a derived alert.
 *
 * Preference order (both paths are explicit-id only; never inferred):
 *  1. Per-metric `sensor_readings` id from `snapshot.metric_refs`
 *  2. Diary entry id from `snapshot.diary_evidence_ref` (Environment Check)
 *
 * Returns [] when neither is available — never invents ids.
 */
export function resolveEnvironmentAlertEvidenceRefs(
  alert: Pick<EnvironmentAlert, "metric">,
  snapshot: SensorSnapshot | null | undefined,
): OriginatingTimelineEventRef[] {
  const metricRef =
    typeof alert.metric === "string" && snapshot?.metric_refs
      ? (snapshot.metric_refs[alert.metric as SensorSnapshotMetricRefKey] ?? null)
      : null;
  if (metricRef) {
    return buildSensorSnapshotEvidenceRefs({
      id: metricRef.id,
      captured_at: metricRef.captured_at,
      source: metricRef.source,
      metric: alert.metric,
      sanitized_metrics: sanitizedMetricsFromSensorSnapshot(snapshot),
    });
  }
  const diaryRef = snapshot?.diary_evidence_ref;
  if (diaryRef && snapshot) {
    return buildDiaryEntryEvidenceRefs({
      id: diaryRef.id,
      entry_at: diaryRef.entry_at,
      // Env-check snapshots are always manual evidence; prefer the
      // snapshot's own source so a future path cannot invent "live".
      source:
        snapshot.source === "manual" || snapshot.source === "live" ? snapshot.source : "manual",
    });
  }
  return [];
}

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
  const diaryRefKey = input.snapshot?.diary_evidence_ref?.id ?? "";
  const qualityKey = input.quality?.quality ?? "unavailable";
  const targetsKey =
    input.targets?.status === "out_of_range"
      ? input.targets.metrics
          .map((m) => `${m.metric}:${m.state}`)
          .sort()
          .join("|")
      : (input.targets?.status ?? "missing_targets");
  const enabled = input.enabled !== false;
  const growId = input.growId ?? null;
  const isDemoData = input.isDemoData === true;
  // Part of the dedupe key, so a tent change must re-run the effect.
  const tentKey = input.tentId ?? "";
  const stageProvided = "stage" in input;
  const stageKey = stageProvided ? (input.stage ?? "__unknown__") : "__legacy__";

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
        ...(stageProvided ? { stage: input.stage ?? null } : {}),
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

      // 3. Load currently-open alerts for this grow and dedupe by rule key,
      //    scoped to the tent the breach was observed in.
      let openRows: {
        metric: string | null;
        source: string | null;
        title: string;
        tent: string | null;
      }[] = [];
      try {
        const rows = await listAlerts({ growId, status: "open" });
        openRows = rows.map((r) => ({
          metric: r.metric ?? null,
          source: r.source ?? null,
          title: r.title,
          tent: r.tent_id ?? null,
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

      // The tent this run's evidence belongs to (null when the snapshot spans
      // several tents, or none is known).
      const observedTentId = input.tentId ?? null;

      // Dedupe is per (tent, rule), not per rule. Two tents in one grow can
      // breach the same metric simultaneously and BOTH deserve their own
      // alert row — grow-scoped keys would collapse them into one, silently
      // attributing the breach to whichever tent won the race and leaving the
      // other tent's Plant Detail panel empty. Composed here rather than
      // inside derivedAlertKey so its other callers are unaffected. Rows with
      // no tent (all historical rows, and any snapshot spanning tents) key on
      // "" and so keep their existing grow-wide dedupe behavior.
      // Grow is part of the key because `inFlightKeys` is a ref that survives
      // grow switches and never drops successful keys. Without it, a
      // tent-null rule persisted for one grow would suppress the same rule
      // in the next grow the user selects, even with that grow's open-alert
      // query empty. (The pre-existing key omitted grow too; it is included
      // here rather than left as a latent collision in code being rewritten.)
      const scopedKey = (tent: string | null, ruleKey: string) =>
        `${growId ?? ""}::${tent ?? ""}::${ruleKey}`;

      const existing = new Set(
        openRows.map((r) =>
          scopedKey(
            r.tent,
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
        ),
      );

      const toInsert = persistable.filter((a) => {
        const key = scopedKey(observedTentId, derivedAlertKey(a, SOURCE));
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
        const key = scopedKey(observedTentId, derivedAlertKey(a, SOURCE));
        try {
          // Explicit refs only: metric_refs (sensor_readings) first, then
          // diary_evidence_ref (Environment Check diary row). Never
          // nearest-match, never metric-only DB lookup, never prose.
          const refs = resolveEnvironmentAlertEvidenceRefs(a, input.snapshot);
          const saved = await saveAlert({
            grow_id: growId,
            tent_id: observedTentId,
            severity: a.severity,
            title: a.title,
            reason: a.reason,
            metric: typeof a.metric === "string" ? a.metric : null,
            source: SOURCE,
            originating_timeline_events: refs,
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
  }, [
    enabled,
    growId,
    tsKey,
    sourceKey,
    diaryRefKey,
    qualityKey,
    targetsKey,
    isDemoData,
    stageKey,
    stageProvided,
    tentKey,
  ]);

  return state;
}

export default usePersistEnvironmentAlerts;
