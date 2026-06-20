// Edge HTTP wrapper helper for EcoWitt real-ingest validation only.
// Uses the Phase 1.6 _shared endpoint handler as the source of behavior.
// Do not add persistence, Supabase writes, network calls, alerts, Action Queue writes,
// AI calls, automation, or device control here.

import { handleEcoWittRealIngestRequest } from "./ecowittRealIngestEndpoint.ts";

export const ECOWITT_REAL_INGEST_HTTP_NOTE =
  "Phase 1.7 validates candidates only. It does not store sensor readings or enable live data.";

export const ECOWITT_REAL_INGEST_ALLOWED_METHODS = "POST, OPTIONS";

export const ECOWITT_REAL_INGEST_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": ECOWITT_REAL_INGEST_ALLOWED_METHODS,
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

type EcoWittHttpStatus =
  | "accepted_candidate"
  | "rejected_candidate"
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "not_configured";

export interface EcoWittRealIngestHttpResponseBody {
  ok: boolean;
  accepted: boolean;
  can_persist_later: boolean;
  status: EcoWittHttpStatus;
  http_status: number;
  blocked_reasons: string[];
  warnings: string[];
  dedupe_key: string | null;
  captured_at: string | null;
  source: string;
  redacted_payload_preview?: unknown;
  note: string;
}

export interface HandleEcoWittRealIngestHttpRequestInput {
  request: Request;
  expectedToken: string | null | undefined;
  reference_time: string;
  freshness_window_ms: number;
}

function jsonHeaders(): HeadersInit {
  return {
    ...ECOWITT_REAL_INGEST_CORS_HEADERS,
    "content-type": "application/json; charset=utf-8",
    vary: "origin",
  };
}

export function createEcoWittRealIngestJsonResponse(
  body: EcoWittRealIngestHttpResponseBody,
): Response {
  return new Response(JSON.stringify(body), {
    status: body.http_status,
    headers: jsonHeaders(),
  });
}

function badRequestResponse(reason: string): Response {
  return createEcoWittRealIngestJsonResponse({
    ok: false,
    accepted: false,
    can_persist_later: false,
    status: "bad_request",
    http_status: reason === "method_not_allowed" ? 405 : 400,
    blocked_reasons: [reason],
    warnings: [],
    dedupe_key: null,
    captured_at: null,
    source: "unknown",
    note: ECOWITT_REAL_INGEST_HTTP_NOTE,
  });
}

async function parseJsonBody(request: Request): Promise<
  | {
      ok: true;
      payload: unknown;
    }
  | {
      ok: false;
      reason: "missing_body" | "malformed_json";
    }
> {
  const raw = await request.text();
  if (raw.trim().length === 0) {
    return { ok: false, reason: "missing_body" };
  }

  try {
    return { ok: true, payload: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: "malformed_json" };
  }
}

export async function handleEcoWittRealIngestHttpRequest({
  request,
  expectedToken,
  reference_time,
  freshness_window_ms,
}: HandleEcoWittRealIngestHttpRequestInput): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...ECOWITT_REAL_INGEST_CORS_HEADERS,
        vary: "origin",
      },
    });
  }

  if (request.method !== "POST") {
    return badRequestResponse("method_not_allowed");
  }

  const parsed = await parseJsonBody(request);
  if (parsed.ok === false) {
    return badRequestResponse(parsed.reason);
  }

  const endpointResult = handleEcoWittRealIngestRequest({
    authorizationHeader: request.headers.get("authorization"),
    expectedToken: expectedToken ?? null,
    payload: parsed.payload,
    reference_time,
    freshness_window_ms,
  }) as EcoWittRealIngestHttpResponseBody;

  const responseBody: EcoWittRealIngestHttpResponseBody = {
    ...endpointResult,
    note: ECOWITT_REAL_INGEST_HTTP_NOTE,
  };

  return createEcoWittRealIngestJsonResponse(responseBody);
}
