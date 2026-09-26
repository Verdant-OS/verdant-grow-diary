import { useEffect, useState, type ReactNode } from "react";

/** Longest delay a browser timer honours; larger delays fire immediately. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * Keep time-sensitive snapshot rendering local to the row, not the full Timeline.
 *
 * `changesAt` is the instant (epoch ms) after which the row's rendering can no
 * longer change — for a persisted snapshot, its freshness boundary. The row
 * re-renders once just past it and then holds no timer, so historical rows cost
 * nothing however many Timeline pages are loaded.
 */
export default function TimelineSnapshotClock({
  changesAt,
  children,
}: {
  changesAt: number | null;
  children: (nowMs: number) => ReactNode;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (changesAt === null || !Number.isFinite(changesAt) || nowMs > changesAt) return;
    const delay = Math.min(Math.max(changesAt - Date.now() + 1, 0), MAX_TIMER_DELAY_MS);
    const id = window.setTimeout(() => setNowMs(Date.now()), delay);
    return () => window.clearTimeout(id);
  }, [changesAt, nowMs]);
  return <>{children(nowMs)}</>;
}
