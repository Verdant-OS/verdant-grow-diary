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
export const sensorsPath = (growId?: string | null): string => withGrowId("/sensors", growId);

export const actionDetailPath = (actionId: string): string =>
  `/actions/${encodeURIComponent(actionId)}`;

/** ActionDetail deep-linked to the outcome capture section. */
export const actionDetailOutcomePath = (actionId: string): string =>
  `${actionDetailPath(actionId)}#outcome-section`;

/** GrowDetail deep-linked to the outcome/learning report section. */
export const growDetailOutcomesPath = (growId: string): string =>
  `${growDetailPath(growId)}#outcomes`;

/**
 * Action Queue scoped to a single alert's linked actions via the URL-driven
 * "Filtered by alert" context chip. Presenter affordance — the page itself
 * does not server-filter on this param yet, it only shows the context chip.
 */
export const actionQueueAlertContextPath = (alertId: string): string =>
  `/actions?alert=${encodeURIComponent(alertId)}`;


export const alertDetailPath = (alertId: string): string =>
  `/alerts/${encodeURIComponent(alertId)}`;

/**
 * Plant detail route. The canonical shape is `/plants/:id` and remains
 * the source of truth — `opts` only appends additive, read-only query
 * params used by the presenter for navigation context and read-only
 * surfaces.
 *
 * - `tentId`: tent context so blocked states (loading-slow / error) can
 *   render a safe "Back to tent" link even when the plant query never
 *   resolves.
 * - `mode`: optional read-only display mode. Currently only
 *   `"archived-timeline"`, which lets the grower inspect an archived
 *   plant's preserved history without exposing write surfaces.
 */
export type PlantDetailMode = "archived-timeline";

export const plantDetailPath = (
  plantId: string,
  opts?: { tentId?: string | null; mode?: PlantDetailMode | null },
): string => {
  const base = `/plants/${encodeURIComponent(plantId)}`;
  if (!opts) return base;
  const params = new URLSearchParams();
  if (typeof opts.tentId === "string" && opts.tentId.length > 0) {
    params.set("tentId", opts.tentId);
  }
  if (typeof opts.mode === "string" && opts.mode.length > 0) {
    params.set("mode", opts.mode);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
};

export const tentDetailPath = (tentId: string): string =>
  `/tents/${encodeURIComponent(tentId)}`;

export const aiDoctorSessionDetailPath = (sessionId: string): string =>
  `/doctor/sessions/${encodeURIComponent(sessionId)}`;


