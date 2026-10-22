/**
 * useLatestSensorSnapshot — read-only Supabase loader for the scoped Dashboard
 * "Latest Environment" card.
 *
 * Data source priority:
 *  1. latest sensor_readings rows for the scoped grow's tents (if any)
 *  2. latest diary_entries evidence for the scoped grow, tent-scoped when
 *     tentIds is non-empty:
 *       a. details.sensor_snapshot
 *       b. details.manual_sensor_snapshot (Plant Quick Log manual envelope)
 *       c. details.environment_check (manual envelope; #596)
 *  3. otherwise EMPTY_SNAPSHOT (rendered as "No sensor data yet.")
 *
 * Tent scope (#602): when the view is tent-scoped, diary rows with null or
 * foreign tent_id never surface as that tent's environment evidence — same
 * fail-closed gate for sensor_snapshot, manual_sensor_snapshot, and
 * environment_check.
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
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { SensorReadingRow } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  EMPTY_SNAPSHOT,
  hasFiniteSnapshotMetric,
  isSnapshotStale,
  type SensorSnapshot,
  snapshotFromDiary,
  snapshotFromEnvironmentCheck,
  snapshotFromManualSensorSnapshot,
  snapshotFromReadings,
} from "@/lib/sensorSnapshot";
import { isDiaryRowInTentScope } from "@/lib/diaryEvidenceTentScopeRules";
import { selectDashboardSensorEvidenceRows } from "@/lib/dashboardSensorEvidenceRules";
import {
  diaryWindowLimit,
  partitionWindowByTent,
  resolveDiaryWindow,
  sensorWindowLimit,
} from "@/lib/latestSensorSnapshotBatchRules";
import { selectWithRetractionCompat } from "@/lib/quick-log/retractionFilterCompat";
import {
  EFFECTIVE_SENSOR_QUERY_VERSION,
  effectiveSensorReadingsQuery,
  requireEffectiveSensorReadings,
} from "@/lib/effectiveSensorReadings";

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

const DIARY_EVIDENCE_PAGE_SIZE = 20;
// The first read stays small. If it has no usable evidence, one bounded read
// restarts at the newest row so a retraction between requests cannot shift an
// older candidate across a mutable offset. An unexamined tail is unavailable.
const DIARY_EVIDENCE_MAX_CANDIDATES = 200;
const DIARY_EVIDENCE_OR_FILTER =
  "details->>sensor_snapshot.not.is.null,details->>manual_sensor_snapshot.not.is.null,details->>environment_check.not.is.null";

export type SnapshotState =
  | { status: "idle"; snapshot: SensorSnapshot; isFetching?: boolean; isPaused?: boolean }
  | { status: "loading"; snapshot: SensorSnapshot; isFetching?: boolean; isPaused?: boolean }
  | { status: "ok"; snapshot: SensorSnapshot; isFetching?: boolean; isPaused?: boolean }
  | { status: "unavailable"; snapshot: SensorSnapshot; isFetching?: boolean; isPaused?: boolean };

/** One cache entry per (user, grow, tent set): shared by every reader of that scope. */
export function latestSensorSnapshotQueryKey(
  userId: string | null | undefined,
  growId: string | null | undefined,
  tentIds: readonly string[],
) {
  return [
    "latest-sensor-snapshot",
    userId ?? "anon",
    growId ?? "none",
    tentIds.join("|"),
    EFFECTIVE_SENSOR_QUERY_VERSION,
  ] as const;
}

/** The per-tent sensor read is the newest rows of that tent, capped here. */
const SENSOR_ROWS_PER_TENT = 50;

type DiaryEvidenceRow = {
  id: string | null;
  entry_at: string;
  details: unknown;
  tent_id: string | null;
};

/**
 * The read behind `useLatestSensorSnapshot`, as one function so a page that
 * shows several tents can run the same per-tent semantics once at page level
 * (`fetchLatestSensorSnapshotsByTent`) instead of once per card (Codex P2 on
 * #2303 at 0c19a9e0 and d6ef3a20).
 */
export async function fetchLatestSensorSnapshot(
  growId: string | null | undefined,
  tentIds: string[],
): Promise<SensorSnapshot> {
  try {
    // Fresh sensor rows win unconditionally; a stale sensor snapshot is
    // kept only as a candidate that strictly-newer diary evidence may
    // replace (see preferNewer).
    let staleSensorCandidate: SensorSnapshot | null = null;
    let sensorReadFailed = false;
    // 1) Prefer live sensor_readings if any tents are scoped.
    if (tentIds.length > 0) {
      let evidenceRows: ReturnType<typeof requireEffectiveSensorReadings> = [];
      try {
        const { data, error } = await effectiveSensorReadingsQuery()
          .select("*")
          .in("tent_id", tentIds)
          .order("captured_at", { ascending: false, nullsFirst: false })
          .order("ts", { ascending: false })
          .order("created_at", { ascending: false })
          // A unique final key: rows sharing every timestamp (one imported
          // capture) must cut identically here and in the bulk window
          // (Codex P1 on #2303 at 3d1e5800).
          .order("id", { ascending: false })
          .limit(SENSOR_ROWS_PER_TENT);
        if (error) throw error;
        evidenceRows = selectDashboardSensorEvidenceRows(requireEffectiveSensorReadings(data));
      } catch {
        // A separate, usable diary read may survive this failure. If no
        // such evidence exists, this is unavailable rather than empty.
        sensorReadFailed = true;
      }
      if (evidenceRows.length > 0) {
        const snap = snapshotFromEvidenceRows(evidenceRows);
        if (snap && !isSnapshotStale(snap)) return snap;
        staleSensorCandidate = snap;
      }
    }
    // 2) and 3) Diary evidence, else the stale candidate, else nothing.
    return await resolveDiaryEvidence(growId, tentIds, staleSensorCandidate, sensorReadFailed);
  } catch {
    throw new Error("unavailable");
  }
}

/**
 * Steps 2 and 3 of the per-tent read, without the sensor step: the bounded
 * diary scan for this scope, then the stale sensor candidate, else nothing.
 * Throws `unavailable` when the diary read fails, when the bounded candidate
 * set is exhausted with a tail unexamined, or when the sensor read had failed
 * and the diary holds nothing. The bulk read uses it on its own for a tent
 * whose sensor window failed, so an outage never repeats the sensor read per
 * tent (Codex P2 on #2303 at 108e3eab).
 */
async function resolveDiaryEvidence(
  growId: string | null | undefined,
  tentIds: readonly string[],
  staleSensorCandidate: SensorSnapshot | null,
  sensorReadFailed: boolean,
): Promise<SensorSnapshot> {
  // 2) Fall back to latest diary_entries evidence for this grow.
  if (!growId) return staleSensorCandidate ?? EMPTY_SNAPSHOT;
  for (const candidateLimit of [DIARY_EVIDENCE_PAGE_SIZE, DIARY_EVIDENCE_MAX_CANDIDATES]) {
    const diaryRows = await readDiaryEvidenceCandidates(growId, tentIds, candidateLimit);
    for (const row of diaryRows.slice(0, candidateLimit)) {
      const snap = snapshotFromDiaryEvidenceRow(row, tentIds);
      if (snap) return preferNewer(staleSensorCandidate, snap);
    }
    // A candidate key alone does not prove a usable reading. Re-read
    // from the beginning instead of trusting offsets in a changing set.
    if (diaryRows.length > candidateLimit) {
      if (candidateLimit === DIARY_EVIDENCE_MAX_CANDIDATES) throw new Error("unavailable");
      continue;
    }
    break;
  }
  // 3) Nothing newer in the diary: a stale sensor snapshot is still the
  // latest evidence (rendered with its stale badge), else nothing.
  if (sensorReadFailed) throw new Error("unavailable");
  return staleSensorCandidate ?? EMPTY_SNAPSHOT;
}

/**
 * Every tent's Dashboard snapshot for one grow, with the per-tent semantics of
 * `fetchLatestSensorSnapshot` and as few reads as those semantics allow: one
 * sensor window over all tents, one diary window over the tents that still
 * need diary evidence, and a per-tent read only for a tent the windows cannot
 * stand in for (see latestSensorSnapshotBatchRules). `null` marks a tent whose
 * own read is unavailable (Codex P2 on #2303 at d6ef3a20).
 */
export async function fetchLatestSensorSnapshotsByTent(
  growId: string | null | undefined,
  tentIds: readonly string[],
): Promise<Record<string, SensorSnapshot | null>> {
  const result: Record<string, SensorSnapshot | null> = {};
  const unique = [...new Set(tentIds)];
  if (unique.length === 0) return result;
  const fallback = new Set<string>();
  const staleByTent = new Map<string, SensorSnapshot | null>();
  let needDiary: string[] = [];
  // The per-tent read treats a failed sensor read as "diary evidence or
  // unavailable". The bulk read does the same through one shared diary window
  // instead of N per-tent reads, so a backend failure never multiplies the
  // reads it would otherwise have saved (Codex P2 on #2303 at 3d1e5800).
  let sensorReadFailed = false;
  if (unique.length === 1) {
    fallback.add(unique[0]);
  } else {
    // 1) One sensor window over every tent.
    try {
      const windowLimit = sensorWindowLimit(unique.length, SENSOR_ROWS_PER_TENT);
      const { data, error } = await effectiveSensorReadingsQuery()
        .select("*")
        .in("tent_id", unique)
        .order("captured_at", { ascending: false, nullsFirst: false })
        .order("ts", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(windowLimit);
      if (error) throw error;
      const rows = requireEffectiveSensorReadings(data);
      const partition = partitionWindowByTent(
        rows,
        unique,
        SENSOR_ROWS_PER_TENT,
        rows.length >= windowLimit,
      );
      partition.fallback.forEach((tentId) => fallback.add(tentId));
      for (const [tentId, own] of partition.exact) {
        const evidenceRows = selectDashboardSensorEvidenceRows(own);
        const snap = evidenceRows.length > 0 ? snapshotFromEvidenceRows(evidenceRows) : null;
        if (snap && !isSnapshotStale(snap)) {
          result[tentId] = snap;
          continue;
        }
        staleByTent.set(tentId, snap);
        needDiary.push(tentId);
      }
    } catch {
      sensorReadFailed = true;
      fallback.clear();
      staleByTent.clear();
      needDiary = [...unique];
    }
    // 2) One diary window over the tents without a fresh sensor capture.
    if (needDiary.length > 0) {
      if (!growId) {
        for (const tentId of needDiary) result[tentId] = staleByTent.get(tentId) ?? EMPTY_SNAPSHOT;
      } else {
        try {
          const windowLimit = diaryWindowLimit(needDiary.length, DIARY_EVIDENCE_PAGE_SIZE);
          const diaryRows = await readDiaryEvidenceCandidates(growId, needDiary, windowLimit);
          const windowFull = diaryRows.length > windowLimit;
          const partition = partitionWindowByTent(
            diaryRows
              .slice(0, windowLimit)
              .filter((row) => isDiaryRowInTentScope(row.tent_id, needDiary)),
            needDiary,
            Number.POSITIVE_INFINITY,
            false,
          );
          for (const tentId of needDiary) {
            const verdict = resolveDiaryWindow(
              partition.exact.get(tentId) ?? [],
              windowFull,
              DIARY_EVIDENCE_MAX_CANDIDATES,
              (row) => snapshotFromDiaryEvidenceRow(row, [tentId]),
            );
            if (verdict.kind === "found") {
              result[tentId] = preferNewer(staleByTent.get(tentId) ?? null, verdict.snapshot);
            } else if (verdict.kind === "none") {
              result[tentId] = sensorReadFailed
                ? null
                : (staleByTent.get(tentId) ?? EMPTY_SNAPSHOT);
            } else if (verdict.kind === "unavailable") {
              // The per-tent read gives up past its candidate bound too.
              result[tentId] = null;
            } else {
              fallback.add(tentId);
            }
          }
        } catch {
          // A failed diary read is unavailable for the per-tent read as well;
          // no per-tent read could repair it, so none is started.
          for (const tentId of needDiary) result[tentId] = null;
        }
      }
    }
  }
  // 3) Per-tent reads only where a window could not reproduce one. After a
  // failed sensor window no per-tent read starts at all: a tent the shared
  // diary window could not settle is unavailable, so an outage never fans out
  // into one diary read per tent (Codex P2 on #2303 at fa8edcff).
  if (sensorReadFailed) {
    for (const tentId of fallback) result[tentId] = null;
    return result;
  }
  await Promise.all(
    [...fallback].map(async (tentId) => {
      try {
        result[tentId] = await fetchLatestSensorSnapshot(growId, [tentId]);
      } catch {
        result[tentId] = null;
      }
    }),
  );
  return result;
}

/**
 * One consistent candidate set of diary evidence rows, newest first, with a
 * one-row lookahead so a caller can tell an exhausted set from an unexamined
 * tail. Select `id` so Environment Check snapshots can carry a diary evidence
 * ref for alert persistence (#603); select `tent_id` so tent-scoped views
 * reject foreign/null attribution (#602).
 */
async function readDiaryEvidenceCandidates(
  growId: string,
  tentIds: readonly string[],
  candidateLimit: number,
): Promise<DiaryEvidenceRow[]> {
  const { data: diaryRows, error: diaryErr } = await selectWithRetractionCompat(
    (withRetractionFilter) => {
      let query = supabase.from("diary_entries").select("id,entry_at,details,tent_id");
      if (withRetractionFilter) query = query.is("retracted_at", null);
      query = query.eq("grow_id", growId);
      // Filter and scope before paging: ordinary notes in this or
      // another tent must not crowd out saved environment evidence.
      if (tentIds.length > 0) query = query.in("tent_id", [...tentIds]);
      return (
        query
          .or(DIARY_EVIDENCE_OR_FILTER)
          .order("entry_at", { ascending: false })
          .order("id", { ascending: true })
          // Each read is one consistent candidate set. The lookahead
          // distinguishes an exhausted set from an unexamined tail.
          .limit(candidateLimit + 1)
      );
    },
  );
  if (diaryErr || !Array.isArray(diaryRows)) throw new Error("unavailable");
  return diaryRows as DiaryEvidenceRow[];
}

/**
 * The snapshot one diary row yields for a tent scope, or null. #602 / #601:
 * tent-scoped views only accept diary rows attributed to one of those tents;
 * null/foreign tent_id is not this tent's evidence (every diary snapshot
 * envelope shares this gate). Past the gate the row's own tent is the honest
 * attribution. Within one row a full sensor_snapshot blob wins, then the Plant
 * Quick Log manual envelope, then a Quick Log Environment Check (#596).
 */
function snapshotFromDiaryEvidenceRow(
  row: DiaryEvidenceRow,
  tentIds: readonly string[],
): SensorSnapshot | null {
  const details = (row.details ?? null) as Record<string, unknown> | null;
  if (!details || typeof details !== "object") return null;
  if (!isDiaryRowInTentScope(row.tent_id, tentIds)) return null;
  const rowTentInScope = row.tent_id ?? null;
  const snap = snapshotFromDiary(
    row.entry_at,
    details.sensor_snapshot as Record<string, unknown> | undefined,
  );
  if (hasFiniteSnapshotMetric(snap)) {
    snap.tent_id = rowTentInScope;
    return snap;
  }
  const diaryEntryId = typeof row.id === "string" ? row.id : null;
  const manualSnap = snapshotFromManualSensorSnapshot(
    row.entry_at,
    details.manual_sensor_snapshot as Record<string, unknown> | undefined,
    { diaryEntryId },
  );
  if (manualSnap) {
    manualSnap.tent_id = rowTentInScope;
    return manualSnap;
  }
  const envSnap = snapshotFromEnvironmentCheck(
    row.entry_at,
    details.environment_check as Record<string, unknown> | undefined,
    { diaryEntryId },
  );
  if (envSnap) {
    envSnap.tent_id = rowTentInScope;
    return envSnap;
  }
  return null;
}

/** The latest-capture snapshot of already filtered evidence rows. */
function snapshotFromEvidenceRows(
  evidenceRows: readonly SensorReadingRow[],
): SensorSnapshot | null {
  return snapshotFromReadings(
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
}

type SnapshotQueryLike = Pick<
  UseQueryResult<SensorSnapshot>,
  "isPending" | "isFetching" | "isPaused" | "isError" | "data"
>;

/** Pure. The read state every snapshot consumer sees, from one query result. */
function snapshotStateFromQuery(query: SnapshotQueryLike, enabled: boolean): SnapshotState {
  if (!enabled) {
    return { status: "idle", snapshot: EMPTY_SNAPSHOT, isFetching: false, isPaused: false };
  }
  // A first read paused for connectivity is still unresolved. Only a
  // completed read can establish that there is no sensor evidence.
  if (query.isPending || (query.isFetching && !query.data)) {
    return {
      status: "loading",
      snapshot: EMPTY_SNAPSHOT,
      isFetching: query.isFetching,
      isPaused: query.isPaused,
    };
  }
  if (query.isError) {
    return {
      status: "unavailable",
      snapshot: EMPTY_SNAPSHOT,
      isFetching: query.isFetching,
      isPaused: query.isPaused,
    };
  }
  return {
    status: "ok",
    snapshot: query.data ?? EMPTY_SNAPSHOT,
    // TanStack Query preserves cached data during a background refetch. The
    // status remains "ok", so consumers that need current proof evidence
    // must be able to withhold that cached snapshot until the read settles.
    isFetching: query.isFetching,
    // An offline/paused fetch also leaves cached data in place while
    // `isFetching` is false. Expose that state for proof-only consumers;
    // generic snapshot users preserve their normal cache behavior.
    isPaused: query.isPaused,
  };
}

export function useLatestSensorSnapshot(
  growId: string | null | undefined,
  tentIds: string[],
): SnapshotState {
  const { user } = useAuth();
  const enabled = !!user && !!growId;
  const query = useQuery<SensorSnapshot>({
    queryKey: latestSensorSnapshotQueryKey(user?.id, growId, tentIds),
    enabled,
    queryFn: () => fetchLatestSensorSnapshot(growId, tentIds),
  });
  return snapshotStateFromQuery(query, enabled);
}

export interface TentSnapshotScope {
  tentId: string;
  growId: string | null | undefined;
}

export interface SnapshotBatcher {
  /** The tent's snapshot, read through the bulk read shared by every load in the same tick. */
  load(growId: string, tentId: string): Promise<SensorSnapshot>;
}

/**
 * Coalesces the per-tent reads TanStack Query starts in one tick (a cold
 * `/tents` load starts one per uncached tent) into one
 * `fetchLatestSensorSnapshotsByTent` call per grow. Each tent keeps its own
 * cache entry, so a warm entry is never read again and the Dashboard and Tent
 * Detail share it (Codex P2 on #2303 at d6ef3a20).
 */
export function createSnapshotBatcher(
  fetchBulk: typeof fetchLatestSensorSnapshotsByTent = fetchLatestSensorSnapshotsByTent,
): SnapshotBatcher {
  const pending = new Map<
    string,
    { tentIds: Set<string>; promise: Promise<Record<string, SensorSnapshot | null>> }
  >();
  return {
    load(growId, tentId) {
      let batch = pending.get(growId);
      if (!batch) {
        const tentIds = new Set<string>();
        const promise = Promise.resolve().then(() => {
          pending.delete(growId);
          return fetchBulk(growId, [...tentIds]);
        });
        batch = { tentIds, promise };
        pending.set(growId, batch);
      }
      batch.tentIds.add(tentId);
      return batch.promise.then((byTent) => {
        const snapshot = byTent[tentId];
        if (!snapshot) throw new Error("unavailable");
        return snapshot;
      });
    },
  };
}

const snapshotBatcher = createSnapshotBatcher();

/**
 * The per-tent snapshot for a list of tents, keyed by tent id. Each tent's
 * query key is exactly `useLatestSensorSnapshot`'s for `(growId, [tentId])`,
 * so the Dashboard, Tent Detail and the tents list share one cache entry per
 * tent (Codex P2 on #2303 at 0c19a9e0); the reads a cold load starts are
 * coalesced into one bulk read per grow (Codex P2 at d6ef3a20). A tent with no
 * grow is `idle`.
 */
export function useLatestSensorSnapshotsByTent(
  tents: readonly TentSnapshotScope[],
  batcher: SnapshotBatcher = snapshotBatcher,
): Record<string, SnapshotState> {
  const { user } = useAuth();
  const results = useQueries({
    queries: tents.map((tent) => ({
      queryKey: latestSensorSnapshotQueryKey(user?.id, tent.growId, [tent.tentId]),
      enabled: !!user && !!tent.growId,
      queryFn: () => batcher.load(tent.growId as string, tent.tentId),
    })),
  });
  const byTent: Record<string, SnapshotState> = {};
  tents.forEach((tent, index) => {
    byTent[tent.tentId] = snapshotStateFromQuery(
      results[index] as SnapshotQueryLike,
      !!user && !!tent.growId,
    );
  });
  return byTent;
}

export default useLatestSensorSnapshot;
