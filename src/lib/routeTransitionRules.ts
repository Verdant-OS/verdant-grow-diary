/**
 * Route transition timing for the TanStack router.
 *
 * The router default keeps the previous match mounted until `defaultPendingMs`
 * (1000). A Timeline navigation therefore kept painting the Dashboard for
 * about a second, then a blank pending frame. Zero pending delays drop the
 * previous match immediately and show the route skeleton instead.
 */
export const ROUTE_TRANSITION_PENDING_MS = 0;
export const ROUTE_TRANSITION_PENDING_MIN_MS = 0;

export function routeTransitionRouterOptions(): {
  defaultPendingMs: number;
  defaultPendingMinMs: number;
} {
  return {
    defaultPendingMs: ROUTE_TRANSITION_PENDING_MS,
    defaultPendingMinMs: ROUTE_TRANSITION_PENDING_MIN_MS,
  };
}
