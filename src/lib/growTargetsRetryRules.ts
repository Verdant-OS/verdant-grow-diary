/**
 * growTargetsRetryRules — bounded recovery schedule for a failed grow_targets
 * read. Alert persistence fails closed while targets are unknown, so a
 * transient read error must not leave it skipped for the rest of the mounted
 * session. Retries back off and stop after a fixed number of attempts; a
 * remount or an explicit reload still recovers after that.
 *
 * Pure: no React, no I/O, no clock.
 */

export const GROW_TARGETS_RETRY_DELAYS_MS: readonly number[] = [
  5_000, 15_000, 60_000, 120_000, 120_000, 120_000,
];

/** Delay before retry number `attempt` (0-based), or null once retries are exhausted. */
export function growTargetsRetryDelayMs(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 0) return null;
  return GROW_TARGETS_RETRY_DELAYS_MS[attempt] ?? null;
}
