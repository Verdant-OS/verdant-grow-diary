// Edge mirror of src/lib EcoWitt real-ingest logic.
// Keep behavior in parity with src/lib via ecowitt-real-ingest-edge-parity tests.
// Do not add persistence, Supabase writes, network calls, alerts, Action Queue writes, AI calls, automation, or device control here.

import {
  validateEcoWittBridgeAuthorization,
  type EcoWittRealIngestAuthResult,
} from "./ecowittRealIngestAuth.ts";
import { validateEcoWittRealIngestCandidate } from "./ecowittRealIngestValidator.ts";
import { redactEcoWittRawPayload } from "./ecowittRealIngestRedaction.ts";

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
  payload: unknown;
  reference_time: string;
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
  const auth = validateEcoWittBridgeAuthorization(
    input.authorizationHeader,
    input.expectedToken,
  );
  const authResp = authToEndpoint(auth);
  if (authResp) return authResp;

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

  const result = validateEcoWittRealIngestCandidate(input.payload, {
    reference_time: input.reference_time,
    freshness_window_ms: input.freshness_window_ms,
  });

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
