/**
 * Shared route builders for grow-scoped navigation.
 *
 * Centralizes URL construction so the app has one source of truth for
 * `?growId=` query params and dynamic route segments. All ID-bearing
 * helpers URL-encode the id (defensive: ids are normally UUIDs, but the
 * helpers must be safe for any string input).
 *
 * Pure functions. No side effects, no network, no privileged access.
 */

const withGrowId = (base: string, growId?: string | null): string =>
  growId ? `${base}?growId=${encodeURIComponent(growId)}` : base;

export const growDetailPath = (growId: string): string =>
  `/grows/${encodeURIComponent(growId)}`;

export const logsPath = (growId?: string | null): string => withGrowId("/logs", growId);
export const timelinePath = (growId?: string | null): string => withGrowId("/timeline", growId);
export const plantsPath = (growId?: string | null): string => withGrowId("/plants", growId);
export const tentsPath = (growId?: string | null): string => withGrowId("/tents", growId);
export const actionsPath = (growId?: string | null): string => withGrowId("/actions", growId);
export const dashboardPath = (growId?: string | null): string => withGrowId("/dashboard", growId);
export const alertsPath = (growId?: string | null): string => withGrowId("/alerts", growId);

export const actionDetailPath = (actionId: string): string =>
  `/actions/${encodeURIComponent(actionId)}`;

export const alertDetailPath = (alertId: string): string =>
  `/alerts/${encodeURIComponent(alertId)}`;

export const plantDetailPath = (plantId: string): string =>
  `/plants/${encodeURIComponent(plantId)}`;

export const tentDetailPath = (tentId: string): string =>
  `/tents/${encodeURIComponent(tentId)}`;

