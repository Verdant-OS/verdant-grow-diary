/**
 * Pure classifier for the Sensors → "Send test EcoWitt payload" result.
 *
 * Maps the HTTP status + parsed body (or network error) to a friendly
 * category and a one-line operator hint. Never rewrites a failure as a
 * success — a non-2xx is always a problem category.
 */

export type SensorIngestTestCategory =
  | "accepted"
  | "accepted_with_rejections"
  | "auth_problem"
  | "tent_token_mismatch"
  | "payload_problem"
  | "wrong_project_or_function_missing"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | "unknown";

export interface SensorIngestTestClassification {
  category: SensorIngestTestCategory;
  headline: string;
  detail: string;
  isSuccess: boolean;
  /**
   * True when the browser received a real HTTP status (preflight + CORS
   * worked); false when fetch threw / status was 0 (request blocked before a
   * readable response). Lets diagnostic UIs distinguish "CORS broken" from
   * "CORS fine, server rejected the POST".
   */
  corsWorking: boolean;
}

export interface ClassifyInput {
  status: number;
  body: unknown;
  /** True when fetch threw before a response was received. */
  networkError?: boolean;
}

function pickString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickNumber(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pickArrayLen(obj: unknown, key: string): number {
  if (!obj || typeof obj !== "object") return 0;
  const v = (obj as Record<string, unknown>)[key];
  return Array.isArray(v) ? v.length : 0;
}

/**
 * Map sanitized webhook error codes (returned by sensor-ingest-webhook) to
 * grower-safe troubleshooting copy. Used by the diagnostic UI so we never
 * echo raw token values, Authorization headers, or PG error text.
 */
export const SANITIZED_WEBHOOK_ERROR_COPY: Record<string, string> = {
  unauthorized:
    "Bridge token or Authorization header was rejected. Recheck the token value in the local bridge .env; do not paste it into the browser.",
  server_misconfigured:
    "The ingest function is missing required server-side configuration.",
  invalid_json: "The request body was not valid JSON.",
  invalid_payload: "The payload shape failed validation.",
  forbidden_tent: "The token is not authorized for that tent.",
  tent_lookup_failed: "The function could not verify the tent context.",
  insert_failed:
    "The function reached storage but could not save the reading.",
  method_not_allowed:
    "Use POST for ingest and OPTIONS for browser preflight.",
  internal_error:
    "The function failed unexpectedly; check sanitized server logs.",
  auth_lookup_failed:
    "The function could not verify the bridge token. Retry shortly.",
};

// Strip strings that look like Bearer headers, JWTs, vbt_* tokens, or
// service-role keys before rendering. Defense-in-depth: the server already
// sanitizes its responses, but the diagnostic UI must not become a leak
// surface if a malicious response slips through.
function sanitizeReasonForDisplay(raw: string): string {
  if (!raw) return raw;
  let s = raw.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  if (/^vbt_/i.test(s) && s.length >= 12) return "[redacted]";
  if (/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(s)) return "[redacted]";
  if (/^sb_[A-Za-z0-9_-]{16,}$/.test(s)) return "[redacted]";
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(s)) s = s.replace(/SUPABASE_SERVICE_ROLE_KEY/g, "[redacted]");
  return s.slice(0, 200);
}


export function classifySensorIngestTestResult(
  input: ClassifyInput,
): SensorIngestTestClassification {
  if (input.networkError) {
    return {
      category: "network_error",
      headline: "Network / CORS preflight error",
      detail:
        "Browser status 0 — the request was blocked before a readable HTTP response was available. " +
        "OPTIONS preflight likely failed before POST reached the function. " +
        "Check Edge Function OPTIONS headers, ad-block, browser extensions, or network reachability.",
      isSuccess: false,
      corsWorking: false,
    };
  }


  const { status, body } = input;
  const reason = pickString(body, "error") ?? pickString(body, "reason");

  if (status >= 200 && status < 300) {
    const inserted = pickNumber(body, "inserted") ?? 0;
    const rejected = pickArrayLen(body, "rejected");
    if (rejected > 0) {
      return {
        category: "accepted_with_rejections",
        headline: `HTTP ${status} — accepted with ${rejected} rejection${rejected === 1 ? "" : "s"}`,
        detail: `Inserted ${inserted}. Some metrics were rejected — see rejected[] below.`,
        isSuccess: true,
        corsWorking: true,
      };
    }
    return {
      category: "accepted",
      headline: `HTTP ${status} — accepted`,
      detail: `Inserted ${inserted} reading${inserted === 1 ? "" : "s"}. Auth: ${pickString(body, "auth") ?? "ok"}.`,
      isSuccess: true,
      corsWorking: true,
    };
  }

  if (status === 401) {
    return {
      category: "auth_problem",
      headline: "HTTP 401 — auth / token problem",
      detail: reason
        ? `Token rejected (${reason}). Mint a fresh tent-scoped bridge token and retry.`
        : "Bridge token missing, revoked, or expired. Mint a new one and retry.",
      isSuccess: false,
      corsWorking: true,
    };
  }

  if (status === 403) {
    return {
      category: "tent_token_mismatch",
      headline: "HTTP 403 — tent / token mismatch",
      detail:
        "Token is valid but not scoped to this tent. Mint a token from this tent's panel.",
      isSuccess: false,
      corsWorking: true,
    };
  }

  if (status === 400) {
    return {
      category: "payload_problem",
      headline: "HTTP 400 — payload problem",
      detail: reason
        ? `Server rejected payload: ${reason}.`
        : "Server rejected payload. Check source, captured_at, and metric names.",
      isSuccess: false,
      corsWorking: true,
    };
  }

  if (status === 404) {
    return {
      category: "wrong_project_or_function_missing",
      headline: "HTTP 404 — function missing or wrong project URL",
      detail:
        "sensor-ingest-webhook is not deployed at this URL. Confirm the app's Supabase project matches the ingest endpoint.",
      isSuccess: false,
      corsWorking: true,
    };
  }

  if (status === 429) {
    return {
      category: "rate_limited",
      headline: "HTTP 429 — rate limited",
      detail: "Too many requests. Wait a moment and retry.",
      isSuccess: false,
      corsWorking: true,
    };
  }

  if (status >= 500) {
    return {
      category: "server_error",
      headline: `HTTP ${status} — server error`,
      detail:
        "Ingest function returned a server error. Check Edge Function logs.",
      isSuccess: false,
      corsWorking: true,
    };
  }

  return {
    category: "unknown",
    headline: status > 0 ? `HTTP ${status}` : "Unknown response",
    detail: reason ?? "Unrecognized response from the ingest endpoint.",
    isSuccess: false,
    corsWorking: true,
  };
}

/**
 * Build the "Environment match" checklist for the Sensors diagnostics
 * panel. Pure: no DOM, no I/O.
 */
export interface EnvMatchInput {
  supabaseUrl: string | null | undefined;
  ingestUrl: string | null | undefined;
  tentId: string | null | undefined;
  hasActiveToken: boolean;
  tokenTentScoped: boolean;
  lastIngestAtIso: string | null | undefined;
}

export interface EnvMatchItem {
  key:
    | "supabase_url"
    | "ingest_url"
    | "tent_selected"
    | "token_present"
    | "token_tent_scoped"
    | "ingest_seen";
  ok: boolean;
  label: string;
  hint?: string;
}

export function buildEnvMatchChecklist(input: EnvMatchInput): EnvMatchItem[] {
  const items: EnvMatchItem[] = [];
  const supabaseOk = !!input.supabaseUrl && /^https?:\/\//.test(input.supabaseUrl);
  items.push({
    key: "supabase_url",
    ok: supabaseOk,
    label: supabaseOk ? `App Supabase URL: ${input.supabaseUrl}` : "App Supabase URL missing",
    hint: supabaseOk ? undefined : "VITE_SUPABASE_URL is not configured.",
  });
  const ingestOk =
    !!input.ingestUrl &&
    !!input.supabaseUrl &&
    input.ingestUrl.startsWith(input.supabaseUrl);
  items.push({
    key: "ingest_url",
    ok: ingestOk,
    label: ingestOk
      ? `Ingest endpoint matches project`
      : "Ingest endpoint does not match project URL",
    hint: ingestOk
      ? undefined
      : "Endpoint origin must equal VITE_SUPABASE_URL.",
  });
  items.push({
    key: "tent_selected",
    ok: !!input.tentId,
    label: input.tentId ? `Tent UUID: ${input.tentId}` : "No tent selected",
    hint: input.tentId ? undefined : "Pick a tent on the Sensors page.",
  });
  items.push({
    key: "token_present",
    ok: input.hasActiveToken,
    label: input.hasActiveToken
      ? "Active bridge token exists for this tent"
      : "No active bridge token for this tent",
    hint: input.hasActiveToken ? undefined : "Mint a bridge token above.",
  });
  items.push({
    key: "token_tent_scoped",
    ok: input.hasActiveToken && input.tokenTentScoped,
    label:
      input.hasActiveToken && input.tokenTentScoped
        ? "Token is scoped to selected tent"
        : "Token is not scoped to selected tent",
    hint:
      input.hasActiveToken && input.tokenTentScoped
        ? undefined
        : "Mint the token from this tent's panel to ensure scope match.",
  });
  items.push({
    key: "ingest_seen",
    ok: !!input.lastIngestAtIso,
    label: input.lastIngestAtIso
      ? `Last ingest seen at ${input.lastIngestAtIso}`
      : "No ingest seen yet for this token/tent",
    hint: input.lastIngestAtIso
      ? undefined
      : "Send a test payload or start the Windows listener.",
  });
  return items;
}
