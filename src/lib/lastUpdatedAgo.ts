/**
 * lastUpdatedAgo — pure formatter for the "Last updated" UI line surfaced
 * next to the latest sensor snapshot. This label describes when the UI
 * query result was refreshed; it MUST NOT imply the data is Live. Use the
 * existing source/freshness badge for sensor-truth labeling.
 */
export function formatLastUpdatedAgo(
  lastUpdatedAt: number | null | undefined,
  nowMs: number,
): string {
  if (
    lastUpdatedAt === null ||
    lastUpdatedAt === undefined ||
    !Number.isFinite(lastUpdatedAt) ||
    lastUpdatedAt <= 0
  ) {
    return "Last updated: —";
  }
  const diffMs = Math.max(0, nowMs - lastUpdatedAt);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "Last updated: just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `Last updated: ${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `Last updated: ${hr} hr ago`;
  const days = Math.round(hr / 24);
  return `Last updated: ${days} d ago`;
}
