import { useEffect, useState, type ReactNode } from "react";

/** Longest delay a browser timer honours; larger delays fire immediately. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * Keep time-sensitive snapshot rendering local to the row, not the full Timeline.
 *
 * `changesAt` is the instant (epoch ms) after which the row's rendering can no
 * longer change — for a persisted snapshot, its freshness boundary. The row
 * re-renders at an optional earlier recheck, then once just past expiry and
 * holds no timer, so historical rows cost
 * nothing however many Timeline pages are loaded.
 */
export default function TimelineSnapshotClock({
  changesAt,
  recheckAt,
  children,
}: {
  changesAt: number | null;
  /** Optional earlier transition, such as a future capture becoming valid. */
  recheckAt?: number;
  children: (nowMs: number) => ReactNode;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const boundaries = [
      typeof recheckAt === "number" && Number.isFinite(recheckAt) && recheckAt > nowMs
        ? recheckAt
        : Infinity,
      changesAt !== null && Number.isFinite(changesAt) && nowMs <= changesAt
        ? changesAt + 1
        : Infinity,
    ];
    const nextAt = Math.min(...boundaries);
    if (!Number.isFinite(nextAt)) return;
    const delay = Math.min(Math.max(nextAt - Date.now(), 0), MAX_TIMER_DELAY_MS);
    const id = window.setTimeout(() => setNowMs(Date.now()), delay);
    return () => window.clearTimeout(id);
  }, [changesAt, recheckAt, nowMs]);
  return <>{children(nowMs)}</>;
}
