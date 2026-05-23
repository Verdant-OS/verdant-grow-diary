/**
 * Shared fail-closed response-body contract for the pi-ingest-readings
 * Edge Function. Pure data builders only — no Response objects, no Deno,
 * no Supabase, no network. The Edge Function and its tests both consume
 * these builders so that the wire contract has exactly one source of
 * truth.
 *
 * There is intentionally NO success-path builder. The endpoint must
 * remain fail-closed until the server-only bridge secret resolver is
 * implemented inside the Edge Function.
 */

export const PI_INGEST_METHOD_NOT_ALLOWED_ERROR = "method_not_allowed" as const;
export const PI_INGEST_SECRET_RESOLVER_NOT_IMPLEMENTED_ERROR =
  "secret_resolver_not_implemented" as const;

export const PI_INGEST_METHOD_NOT_ALLOWED_MESSAGE =
  "pi-ingest-readings only accepts POST requests." as const;

export const PI_INGEST_SECRET_RESOLVER_NOT_IMPLEMENTED_MESSAGE =
  "pi-ingest-readings is intentionally disabled until the server-only bridge secret resolver is implemented inside this Edge Function." as const;

export interface MethodNotAllowedResponseBody {
  ok: false;
  error: typeof PI_INGEST_METHOD_NOT_ALLOWED_ERROR;
  message: string;
}

export interface SecretResolverNotImplementedResponseBody {
  ok: false;
  error: typeof PI_INGEST_SECRET_RESOLVER_NOT_IMPLEMENTED_ERROR;
  message: string;
}

export type PiIngestFailClosedResponseBody =
  | MethodNotAllowedResponseBody
  | SecretResolverNotImplementedResponseBody;

export function buildMethodNotAllowedResponseBody(): MethodNotAllowedResponseBody {
  return {
    ok: false,
    error: PI_INGEST_METHOD_NOT_ALLOWED_ERROR,
    message: PI_INGEST_METHOD_NOT_ALLOWED_MESSAGE,
  };
}

export function buildSecretResolverNotImplementedResponseBody(): SecretResolverNotImplementedResponseBody {
  return {
    ok: false,
    error: PI_INGEST_SECRET_RESOLVER_NOT_IMPLEMENTED_ERROR,
    message: PI_INGEST_SECRET_RESOLVER_NOT_IMPLEMENTED_MESSAGE,
  };
}
