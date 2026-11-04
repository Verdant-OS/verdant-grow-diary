/**
 * Tells a missing EcoWitt claims backend (table or RPC not deployed yet)
 * apart from a real failure. Only "relation/function does not exist" style
 * errors count as missing; network, 5xx, and auth errors do not.
 */
export interface EcowittBackendErrorLike {
  readonly message?: string | null;
  readonly code?: string | null;
  readonly status?: number | null;
}

const MISSING_BACKEND_CODES: ReadonlySet<string> = new Set([
  "PGRST205", // PostgREST: table not in schema cache
  "PGRST202", // PostgREST: function not in schema cache
  "42P01", // Postgres: undefined_table
  "42883", // Postgres: undefined_function
]);

export class EcowittClaimsBackendAvailability {
  static isMissingBackend(error: EcowittBackendErrorLike | null | undefined): boolean {
    if (error === null || error === undefined || typeof error !== "object") return false;
    if (typeof error.code === "string" && MISSING_BACKEND_CODES.has(error.code)) return true;
    return error.status === 404;
  }
}
