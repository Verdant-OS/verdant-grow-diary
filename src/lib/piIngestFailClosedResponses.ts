/**
 * Shared fail-closed response-body contract for the pi-ingest-readings
 * Edge Function. Pure data builders only — no Response objects, no Deno,
 * no Supabase, no network. The Edge Function and its tests both consume
 * these builders so that the wire contract has exactly one source of
 * truth.
 *
 * Every builder returns `ok: false`. The endpoint stays fail-closed for
 * ingestion: even the post-auth success branch returns
 * `auth_ok_pipeline_not_implemented` until the sensor insert pipeline
 * ships behind its own gates.
 */

export const PI_INGEST_METHOD_NOT_ALLOWED_ERROR = "method_not_allowed" as const;
export const PI_INGEST_SECRET_RESOLVER_NOT_IMPLEMENTED_ERROR =
  "secret_resolver_not_implemented" as const;
export const PI_INGEST_UNAUTHORIZED_ERROR = "unauthorized" as const;
export const PI_INGEST_INVALID_REQUEST_ERROR = "invalid_request" as const;
export const PI_INGEST_INTERNAL_FAILURE_ERROR = "internal_failure" as const;
export const PI_INGEST_AUTH_OK_PIPELINE_NOT_IMPLEMENTED_ERROR =
  "auth_ok_pipeline_not_implemented" as const;

export const PI_INGEST_METHOD_NOT_ALLOWED_MESSAGE =
  "pi-ingest-readings only accepts POST requests." as const;

export const PI_INGEST_SECRET_RESOLVER_NOT_IMPLEMENTED_MESSAGE =
  "pi-ingest-readings is intentionally disabled until the server-only bridge secret resolver is implemented inside this Edge Function." as const;

export const PI_INGEST_UNAUTHORIZED_MESSAGE =
  "Bridge authentication failed." as const;

export const PI_INGEST_INVALID_REQUEST_MESSAGE =
  "Request payload was rejected." as const;

export const PI_INGEST_INTERNAL_FAILURE_MESSAGE =
  "Request could not be processed." as const;

export const PI_INGEST_AUTH_OK_PIPELINE_NOT_IMPLEMENTED_MESSAGE =
  "Bridge authentication succeeded, but ingest pipeline is not enabled yet." as const;

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

export interface UnauthorizedResponseBody {
  ok: false;
  error: typeof PI_INGEST_UNAUTHORIZED_ERROR;
  message: string;
}

export interface InvalidRequestResponseBody {
  ok: false;
  error: typeof PI_INGEST_INVALID_REQUEST_ERROR;
  message: string;
}

export interface InternalFailureResponseBody {
  ok: false;
  error: typeof PI_INGEST_INTERNAL_FAILURE_ERROR;
  message: string;
}

export interface AuthOkPipelineNotImplementedResponseBody {
  ok: false;
  error: typeof PI_INGEST_AUTH_OK_PIPELINE_NOT_IMPLEMENTED_ERROR;
  message: string;
}

export type PiIngestFailClosedResponseBody =
  | MethodNotAllowedResponseBody
  | SecretResolverNotImplementedResponseBody
  | UnauthorizedResponseBody
  | InvalidRequestResponseBody
  | InternalFailureResponseBody
  | AuthOkPipelineNotImplementedResponseBody;

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

export function buildUnauthorizedResponseBody(): UnauthorizedResponseBody {
  return {
    ok: false,
    error: PI_INGEST_UNAUTHORIZED_ERROR,
    message: PI_INGEST_UNAUTHORIZED_MESSAGE,
  };
}

export function buildInvalidRequestResponseBody(): InvalidRequestResponseBody {
  return {
    ok: false,
    error: PI_INGEST_INVALID_REQUEST_ERROR,
    message: PI_INGEST_INVALID_REQUEST_MESSAGE,
  };
}

export function buildInternalFailureResponseBody(): InternalFailureResponseBody {
  return {
    ok: false,
    error: PI_INGEST_INTERNAL_FAILURE_ERROR,
    message: PI_INGEST_INTERNAL_FAILURE_MESSAGE,
  };
}

export function buildAuthOkPipelineNotImplementedResponseBody(): AuthOkPipelineNotImplementedResponseBody {
  return {
    ok: false,
    error: PI_INGEST_AUTH_OK_PIPELINE_NOT_IMPLEMENTED_ERROR,
    message: PI_INGEST_AUTH_OK_PIPELINE_NOT_IMPLEMENTED_MESSAGE,
  };
}
