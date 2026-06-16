/**
 * EcoWitt Real Ingest — Phase 1 endpoint handler (pure, no persistence).
 *
 * This module is the deterministic core of the Phase 1 endpoint shell. It
 * accepts an already-parsed request shape (auth header, payload, reference
 * time, expected token, freshness window), authenticates the caller,
 * invokes the Phase 0 validator, and returns a typed accept/reject
 * response. It never writes to any database, never makes network calls,
 * never enables a "live" dashboard label, and never persists sensor
 * readings.
 *
 * The thin runtime wrapper (e.g. an Edge Function) is responsible only
 * for reading `Deno.env`, parsing the HTTP body, and translating this
 * result to an HTTP response. All authorization, validation, redaction,
 * and dedupe-key derivation happens here so it can be unit-tested
 * without a network stack.
 */

import {
  validateEcoWittBridgeAuthorization,
  type EcoWittRealIngestAuthResult,
} from "./ecowittRealIngestAuth";
import { validateEcoWittRealIngestCandidate } from "./ecowittRealIngestValidator";
import { redactEcoWittRawPayload } from "./ecowittRealIngestRedaction";

export type EcoWittRealIngestEndpointStatus =
  | "accepted_candidate"
  | "rejected_candidate"
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "not_configured";

export interface EcoWittRealIngestEndpointResponse {
  ok: boolean;
  accepted: boolean;
  can_persist_later: boolean;
  status: EcoWittRealIngestEndpointStatus;
  http_status: 202 | 400 | 401 | 403 | 422 | 503;
  blocked_reasons: string[];
  warnings: string[];
  dedupe_key: string | null;
  captured_at: string | null;
  source: string;
  redacted_payload_preview: unknown;
  note: string;
}

export interface HandleEcoWittRealIngestRequestInput {
  authorizationHeader: string | null | undefined;
  expectedToken: string | null | undefined;
  /**
   * The already-parsed JSON payload, or a `{ parse_error: true }` sentinel
   * if the runtime wrapper could not parse it. Passing `undefined` is
   * also treated as a malformed body.
   */
  payload: unknown;
  /** ISO timestamp injected by the wrapper (server clock). */
  reference_time: string;
  /** Max age (ms) of `captured_at` relative to `reference_time`. */
  freshness_window_ms: number;
}

const PHASE_1_NOTE =
  "Phase 1 endpoint validates candidates only. It does not store sensor readings or enable live data.";

function envelope(
  status: EcoWittRealIngestEndpointStatus,
  http_status: EcoWittRealIngestEndpointResponse["http_status"],
  partial: Partial<EcoWittRealIngestEndpointResponse>,
): EcoWittRealIngestEndpointResponse {
  return {
    ok: status === "accepted_candidate",
    accepted: status === "accepted_candidate",
    can_persist_later: status === "accepted_candidate",
    status,
    http_status,
    blocked_reasons: partial.blocked_reasons ?? [],
    warnings: partial.warnings ?? [],
    dedupe_key: partial.dedupe_key ?? null,
    captured_at: partial.captured_at ?? null,
    source: partial.source ?? "unknown",
    redacted_payload_preview: partial.redacted_payload_preview ?? null,
    note: PHASE_1_NOTE,
  };
}

function authToEndpoint(
  auth: EcoWittRealIngestAuthResult,
): EcoWittRealIngestEndpointResponse | null {
  switch (auth.status) {
    case "authorized":
      return null;
    case "unauthorized":
      return envelope("unauthorized", 401, {
        blocked_reasons: [`auth:${auth.reason}`],
      });
    case "forbidden":
      return envelope("forbidden", 403, {
        blocked_reasons: [`auth:${auth.reason}`],
      });
    case "not_configured":
      return envelope("not_configured", 503, {
        blocked_reasons: [`auth:${auth.reason}`],
      });
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function handleEcoWittRealIngestRequest(
  input: HandleEcoWittRealIngestRequestInput,
): EcoWittRealIngestEndpointResponse {
  // 1) Auth boundary
  const auth = validateEcoWittBridgeAuthorization(
    input.authorizationHeader,
    input.expectedToken,
  );
  const authResp = authToEndpoint(auth);
  if (authResp) return authResp;

  // 2) Body shape — reject malformed bodies before touching the validator
  if (input.payload === undefined || input.payload === null) {
    return envelope("bad_request", 400, {
      blocked_reasons: ["bad_request:missing_body"],
    });
  }
  if (
    isPlainObject(input.payload) &&
    (input.payload as { parse_error?: unknown }).parse_error === true
  ) {
    return envelope("bad_request", 400, {
      blocked_reasons: ["bad_request:malformed_json"],
    });
  }
  if (!isPlainObject(input.payload)) {
    return envelope("bad_request", 400, {
      blocked_reasons: ["bad_request:not_an_object"],
    });
  }

  // 3) Validate via Phase 0 pure validator with injected reference_time.
  const result = validateEcoWittRealIngestCandidate(input.payload, {
    reference_time: input.reference_time,
    freshness_window_ms: input.freshness_window_ms,
  });

  // 4) Defense in depth: redact again here in case the validator's
  // redacted_payload is null (e.g. structural rejection before redaction).
  const redactedPreview =
    result.redacted_payload ??
    redactEcoWittRawPayload(
      (input.payload as { raw_payload?: unknown }).raw_payload ?? null,
    );

  if (!result.accepted) {
    return envelope("rejected_candidate", 422, {
      blocked_reasons: result.blocked_reasons,
      warnings: result.warnings,
      dedupe_key: result.dedupe_key,
      captured_at: result.captured_at,
      source: result.source,
      redacted_payload_preview: redactedPreview,
    });
  }

  return envelope("accepted_candidate", 202, {
    blocked_reasons: [],
    warnings: result.warnings,
    dedupe_key: result.dedupe_key,
    captured_at: result.captured_at,
    source: result.source,
    redacted_payload_preview: redactedPreview,
  });
}
