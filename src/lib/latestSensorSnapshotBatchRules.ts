/**
 * Pure rules for reading several tents' Dashboard snapshots through one
 * cross-tent window instead of one read per tent (Codex P2 on #2303 at
 * d6ef3a20).
 *
 * The per-tent read is `newest N rows of this tent`. A window over all tents,
 * in the same newest-first order, contains for each tent a prefix of its own
 * newest rows. That prefix equals the per-tent read when the window was not
 * cut short (not full), or when the tent already has N rows inside it. Any
 * other tent falls back to its own read, so the result never differs from the
 * per-tent semantics; it only costs fewer reads in the common case.
 */

export interface TentWindowPartition<T> {
  /** Tents whose per-tent read the window reproduces exactly: their rows, window order, capped at the per-tent limit. */
  exact: Map<string, T[]>;
  /** Tents the window cannot stand in for. */
  fallback: string[];
}

export function partitionWindowByTent<T extends { tent_id?: string | null }>(
  rows: readonly T[],
  tentIds: readonly string[],
  perTentLimit: number,
  windowFull: boolean,
): TentWindowPartition<T> {
  const byTent = new Map<string, T[]>();
  for (const row of rows) {
    if (typeof row.tent_id !== "string") continue;
    const own = byTent.get(row.tent_id);
    if (own) own.push(row);
    else byTent.set(row.tent_id, [row]);
  }
  const exact = new Map<string, T[]>();
  const fallback: string[] = [];
  for (const tentId of tentIds) {
    const own = byTent.get(tentId) ?? [];
    if (windowFull && own.length < perTentLimit) fallback.push(tentId);
    else exact.set(tentId, own.slice(0, perTentLimit));
  }
  return { exact, fallback };
}

export type DiaryWindowVerdict<S> =
  | { kind: "found"; snapshot: S }
  | { kind: "none" }
  | { kind: "fallback" }
  | { kind: "unavailable" };

/**
 * The per-tent diary scan looks at the newest `maxCandidates` rows at most:
 * the first usable one wins; none usable with more candidates behind them is
 * unavailable; none usable in a complete, bounded set is nothing. Over a
 * window the tent's rows are a prefix of its own newest rows, so the same
 * three answers hold once the scan is bounded the same way (Codex P1 on #2303
 * at 108e3eab); only a full window with no hit and no excess leaves the tail
 * unknown, which is the per-tent fallback.
 */
export function resolveDiaryWindow<R, S>(
  own: readonly R[],
  windowFull: boolean,
  maxCandidates: number,
  toSnapshot: (row: R) => S | null,
): DiaryWindowVerdict<S> {
  for (const row of own.slice(0, maxCandidates)) {
    const snapshot = toSnapshot(row);
    if (snapshot) return { kind: "found", snapshot };
  }
  if (own.length > maxCandidates) return { kind: "unavailable" };
  if (windowFull) return { kind: "fallback" };
  return { kind: "none" };
}

/**
 * PostgREST caps one response at this many rows unless the deployment raises
 * it. A window that asks for more would come back capped and still shorter
 * than it asked for, so it would read as complete while tents were crowded
 * out (Codex P1 on #2303 at 3d1e5800). Windows never ask for more than this,
 * so "shorter than requested" keeps meaning "complete".
 */
export const POSTGREST_MAX_ROWS = 1000;

/** Rows to request for one sensor window over `tentCount` tents. */
export function sensorWindowLimit(tentCount: number, perTentLimit: number): number {
  return Math.min(perTentLimit * tentCount, POSTGREST_MAX_ROWS);
}

/** Candidate rows for one diary window over `tentCount` tents; one lookahead row is added by the read. */
export function diaryWindowLimit(tentCount: number, pageSize: number): number {
  return Math.min(pageSize * tentCount, POSTGREST_MAX_ROWS - 1);
}
