/**
 * Production error-reporting rules. Pure, deterministic, null-safe — no I/O,
 * no SDK import. The side-effecting wiring lives in `errorReporter.ts`.
 *
 * The reporter may run only with a DSN whose host is one of the Sentry ingest
 * origins in the report-only CSP, an exact production build mode, and one of
 * the production hostnames. A missing or unknown mode stays off. Outgoing
 * events drop user fields, IP, request bodies, contexts, transaction, and
 * breadcrumbs that carry content. Stack frames keep only filename, abs_path,
 * lineno, colno, and in_app. Tags are rebuilt from `manualReportTags`.
 * Free-text messages are replaced so grower text does not leave. Query strings
 * never leave. A UUID path segment, a path segment of 24 or more
 * characters, or a path segment that contains `@` or `%`, becomes `:id`.
 * `vbscript:` and the other labeled non-http
 * schemes keep the scheme and drop the payload (`vbscript:[redacted]`).
 */

import { KNOWN_THIRD_PARTY_ORIGINS } from "@/lib/securityHeadersRules";

export const PRODUCTION_HOSTNAMES: ReadonlyArray<string> = [
  "verdantgrowdiary.com",
  "www.verdantgrowdiary.com",
];

export const LOCAL_HOSTNAMES: ReadonlyArray<string> = ["localhost", "127.0.0.1", "[::1]"];

/**
 * v11 collects these categories when the field is omitted, and the typed init
 * options no longer include `sendDefaultPii`. The reporter still passes
 * `sendDefaultPii: false`. This object is what actually keeps each category off.
 */
export const ERROR_REPORTING_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [] as Array<
    "incomingRequest" | "outgoingRequest" | "incomingResponse" | "outgoingResponse"
  >,
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
} as const;

/** Passed to `Sentry.init` even though v11 types omit the field. */
export const SEND_DEFAULT_PII = false;

/** Tracing sample rate. Combined with filtering `BrowserTracing`, no traces leave. */
export const TRACES_SAMPLE_RATE = 0;

/**
 * Default or auto-added integrations that must not run. `BrowserSession`
 * envelopes bypass `beforeSend`. Replay, tracing and profiling stay off.
 * `GlobalHandlers` is not in this list.
 */
export const EXCLUDED_DEFAULT_INTEGRATIONS: ReadonlyArray<string> = [
  "BrowserSession",
  "BrowserTracing",
  "BrowserProfiling",
  "Replay",
  "ReplayCanvas",
];

export const REDACTED = "[redacted]";

/**
 * Schemes whose payload sits after the colon. A match returns
 * `scheme:[redacted]` so the payload is gone and the scheme is still visible.
 * Any other non-http(s) scheme returns `[redacted]`.
 */
export const LABELED_NON_HTTP_SCHEMES: ReadonlyArray<string> = [
  "data:",
  "javascript:",
  "vbscript:",
  "blob:",
  "chrome-extension:",
  "moz-extension:",
  "file:",
  "about:",
];

const DSN_SHAPE = /^https:\/\/[0-9a-f]{8,}@([a-z0-9.-]+)\/\d+$/i;

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ECMAScript error classes. Any other exception type is omitted. */
const STANDARD_JS_ERROR_TYPES: ReadonlySet<string> = new Set([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

/** SDK mechanism labels. Free-text mechanism types are omitted. `data` never leaves. */
const SAFE_MECHANISM_TYPE = /^[a-z0-9._-]{1,64}$/i;

export interface ErrorReportingEnvironment {
  readonly dsn?: string | null;
  readonly hostname?: string | null;
  readonly release?: string | null;
  readonly mode?: string | null;
}

export type ErrorReportingDisabledReason =
  | "no_dsn"
  | "invalid_dsn"
  | "server"
  | "local_host"
  | "lovable_preview"
  | "non_production_host"
  | "not_production_build";

export type ErrorReportingDecision =
  | { readonly enabled: false; readonly reason: ErrorReportingDisabledReason }
  | {
      readonly enabled: true;
      readonly dsn: string;
      readonly environment: "production";
      readonly release: string | undefined;
    };

export interface ManualReportContext {
  readonly source?: string;
  readonly route?: string;
  readonly handled?: boolean;
}

/**
 * A CSP ingest origin is `https://*.<suffix>`. The DSN host must be exactly
 * one label plus that suffix, so the allowlist cannot drift from connect-src.
 */
function isCspSentryIngestHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return KNOWN_THIRD_PARTY_ORIGINS.sentryIngest.some((origin) => {
    if (!origin.startsWith("https://*.")) return false;
    const suffix = origin.slice("https://*.".length).toLowerCase();
    if (!host.endsWith(`.${suffix}`)) return false;
    const label = host.slice(0, host.length - suffix.length - 1);
    return /^[a-z0-9-]+$/.test(label);
  });
}

export function isValidSentryDsn(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DSN_SHAPE.exec(value.trim());
  const host = match?.[1];
  return typeof host === "string" && isCspSentryIngestHost(host);
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
  if (env?.mode !== "production") {
    return { enabled: false, reason: "not_production_build" };
  }
  if (!PRODUCTION_HOSTNAMES.includes(hostname)) {
    return { enabled: false, reason: "non_production_host" };
  }
  const release = env?.release?.trim() || undefined;
  return { enabled: true, dsn, environment: "production", release };
}

export function withoutExcludedIntegrations<T extends { name: string }>(
  defaults: readonly T[],
): T[] {
  return defaults.filter(
    (integration) => !EXCLUDED_DEFAULT_INTEGRATIONS.includes(integration.name),
  );
}

function redactPathSegment(segment: string): string {
  if (segment.length === 0) return segment;
  let token: string;
  try {
    token = decodeURIComponent(segment);
  } catch {
    token = segment;
  }
  if (
    UUID_SEGMENT.test(token) ||
    token.length >= 24 ||
    segment.length >= 24 ||
    token.includes("@") ||
    token.includes("%") ||
    segment.includes("@") ||
    segment.includes("%")
  ) {
    return ":id";
  }
  return segment;
}

function redactPath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => redactPathSegment(segment))
    .join("/");
}

/** http(s) keeps origin + path. Labeled non-http schemes keep `scheme:[redacted]`. */
export function scrubUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (raw.length === 0) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return LABELED_NON_HTTP_SCHEMES.includes(url.protocol)
        ? `${url.protocol}${REDACTED}`
        : REDACTED;
    }
    return `${url.origin}${redactPath(url.pathname)}`;
  } catch {
    return redactPath(raw.split(/[?#]/, 1)[0] ?? "");
  }
}

export function scrubBreadcrumb<T>(crumb: T): T | null {
  if (crumb == null) return crumb;
  if (typeof crumb !== "object") return null;
  const record = crumb as { message?: unknown; data?: unknown };
  if (typeof record.message === "string" && record.message.length > 0) return null;
  if (
    record.data != null &&
    typeof record.data === "object" &&
    Object.keys(record.data as object).length > 0
  ) {
    return null;
  }
  return crumb;
}

function scrubRequest(request: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...request };
  delete next.data;
  delete next.body;
  delete next.cookies;
  delete next.headers;
  delete next.query_string;
  delete next.env;
  if (typeof next.url === "string") next.url = scrubUrl(next.url);
  return next;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function scrubFrame(frame: unknown): Record<string, unknown> | null {
  if (!frame || typeof frame !== "object") return null;
  const source = frame as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  if (typeof source.filename === "string") next.filename = scrubUrl(source.filename);
  if (typeof source.abs_path === "string") next.abs_path = scrubUrl(source.abs_path);
  const lineno = finiteNumber(source.lineno);
  const colno = finiteNumber(source.colno);
  if (lineno !== undefined) next.lineno = lineno;
  if (colno !== undefined) next.colno = colno;
  if (typeof source.in_app === "boolean") next.in_app = source.in_app;
  return next;
}

function scrubMechanism(mechanism: unknown): Record<string, unknown> | undefined {
  if (!mechanism || typeof mechanism !== "object") return undefined;
  const source = mechanism as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  if (typeof source.type === "string" && SAFE_MECHANISM_TYPE.test(source.type)) {
    next.type = source.type;
  }
  if (typeof source.handled === "boolean") next.handled = source.handled;
  return Object.keys(next).length > 0 ? next : undefined;
}

function scrubExceptionValue(entry: unknown): Record<string, unknown> {
  if (!entry || typeof entry !== "object") return {};
  const source = entry as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  if (typeof source.type === "string" && STANDARD_JS_ERROR_TYPES.has(source.type)) {
    next.type = source.type;
  }
  if ("value" in source) next.value = REDACTED;
  const mechanism = scrubMechanism(source.mechanism);
  if (mechanism) next.mechanism = mechanism;
  const stacktrace = source.stacktrace;
  if (stacktrace && typeof stacktrace === "object") {
    const frames = (stacktrace as { frames?: unknown }).frames;
    next.stacktrace = {
      frames: Array.isArray(frames)
        ? frames
            .map((frame) => scrubFrame(frame))
            .filter((frame): frame is Record<string, unknown> => frame != null)
        : [],
    };
  }
  return next;
}

function scrubException(exception: Record<string, unknown>): Record<string, unknown> {
  const values = exception.values;
  if (!Array.isArray(values)) return {};
  return { values: values.map((entry) => scrubExceptionValue(entry)) };
}

function scrubBreadcrumbsField(breadcrumbs: unknown): unknown {
  if (Array.isArray(breadcrumbs)) {
    return breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is NonNullable<typeof crumb> => crumb != null);
  }
  if (
    breadcrumbs &&
    typeof breadcrumbs === "object" &&
    Array.isArray((breadcrumbs as { values?: unknown }).values)
  ) {
    const values = (breadcrumbs as { values: unknown[] }).values;
    return {
      ...(breadcrumbs as Record<string, unknown>),
      values: values
        .map((crumb) => scrubBreadcrumb(crumb))
        .filter((crumb): crumb is NonNullable<typeof crumb> => crumb != null),
    };
  }
  return breadcrumbs;
}

function eventHandled(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

/**
 * Small `beforeSend` floor. Returns null only when the event itself is null.
 * Drops user (including IP), contexts, transaction, request bodies, and
 * content breadcrumbs. Rebuilds tags from `manualReportTags`. Redacts free
 * text. Strips query strings and rejects non-http schemes, including
 * `vbscript:`.
 */
export function scrubEvent<T>(event: T): T {
  if (event == null || typeof event !== "object") return event;
  const next: Record<string, unknown> = { ...(event as Record<string, unknown>) };
  delete next.user;
  delete next.extra;
  delete next.contexts;
  delete next.transaction;
  if (typeof next.message === "string") next.message = REDACTED;
  if (next.logentry && typeof next.logentry === "object") {
    next.logentry = { message: REDACTED };
  }
  const tags = scrubTags(next.tags);
  if (tags) next.tags = tags;
  else delete next.tags;
  if (next.request && typeof next.request === "object") {
    next.request = scrubRequest(next.request as Record<string, unknown>);
  }
  if (next.exception && typeof next.exception === "object") {
    next.exception = scrubException(next.exception as Record<string, unknown>);
  }
  if ("breadcrumbs" in next) next.breadcrumbs = scrubBreadcrumbsField(next.breadcrumbs);
  return next as T;
}

function scrubTags(tags: unknown): Record<string, string> | undefined {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return undefined;
  const record = tags as Record<string, unknown>;
  const rebuilt = manualReportTags({
    source: typeof record.source === "string" ? record.source : undefined,
    route: typeof record.route === "string" ? record.route : undefined,
    handled: eventHandled(record.handled),
  });
  return Object.keys(rebuilt).length > 0 ? rebuilt : undefined;
}

export function normalizeCaughtError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(REDACTED);
}

export function manualReportTags(
  context: ManualReportContext | null | undefined,
): Record<string, string> {
  if (!context) return {};
  const tags: Record<string, string> = {};
  if (typeof context.source === "string" && /^[a-z0-9_]{1,64}$/.test(context.source)) {
    tags.source = context.source;
  }
  if (typeof context.handled === "boolean") tags.handled = context.handled ? "true" : "false";
  if (typeof context.route === "string" && context.route.length > 0) {
    const route = scrubUrl(context.route).slice(0, 300);
    const pathShaped =
      route.startsWith("/") || route.startsWith("http://") || route.startsWith("https://");
    if (route && pathShaped && !/\s/.test(route)) tags.route = route;
  }
  return tags;
}
