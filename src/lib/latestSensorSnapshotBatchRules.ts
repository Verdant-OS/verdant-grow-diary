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
  { kind: "found"; snapshot: S } | { kind: "none" } | { kind: "fallback" };

/**
 * The per-tent diary scan returns the first usable candidate, newest first;
 * with none usable it yields nothing when the candidate set is complete and
 * at most `maxCandidates` long, else it is unavailable. Over a window: a hit
 * inside the tent's prefix is that same first hit; no hit is final only when
 * the window held the tent's whole candidate set within the per-tent bound.
 */
export function resolveDiaryWindow<R, S>(
  own: readonly R[],
  windowFull: boolean,
  maxCandidates: number,
  toSnapshot: (row: R) => S | null,
): DiaryWindowVerdict<S> {
  for (const row of own) {
    const snapshot = toSnapshot(row);
    if (snapshot) return { kind: "found", snapshot };
  }
  if (windowFull || own.length > maxCandidates) return { kind: "fallback" };
  return { kind: "none" };
}
