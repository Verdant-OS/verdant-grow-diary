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
import {
  alertContextRefreshRetryDelayMs,
  resolveAlertContextRefresh,
} from "@/lib/alertContextRefreshRules";
import type { SensorSnapshot, SensorSnapshotMetricRefKey } from "@/lib/sensorSnapshot";
import type { SensorQualityResult } from "@/lib/sensorQuality";
import type { TargetComparisonResult } from "@/lib/environmentTargetComparison";
import { buildEnvironmentAlerts, type EnvironmentAlert } from "@/lib/environmentAlerts";
import {
  derivedAlertKey,
  futureObservationWakeDelayMs,
  selectPersistableAlerts,
  snapshotPersistenceBlockReason,
} from "@/lib/environmentAlertPersistence";
import { listAlerts, saveAlert, logAlertEvent, updateOpenAlertContext } from "@/lib/alerts";
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
   * True while the grow-targets read is still loading or unavailable so the
   * persistence hook does not evaluate against a false `missing_targets`
   * fallback before real targets arrive.
   */
  targetsPending?: boolean;
  /**
   * Plant/grow/tent stage. When provided, VPD alerts are evaluated against
   * stage-aware bands instead of the legacy generic 0.6–1.6 kPa default.
   */
  stage?: string | null;
}

const SOURCE = "environment_alerts";

// Shared across mounted hook instances within the same active view, keyed
// by the scoped logical alert key (grow, tent, rule). Two instances that see
// the same breach through snapshots with different capture times must not
// both insert it, so the snapshot time is deliberately not part of the key:
// concurrent evaluations never duplicate an alert or its CREATED audit event
// before `listAlerts` reflects the new open row. Reservations stay held
// while any write is still in flight, even if the last hook instance
// unmounts mid-write, and clear only once both mounted instances and
// active writes reach zero.
let mountedPersistHookCount = 0;
let activePersistWriteCount = 0;
const globalInFlightAlertKeys = new Set<string>();
const globalCreatedEventLoggedKeys = new Set<string>();
// A successful insert releases its reservation at once, so a later breach of
// a closed alert can be persisted again. Until then-current list reads catch
// up, it records a write sequence: a run whose open-alert list was requested
// before that insert committed skips the key instead of inserting a duplicate.
let globalAlertWriteSeq = 0;
const globalCommittedAlertSeq = new Map<string, number>();
// Mounted instances that skipped a candidate because another write held its
// alert reservation. A failed write, or a run cleaned up before its write
// started, releases the reservation and notifies them once so they retry; a
// successful write notifies no one (no duplicate).
const reservationReleaseListeners = new Set<(alertKey: string) => void>();

function releaseAlertReservation(alertKey: string): void {
  globalInFlightAlertKeys.delete(alertKey);
  for (const notify of [...reservationReleaseListeners]) notify(alertKey);
}

function maybeClearGlobalSnapshotReservations(): void {
  if (mountedPersistHookCount <= 0 && activePersistWriteCount <= 0) {
    mountedPersistHookCount = 0;
    activePersistWriteCount = 0;
    globalInFlightAlertKeys.clear();
    globalCreatedEventLoggedKeys.clear();
    globalCommittedAlertSeq.clear();
  }
}

function thresholdDirectionKey(
  growId: string | null,
  tentId: string | null,
  source: string,
  metric: string | null | undefined,
  title: string | null | undefined,
): string | null {
  const m = (metric ?? "").toString().trim().toLowerCase();
  const t = (title ?? "").toString().trim().toLowerCase();
  if (!m || !t) return null;
  const match = t.match(/\b(above|below)\s+(target|stage range|default range)\b/);
  if (!match) return null;
  return `${growId ?? ""}::${tentId ?? ""}::${source.trim().toLowerCase()}::${m}::${match[1]}`;
}

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

  // Per-session guard to avoid re-issuing the same insert while it is in
  // flight. A successful insert drops its key (see the write sequence).
  const inFlightKeys = useRef<Set<string>>(new Set());
  // Bumped once when a future-dated observation reaches its eligibility
  // boundary, so the gate below is asked again with nothing else changed.
  const [eligibilityWake, setEligibilityWake] = useState(0);
  // Bumped when a write this instance deferred to fails and frees its key.
  const [reservationWake, setReservationWake] = useState(0);
  // Bumped by the bounded retry after an open alert's context refresh fails.
  const [refreshRetryWake, setRefreshRetryWake] = useState(0);
  // Consecutive failed context-refresh runs; reset by a successful refresh or
  // when the grow, tent, targets, stage or enablement change.
  const refreshFailures = useRef(0);
  const refreshContext = useRef<string | null>(null);

  // Stable deps — recompute on snapshot ts / quality / targets identity.
  // Configured bounds are part of the targets key: persisted reasons quote
  // the configured range, so an edit that leaves a metric's low/high state
  // unchanged must still re-run the effect and refresh the open alert.
  const tsKey = input.snapshot?.ts ?? "";
  const sourceKey = input.snapshot?.source ?? "unavailable";
  const diaryRefKey = input.snapshot?.diary_evidence_ref?.id ?? "";
  const qualityKey = input.quality?.quality ?? "unavailable";
  const targetsKey =
    input.targets?.status === "out_of_range"
      ? input.targets.metrics
          .map((m) => `${m.metric}:${m.state}:${m.min ?? ""}:${m.max ?? ""}`)
          .sort()
          .join("|")
      : (input.targets?.status ?? "missing_targets");
  const enabled = input.enabled !== false;
  const targetsPending = input.targetsPending === true;
  const growId = input.growId ?? null;
  const isDemoData = input.isDemoData === true;
  // Part of the dedupe key, so a tent change must re-run the effect.
  const tentKey = input.tentId ?? "";
  const stageProvided = "stage" in input;
  const stageKey = stageProvided ? (input.stage ?? "__unknown__") : "__legacy__";

  useEffect(() => {
    mountedPersistHookCount += 1;
    return () => {
      mountedPersistHookCount -= 1;
      maybeClearGlobalSnapshotReservations();
    };
  }, []);

  useEffect(() => {
    const refreshContextKey = [
      growId ?? "",
      tentKey,
      targetsKey,
      stageKey,
      enabled ? "on" : "off",
      targetsPending ? "pending" : "ready",
    ].join("|");
    if (refreshContext.current !== refreshContextKey) {
      refreshContext.current = refreshContextKey;
      refreshFailures.current = 0;
    }
    if (!enabled || targetsPending || !growId) {
      setState({ status: "skipped", persistedCount: 0, lastError: null });
      return;
    }

    const pendingAlertKeys = new Set<string>();
    let cancelled = false;
    let wakeId: number | null = null;
    let refreshRetryId: number | null = null;
    const activeKeys = inFlightKeys.current;
    // Reservations belong to this read until its request actually starts.
    // Release unstarted work on cleanup so a newer confirmed read can proceed.
    const pendingKeys = new Set<string>();
    // Alert keys this run skipped because another write held them.
    const blockedAlertKeys = new Set<string>();
    const onReservationReleased = (alertKey: string) => {
      if (!cancelled && blockedAlertKeys.has(alertKey)) setReservationWake((n) => n + 1);
    };
    reservationReleaseListeners.add(onReservationReleased);

    (async () => {
      // One decision clock per run. The gate below and the wake computed from
      // its verdict must read the same sample: with two reads, a capture
      // timestamp can fall between them (millisecond precision on both
      // sides), so the gate rejects a still-future observation while the
      // second read finds it current and arms nothing. The unchanged breach
      // would then never be persisted, because no effect dependency moves
      // with wall time. The write path re-lists open rows and dedupes, so a
      // sample a few milliseconds old cannot mint a stale row.
      const now = Date.now();

      // 1. Re-derive alerts from the rules layer (single source of truth).
      const derived: EnvironmentAlert[] = buildEnvironmentAlerts({
        snapshot: input.snapshot,
        quality: input.quality,
        targets: input.targets,
        includeConfiguredRangeInTargetBreachReason: true,
        ...(stageProvided ? { stage: input.stage ?? null } : {}),
      });

      // 2. Filter to alerts derived from real, valid sensor readings only.
      const persistable = selectPersistableAlerts(derived, {
        snapshot: input.snapshot,
        quality: input.quality.quality,
        isDemoData,
        now,
      });

      if (persistable.length === 0) {
        if (!cancelled) {
          setState({ status: "skipped", persistedCount: 0, lastError: null });
          // Live ingest accepts bounded future clock skew, and the fence above
          // (correctly) refuses to persist ahead of the observation time. No
          // dependency of this effect changes as wall time catches up, so
          // arm exactly one wake at the boundary; the gate decides again then.
          // Missing or invalid timestamps never wake (delay is null). Same
          // `now` as the gate above, by construction (see the note there).
          const ctx = { snapshot: input.snapshot, quality: input.quality.quality, isDemoData, now };
          const delay =
            snapshotPersistenceBlockReason(ctx) === "outside_live_window"
              ? futureObservationWakeDelayMs(input.snapshot, now)
              : null;
          if (delay !== null) {
            wakeId = window.setTimeout(() => setEligibilityWake((n) => n + 1), delay);
          }
        }
        return;
      }

      if (!cancelled) {
        setState((s) => ({ ...s, status: "checking", lastError: null }));
      }

      // 3. Load currently-open alerts for this grow and dedupe by rule key,
      //    scoped to the tent the breach was observed in.
      let openRows: {
        id: string;
        metric: string | null;
        source: string | null;
        title: string;
        reason: string;
        tent: string | null;
      }[] = [];
      // Inserts committed after this point may be missing from the list below.
      const listSeq = globalAlertWriteSeq;
      try {
        const rows = await listAlerts({ growId, status: "open" });
        openRows = rows.map((r) => ({
          id: typeof r.id === "string" ? r.id : "",
          metric: r.metric ?? null,
          source: r.source ?? null,
          title: r.title,
          reason: r.reason ?? "",
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

      if (cancelled) return;

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

      const existingDirections = new Set<string>();
      const openRowByDirection = new Map<string, (typeof openRows)[number]>();
      for (const r of openRows) {
        const dirKey = thresholdDirectionKey(growId, r.tent, r.source ?? SOURCE, r.metric, r.title);
        if (dirKey) {
          existingDirections.add(dirKey);
          if (!openRowByDirection.has(dirKey)) openRowByDirection.set(dirKey, r);
        }
      }
      // A configured-target candidate blocked by an open stage/default-range
      // row, or by an open configured-target row quoting an edited range, in
      // the same direction refreshes that row's wording instead of inserting
      // a second alert (the #2179 one-per-direction guard stays).
      const contextRefreshes: {
        id: string;
        title: string;
        reason: string;
        refs: OriginatingTimelineEventRef[];
      }[] = [];

      const toInsert = persistable.filter((a) => {
        const key = scopedKey(observedTentId, derivedAlertKey(a, SOURCE));
        const dirKey = thresholdDirectionKey(
          growId,
          observedTentId,
          SOURCE,
          typeof a.metric === "string" ? a.metric : null,
          a.title,
        );
        // Checked even when the exact rule key is already open: a target edit
        // keeps the same title, so only the reason (its range) differs.
        if (dirKey !== null) {
          const openRow = openRowByDirection.get(dirKey);
          const refresh = openRow ? resolveAlertContextRefresh(openRow, a) : null;
          // The refreshed reason quotes this candidate's observation, so it
          // carries this candidate's evidence refs; without refs it is skipped.
          const refs = refresh ? resolveEnvironmentAlertEvidenceRefs(a, input.snapshot) : [];
          if (
            openRow?.id &&
            refresh &&
            refs.length > 0 &&
            !contextRefreshes.some((c) => c.id === openRow.id)
          ) {
            contextRefreshes.push({ id: openRow.id, ...refresh, refs });
          }
        }
        if (existing.has(key) || (dirKey !== null && existingDirections.has(dirKey))) return false;
        if (activeKeys.has(key)) return false;
        if (globalInFlightAlertKeys.has(key)) {
          blockedAlertKeys.add(key);
          return false;
        }
        // Another instance inserted this alert after our list was requested;
        // the row exists even though the list above cannot show it.
        if ((globalCommittedAlertSeq.get(key) ?? -1) > listSeq) return false;
        activeKeys.add(key);
        pendingKeys.add(key);
        globalInFlightAlertKeys.add(key);
        pendingAlertKeys.add(key);
        if (dirKey) existingDirections.add(dirKey);
        return true;
      });

      let refreshError: string | null = null;
      for (const refresh of contextRefreshes) {
        if (cancelled) return;
        try {
          await updateOpenAlertContext(refresh.id, {
            title: refresh.title,
            reason: refresh.reason,
            originating_timeline_events: refresh.refs,
          });
        } catch (err) {
          refreshError ??= `alert context refresh failed: ${(err as Error)?.message ?? "update failed"}`;
        }
      }
      if (cancelled) return;
      // A failed refresh leaves the open alert quoting the old range, and no
      // dependency of this effect moves to run it again. Surface the error
      // and wake a bounded number of times to retry; success resets it. The
      // wake re-runs this effect, so it is armed only once this run's inserts
      // have settled: an earlier wake would cancel a pending insert whose
      // failure could then reach no one.
      let refreshRetryDelay: number | null = null;
      if (contextRefreshes.length > 0) {
        if (refreshError) {
          refreshFailures.current += 1;
          refreshRetryDelay = alertContextRefreshRetryDelayMs(refreshFailures.current);
        } else {
          refreshFailures.current = 0;
        }
      }
      const armRefreshRetry = () => {
        if (cancelled || refreshRetryDelay === null) return;
        refreshRetryId = window.setTimeout(
          () => setRefreshRetryWake((n) => n + 1),
          refreshRetryDelay,
        );
      };

      if (toInsert.length === 0) {
        armRefreshRetry();
        setState({
          status: refreshError ? "error" : "done",
          persistedCount: 0,
          lastError: refreshError,
        });
        return;
      }

      if (!cancelled) {
        setState((s) => ({ ...s, status: "writing" }));
      }

      let persistedCount = 0;
      let lastError: string | null = refreshError;

      for (const a of toInsert) {
        if (cancelled) return;
        const key = scopedKey(observedTentId, derivedAlertKey(a, SOURCE));
        pendingKeys.delete(key);
        pendingAlertKeys.delete(key);
        activePersistWriteCount += 1;
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
          // The row is committed: release the reservation, here and in this
          // instance's own guard, without waking blocked instances. Any run
          // whose list predates this insert is fenced by the sequence, so a
          // closed alert can be persisted again by any instance, this one too.
          globalAlertWriteSeq += 1;
          globalCommittedAlertSeq.set(key, globalAlertWriteSeq);
          globalInFlightAlertKeys.delete(key);
          activeKeys.delete(key);
          const logDedupKey = `${saved?.id ?? ""}::${key}`;
          if (!globalCreatedEventLoggedKeys.has(logDedupKey)) {
            globalCreatedEventLoggedKeys.add(logDedupKey);
            try {
              await logAlertEvent({
                alert_id: saved.id,
                grow_id: growId,
                event_type: "created",
                new_status: "open",
              });
            } catch (logErr) {
              globalCreatedEventLoggedKeys.delete(logDedupKey);
              lastError = `audit log failed: ${(logErr as Error).message}`;
            }
          }
          persistedCount += 1;
        } catch (err) {
          // Release the in-flight guard so a later real attempt can retry.
          activeKeys.delete(key);
          releaseAlertReservation(key);
          lastError = (err as Error).message ?? "insert failed";
        } finally {
          activePersistWriteCount -= 1;
          maybeClearGlobalSnapshotReservations();
        }
      }

      if (!cancelled) {
        armRefreshRetry();
        setState({
          status: lastError ? "error" : "done",
          persistedCount,
          lastError,
        });
      }
    })();

    return () => {
      cancelled = true;
      reservationReleaseListeners.delete(onReservationReleased);
      if (wakeId !== null) window.clearTimeout(wakeId);
      if (refreshRetryId !== null) window.clearTimeout(refreshRetryId);
      for (const key of pendingKeys) activeKeys.delete(key);
      pendingKeys.clear();
      // Unstarted reservations are released like a failed write, so an
      // instance that deferred to this run retries instead of waiting forever.
      for (const key of pendingAlertKeys) releaseAlertReservation(key);
      pendingAlertKeys.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    targetsPending,
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
    eligibilityWake,
    reservationWake,
    refreshRetryWake,
  ]);

  return state;
}

export default usePersistEnvironmentAlerts;
