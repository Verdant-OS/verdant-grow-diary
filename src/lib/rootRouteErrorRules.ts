/**
 * TanStack Router route error boundaries may receive non-Error throw values.
 * Error reporters expect Error instances with a stable message shape.
 */
export function normalizeRouteError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
