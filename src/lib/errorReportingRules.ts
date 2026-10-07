/**
 * Production error-reporting rules. Pure, deterministic, null-safe — no I/O,
 * no SDK import. The side-effecting wiring lives in `errorReporter.ts`.
 *
 * Why this exists: on Lovable hosting, client errors reached the editor via
 * `window.__lovableEvents`. On Cloudflare that global does not exist, so every
 * uncaught client error went nowhere. This module decides WHEN a reporter may
 * run and WHAT it is allowed to send; the transport (Sentry browser SDK) is
 * loaded lazily and only when `resolveErrorReportingConfig` says `enabled`.
 *
 * Privacy posture (deliberate, do not loosen without an owner decision):
 * - No user id, email, IP, or session identifiers are attached. Sentry's
 *   `dataCollection` has every category off.
 * - URLs are reduced to origin + pathname. Query strings and fragments are
 *   dropped because auth flows carry tokens there.
 * - Free text (messages, stacks, breadcrumbs) is scrubbed for token-like
 *   values and e-mail addresses before it leaves the browser.
 * - No session replay, no performance tracing, no console capture.
 */

export const SENTRY_INGEST_ORIGINS: ReadonlyArray<string> = [
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
  "https://*.ingest.de.sentry.io",
];

/** Hosts where the reporter must stay off: local dev, Lovable preview, tests. */
export const LOCAL_HOSTNAMES: ReadonlyArray<string> = ["localhost", "127.0.0.1", "[::1]"];

export interface ErrorReportingEnvironment {
  /** `import.meta.env.VITE_SENTRY_DSN` or undefined. */
  readonly dsn?: string | null;
  /** `window.location.hostname` or undefined on the server. */
  readonly hostname?: string | null;
  /** Build identifier from `src/generated/buildInfo.ts`. */
  readonly release?: string | null;
  /** `import.meta.env.MODE` ("production" | "development" | "test"). */
  readonly mode?: string | null;
}

export type ErrorReportingDecision =
  | { readonly enabled: false; readonly reason: ErrorReportingDisabledReason }
  | {
      readonly enabled: true;
      readonly dsn: string;
      readonly environment: "production" | "preview";
      readonly release: string | undefined;
    };

export type ErrorReportingDisabledReason =
  "no_dsn" | "invalid_dsn" | "server" | "local_host" | "lovable_preview" | "not_production_build";

const DSN_PATTERN = /^https:\/\/[0-9a-f]{8,}@[a-z0-9.-]+\.sentry\.io\/\d+$/i;

/** Accepts only a well-formed hosted-Sentry DSN. The public key is not a secret, but a malformed value must never make the SDK retry against an arbitrary host. */
export function isValidSentryDsn(value: unknown): value is string {
  return typeof value === "string" && DSN_PATTERN.test(value.trim());
}

export function resolveErrorReportingConfig(
  env: ErrorReportingEnvironment | null | undefined,
): ErrorReportingDecision {
  const dsn = env?.dsn?.trim() ?? "";
  if (!dsn) return { enabled: false, reason: "no_dsn" };
  if (!isValidSentryDsn(dsn)) return { enabled: false, reason: "invalid_dsn" };
  const hostname = env?.hostname?.trim().toLowerCase() ?? "";
  if (!hostname) return { enabled: false, reason: "server" };
  if (LOCAL_HOSTNAMES.includes(hostname) || hostname.endsWith(".localhost")) {
    return { enabled: false, reason: "local_host" };
  }
  if (hostname.endsWith(".lovable.app") || hostname.endsWith(".lovableproject.com")) {
    return { enabled: false, reason: "lovable_preview" };
  }
  if ((env?.mode ?? "production") !== "production") {
    return { enabled: false, reason: "not_production_build" };
  }
  const environment =
    hostname === "verdantgrowdiary.com" || hostname === "www.verdantgrowdiary.com"
      ? "production"
      : "preview";
  const release = env?.release?.trim() || undefined;
  return { enabled: true, dsn, environment, release };
}

// ── Scrubbing ────────────────────────────────────────────────────────────────

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** Bearer / JWT / API-key shaped values. JWTs are three base64url segments. */
const JWT_PATTERN = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_PATTERN = /\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;
/** `key=value` pairs whose key looks like a credential. Keeps the key, drops the value. */
const SENSITIVE_PARAM_PATTERN =
  /\b(access_token|refresh_token|id_token|token|code|apikey|api_key|key|secret|password|authorization|session|sb-[a-z0-9-]+-auth-token)=([^&\s"'#]+)/gi;

/** The same credential keys in JSON form (`"refresh_token":"…"`), as a serialised session would carry them. Keeps the key, drops the value. */
const SENSITIVE_JSON_PATTERN =
  /("(?:access_token|refresh_token|id_token|provider_token|provider_refresh_token|token|code|apikey|api_key|key|secret|password|authorization|session)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi;

export const REDACTED = "[redacted]";

/** Removes e-mail addresses, JWT/bearer tokens and credential-looking query values from free text. Idempotent. */
export function scrubText(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : safeString(value);
  return text
    .replace(SENSITIVE_JSON_PATTERN, (_m, prefix: string) => `${prefix}"${REDACTED}"`)
    .replace(SENSITIVE_PARAM_PATTERN, (_m, key: string) => `${key}=${REDACTED}`)
    .replace(BEARER_PATTERN, (_m, prefix: string) => `${prefix}${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED);
}

/** Reduces a URL to origin + pathname. Relative or unparsable input keeps only the part before `?`/`#`. */
export function scrubUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? "";
  }
}

function safeString(value: unknown): string {
  try {
    return typeof value === "object" ? (JSON.stringify(value) ?? String(value)) : String(value);
  } catch {
    return String(value);
  }
}

// ── Sentry event shaping (SDK-agnostic shape, matches Sentry's `Event`) ─────

export interface ReportableRequest {
  url?: string;
  headers?: Record<string, string>;
  cookies?: unknown;
  data?: unknown;
  query_string?: unknown;
  env?: unknown;
}

export interface ReportableException {
  type?: string;
  value?: string;
  mechanism?: { data?: unknown };
  stacktrace?: {
    frames?: Array<{ filename?: string; abs_path?: string; vars?: unknown }>;
  };
}

export interface ReportableBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface ReportableEvent {
  message?: string;
  logentry?: { message?: string; formatted?: string; params?: unknown };
  transaction?: string;
  contexts?: Record<string, unknown>;
  request?: ReportableRequest;
  user?: unknown;
  server_name?: string;
  exception?: { values?: ReportableException[] };
  breadcrumbs?: ReportableBreadcrumb[];
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
}

/** Breadcrumb categories that may carry page content or credentials; dropped outright. */
export const DROPPED_BREADCRUMB_CATEGORIES: ReadonlyArray<string> = ["console", "ui.input"];

/** Device/runtime contexts that carry no identity. Every other context (e.g. `response`, `state`, custom) is dropped. */
export const ALLOWED_EVENT_CONTEXTS: ReadonlyArray<string> = ["browser", "os", "device", "runtime"];

/**
 * Scrubs an outgoing event in place-safe fashion (returns a new object). Returns
 * null for null/undefined so it can be used directly as Sentry's `beforeSend`.
 */
export function scrubEvent<T extends ReportableEvent | null | undefined>(event: T): T {
  if (!event) return event;
  const next: ReportableEvent = { ...event };
  delete next.user;
  delete next.server_name;
  if (typeof next.message === "string") next.message = scrubText(next.message);
  if (next.logentry) {
    const logentry: NonNullable<ReportableEvent["logentry"]> = {};
    if (typeof next.logentry.message === "string")
      logentry.message = scrubText(next.logentry.message);
    if (typeof next.logentry.formatted === "string")
      logentry.formatted = scrubText(next.logentry.formatted);
    next.logentry = logentry;
  }
  if (typeof next.transaction === "string") next.transaction = scrubUrl(next.transaction);
  if (next.contexts) {
    const contexts: Record<string, unknown> = {};
    for (const name of ALLOWED_EVENT_CONTEXTS) {
      if (next.contexts[name] !== undefined) contexts[name] = next.contexts[name];
    }
    next.contexts = contexts;
  }
  if (next.request) {
    const request: ReportableRequest = {};
    if (typeof next.request.url === "string") request.url = scrubUrl(next.request.url);
    next.request = request;
  }
  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map((ex) => ({
        ...ex,
        ...(typeof ex.type === "string" && { type: scrubText(ex.type) }),
        ...(typeof ex.value === "string" && { value: scrubText(ex.value) }),
        ...(ex.mechanism && { mechanism: withoutKey(ex.mechanism, "data") }),
        ...(ex.stacktrace?.frames && {
          stacktrace: {
            ...ex.stacktrace,
            frames: ex.stacktrace.frames.map((frame) => ({
              ...withoutKey(frame, "vars"),
              ...(typeof frame.filename === "string" && { filename: scrubUrl(frame.filename) }),
              ...(typeof frame.abs_path === "string" && { abs_path: scrubUrl(frame.abs_path) }),
            })),
          },
        }),
      })),
    };
  }
  if (Array.isArray(next.breadcrumbs)) {
    next.breadcrumbs = next.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is ReportableBreadcrumb => crumb !== null);
  }
  if (next.extra) next.extra = scrubRecord(next.extra);
  if (next.tags) next.tags = scrubRecord(next.tags);
  return next as T;
}

/** Returns null to drop the breadcrumb; otherwise a scrubbed copy. Usable as `beforeBreadcrumb`. */
export function scrubBreadcrumb<T extends ReportableBreadcrumb | null | undefined>(
  crumb: T,
): T | null {
  if (!crumb) return null;
  if (crumb.category && DROPPED_BREADCRUMB_CATEGORIES.includes(crumb.category)) return null;
  const next: ReportableBreadcrumb = { ...crumb };
  if (typeof next.message === "string") next.message = scrubText(next.message);
  if (next.data) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next.data)) {
      if (key === "url" || key === "from" || key === "to") {
        data[key] = scrubUrl(value);
      } else if (typeof value === "string") {
        data[key] = scrubText(value);
      } else if (typeof value === "number" || typeof value === "boolean") {
        data[key] = value;
      }
      // Objects (request/response bodies, headers) are dropped.
    }
    next.data = data;
  }
  return next as T;
}

/** Keeps strings (scrubbed), finite numbers and booleans. Objects and arrays are dropped: they can carry rows, bodies or session state. */
function scrubRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") out[key] = scrubText(value);
    else if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))
      out[key] = value;
  }
  return out;
}

function withoutKey<T extends object>(value: T, key: string): T {
  const copy = { ...value } as Record<string, unknown>;
  delete copy[key];
  return copy as T;
}

// ── Manual capture context ───────────────────────────────────────────────────

export interface ManualReportContext {
  readonly source: "react_error_boundary" | "route_error_component" | "manual";
  readonly route?: string | null;
  readonly handled?: boolean;
}

/**
 * Normalises whatever a boundary caught into something Sentry can group on.
 * Loaders and server fns commonly throw a raw `Response`; `String(it)` is the
 * opaque "[object Response]", so surface the status and path instead.
 */
export function normalizeCaughtError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof Response !== "undefined" && error instanceof Response) {
    const where = error.url ? ` at ${scrubUrl(error.url)}` : "";
    return new Error(`Response ${error.status}${where}`);
  }
  return new Error(scrubText(error) || "Unknown error");
}

/** Deterministic tag/extra payload attached to a manual capture. */
export function buildManualReportContext(context: ManualReportContext | null | undefined): {
  tags: Record<string, string>;
  extra: Record<string, string>;
} {
  const source = context?.source ?? "manual";
  const handled = context?.handled === true ? "true" : "false";
  const route = typeof context?.route === "string" ? scrubUrl(context.route) : "";
  return {
    tags: { source, handled },
    extra: route ? { route } : {},
  };
}
