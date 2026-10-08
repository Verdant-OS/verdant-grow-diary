// Pure: the cache TTL and the label for a given idle time. CLAUDE.md › Check-in cadence
// measured a 60-minute prompt-cache lifetime; a wake at <= 55 minutes is a cache read.
export const CACHE_TTL_MIN = 60;
export const WARN_AT_MIN = 50;

export function cacheLabel(idleMs: number): string {
  const idleMin = Math.max(0, Math.floor(idleMs / 60_000));
  const left = CACHE_TTL_MIN - idleMin;
  if (left <= 0) return `cache likely cold (idle ${idleMin}m)`;
  if (idleMin >= WARN_AT_MIN) return `cache cold in ~${left}m: reply or arm check-in <= 55m`;
  return `cache warm ~${left}m`;
}

export function shouldWarn(idleMs: number, alreadyWarned: boolean): boolean {
  return !alreadyWarned && idleMs >= WARN_AT_MIN * 60_000 && idleMs < CACHE_TTL_MIN * 60_000;
}
