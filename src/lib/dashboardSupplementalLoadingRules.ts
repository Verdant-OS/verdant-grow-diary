/**
 * Dashboard cards below the critical tent/plant gate.
 * Idle means the read was not started (no grow in scope), not that it is running.
 */
export function isDashboardSupplementalLoading<Status>(
  status: Status,
): status is Extract<Status, "loading"> {
  return status === "loading";
}
