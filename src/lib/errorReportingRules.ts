/**
 * Production error-reporting rules. Pure, deterministic, null-safe — no I/O,
 * no SDK import. The side-effecting wiring lives in `errorReporter.ts`.
 *
 * The reporter may run only with a hosted-Sentry DSN, a production build, and
 * one of the production hostnames. Outgoing events drop user fields, IP,
 * request bodies, and breadcrumbs that carry content. Free-text messages are
 * replaced so grower text does not leave. Query strings never leave.
 * `vbscript:` and the other labeled non-http schemes keep the scheme and drop
 * the payload (`vbscript:[redacted]`).
 */

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

const DSN_PATTERN = /^https:\/\/[0-9a-f]{8,}@[a-z0-9.-]+\.sentry\.io\/\d+$/i;

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
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.split(/[?#]/, 1)[0] ?? "";
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

function scrubFrame(frame: unknown): unknown {
  if (!frame || typeof frame !== "object") return frame;
  const next: Record<string, unknown> = { ...(frame as Record<string, unknown>) };
  delete next.vars;
  if (typeof next.filename === "string") next.filename = scrubUrl(next.filename);
  if (typeof next.abs_path === "string") next.abs_path = scrubUrl(next.abs_path);
  return next;
}

function scrubException(exception: Record<string, unknown>): Record<string, unknown> {
  const values = exception.values;
  if (!Array.isArray(values)) return { ...exception };
  return {
    ...exception,
    values: values.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const next: Record<string, unknown> = { ...(entry as Record<string, unknown>) };
      if ("value" in next) next.value = REDACTED;
      const stacktrace = next.stacktrace;
      if (stacktrace && typeof stacktrace === "object") {
        const frames = (stacktrace as { frames?: unknown }).frames;
        next.stacktrace = {
          ...(stacktrace as Record<string, unknown>),
          frames: Array.isArray(frames) ? frames.map(scrubFrame) : frames,
        };
      }
      return next;
    }),
  };
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

/**
 * Small `beforeSend` floor. Returns null only when the event itself is null.
 * Drops user (including IP), request bodies, and content breadcrumbs. Redacts
 * free text. Strips query strings and rejects non-http schemes, including
 * `vbscript:`.
 */
export function scrubEvent<T>(event: T): T {
  if (event == null || typeof event !== "object") return event;
  const next: Record<string, unknown> = { ...(event as Record<string, unknown>) };
  delete next.user;
  delete next.extra;
  if (typeof next.message === "string") next.message = REDACTED;
  if (next.logentry && typeof next.logentry === "object") {
    next.logentry = { ...(next.logentry as Record<string, unknown>), message: REDACTED };
  }
  if (next.request && typeof next.request === "object") {
    next.request = scrubRequest(next.request as Record<string, unknown>);
  }
  if (next.exception && typeof next.exception === "object") {
    next.exception = scrubException(next.exception as Record<string, unknown>);
  }
  if ("breadcrumbs" in next) next.breadcrumbs = scrubBreadcrumbsField(next.breadcrumbs);
  return next as T;
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
    const route = scrubUrl(context.route);
    if (route) tags.route = route.slice(0, 300);
  }
  return tags;
}
