/**
 * useLatestSensorSnapshot — read-only Supabase loader for the scoped Dashboard
 * "Latest Environment" card.
 *
 * Data source priority:
 *  1. latest sensor_readings rows for the scoped grow's tents (if any)
 *  2. latest diary_entries evidence for the scoped grow, tent-scoped when
 *     tentIds is non-empty:
 *       a. details.sensor_snapshot
 *       b. details.environment_check (manual envelope; #596)
 *  3. otherwise EMPTY_SNAPSHOT (rendered as "No sensor data yet.")
 *
 * Tent scope (#602): when the view is tent-scoped, diary rows with null or
 * foreign tent_id never surface as that tent's environment evidence — same
 * fail-closed gate for sensor_snapshot and environment_check.
 *
 * Backed by TanStack Query so manual sensor inserts that invalidate
 * `["latest-sensor-snapshot"]` (or `["sensor_readings"]`) trigger a refetch
 * without a hard refresh. Sort uses `captured_at desc, ts desc, created_at
 * desc` so imported historical rows are ordered by their actual observation
 * time rather than one shared import time.
 *
 * Read-only: no .insert/.update/.delete/.upsert/.rpc. No ai-coach call.
 * No device-control surface. No elevated keys. RLS enforces ownership.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  EMPTY_SNAPSHOT,
  isSnapshotStale,
  type SensorSnapshot,
  snapshotFromDiary,
  snapshotFromEnvironmentCheck,
  snapshotFromReadings,
} from "@/lib/sensorSnapshot";
import { isDiaryRowInTentScope } from "@/lib/diaryEvidenceTentScopeRules";
import { selectDashboardSensorEvidenceRows } from "@/lib/dashboardSensorEvidenceRules";

/**
 * A stale sensor snapshot must not suppress fresher grower evidence (Codex
 * review, PR #601): once a sensor stops reporting, a newly logged manual
 * snapshot or Environment Check is the latest environment truth and must be
 * able to reach alert persistence. Deterministic tie-break: the sensor
 * snapshot wins unless the diary evidence is strictly newer.
 */
function preferNewer(
  staleSensor: SensorSnapshot | null,
  diaryEvidence: SensorSnapshot,
): SensorSnapshot {
  if (!staleSensor?.ts || !diaryEvidence.ts) return diaryEvidence;
  const sensorAt = Date.parse(staleSensor.ts);
  const diaryAt = Date.parse(diaryEvidence.ts);
  if (!Number.isFinite(sensorAt)) return diaryEvidence;
  if (!Number.isFinite(diaryAt)) return staleSensor;
  return diaryAt > sensorAt ? diaryEvidence : staleSensor;
}

export type SnapshotState =
  | { status: "idle"; snapshot: SensorSnapshot }
  | { status: "loading"; snapshot: SensorSnapshot }
  | { status: "ok"; snapshot: SensorSnapshot }
  | { status: "unavailable"; snapshot: SensorSnapshot };

export function useLatestSensorSnapshot(
  growId: string | null | undefined,
  tentIds: string[],
): SnapshotState {
  const { user } = useAuth();
  const tentKey = tentIds.join("|");

  const query = useQuery<SensorSnapshot>({
    queryKey: ["latest-sensor-snapshot", user?.id ?? "anon", growId ?? "none", tentKey],
    enabled: !!user && !!growId,
    queryFn: async () => {
      try {
        // Fresh sensor rows win unconditionally; a stale sensor snapshot is
        // kept only as a candidate that strictly-newer diary evidence may
        // replace (see preferNewer).
        let staleSensorCandidate: SensorSnapshot | null = null;
        // 1) Prefer live sensor_readings if any tents are scoped.
        if (tentIds.length > 0) {
          const { data, error } = await supabase
            .from("sensor_readings")
            .select("id,ts,captured_at,metric,value,quality,source,tent_id,created_at,raw_payload")
            .in("tent_id", tentIds)
            .order("captured_at", { ascending: false, nullsFirst: false })
            .order("ts", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(50);
          const evidenceRows = !error ? selectDashboardSensorEvidenceRows(data ?? []) : [];
          if (evidenceRows.length > 0) {
            const snap = snapshotFromReadings(
              evidenceRows.map((r) => ({
                id: (r as { id?: string | null }).id ?? null,
                ts: r.ts,
                captured_at: (r as { captured_at?: string | null }).captured_at ?? null,
                metric: r.metric,
                value: r.value as number | string | null,
                source: r.source as string | null,
                // Carry the row's tent so snapshotFromReadings can attribute
                // the snapshot when every contributing row agrees. Dropping
                // it here is what left every persisted environment alert
                // tent-less, which in turn left the Plant Detail
                // assigned-tent alerts panel permanently empty.
                tent_id: (r as { tent_id?: string | null }).tent_id ?? null,
                raw_payload: (r as { raw_payload?: unknown }).raw_payload,
              })),
            );
            if (snap && !isSnapshotStale(snap)) return snap;
            staleSensorCandidate = snap;
          }
        }
        // 2) Fall back to latest diary_entries evidence for this grow.
        // Select `id` so Environment Check snapshots can carry a diary
        // evidence ref for alert persistence (#603). Select `tent_id` so
        // tent-scoped views reject foreign/null attribution (#602).
        if (!growId) return staleSensorCandidate ?? EMPTY_SNAPSHOT;
        const { data: diaryRows, error: diaryErr } = await supabase
          .from("diary_entries")
          .select("id,entry_at,details,tent_id")
          .is("retracted_at", null)
          .eq("grow_id", growId)
          .order("entry_at", { ascending: false })
          .limit(20);
        if (diaryErr) throw diaryErr;
        for (const row of diaryRows ?? []) {
          const details = (row.details ?? null) as Record<string, unknown> | null;
          if (!details || typeof details !== "object") continue;
          // #602 / #601: tent-scoped views only accept diary rows attributed
          // to one of those tents — null/foreign tent_id is not this tent's
          // evidence (sensor_snapshot and environment_check share the gate).
          if (!isDiaryRowInTentScope(row.tent_id, tentIds)) continue;
          // Past that gate the row is proven in scope, so its own tent is the
          // honest attribution for whichever snapshot this row yields. (This
          // replaces an earlier local `envScopeOk` hoist from this branch:
          // #602 made the gate a hard skip for BOTH diary paths, so the
          // in-scope check no longer needs restating here.)
          const rowTentInScope = row.tent_id ?? null;
          const snap = snapshotFromDiary(
            row.entry_at,
            details.sensor_snapshot as Record<string, unknown> | undefined,
          );
          if (snap) {
            snap.tent_id = rowTentInScope;
            return preferNewer(staleSensorCandidate, snap);
          }
          // #596: a Quick Log Environment Check is grower-entered manual
          // evidence; within the same row a full sensor_snapshot blob wins,
          // and rows are already newest-first.
          const diaryEntryId =
            typeof (row as { id?: string | null }).id === "string"
              ? (row as { id: string }).id
              : null;
          const envSnap = snapshotFromEnvironmentCheck(
            row.entry_at,
            details.environment_check as Record<string, unknown> | undefined,
            { diaryEntryId },
          );
          if (envSnap) {
            // Already proven in-scope by the isDiaryRowInTentScope gate above.
            envSnap.tent_id = rowTentInScope;
            return preferNewer(staleSensorCandidate, envSnap);
          }
        }
        // 3) Nothing newer in the diary: a stale sensor snapshot is still the
        // latest evidence (rendered with its stale badge), else nothing.
        return staleSensorCandidate ?? EMPTY_SNAPSHOT;
      } catch {
        throw new Error("unavailable");
      }
    },
  });

  if (!user || !growId) {
    return { status: "idle", snapshot: EMPTY_SNAPSHOT };
  }
  if (query.isLoading || (query.isFetching && !query.data)) {
    return { status: "loading", snapshot: EMPTY_SNAPSHOT };
  }
  if (query.isError) {
    return { status: "unavailable", snapshot: EMPTY_SNAPSHOT };
  }
  return { status: "ok", snapshot: query.data ?? EMPTY_SNAPSHOT };
}

export default useLatestSensorSnapshot;
