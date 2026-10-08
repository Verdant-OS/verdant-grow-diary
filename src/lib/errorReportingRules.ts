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
 * - URLs are reduced to origin + pathname, with UUID path segments (row ids)
 *   replaced by `:id`. Query strings and fragments are
 *   dropped because auth flows carry tokens there.
 * - Free text (messages, stacks, breadcrumbs) is scrubbed for token-like
 *   values, e-mail addresses and UUID row ids before it leaves the browser.
 * - No session replay, no performance tracing, no console capture.
 */

export const SENTRY_INGEST_ORIGINS: ReadonlyArray<string> = [
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
  "https://*.ingest.de.sentry.io",
];

/**
 * The only hosts that may report. Verdant has no staging or preview environment
 * (AGENTS.md › Release and Environment Rules), so a production-mode bundle served
 * anywhere else (a workers.dev or vercel.app deployment, a copied build) stays off
 * rather than sending events to the real project.
 */
export const PRODUCTION_HOSTNAMES: ReadonlyArray<string> = [
  "verdantgrowdiary.com",
  "www.verdantgrowdiary.com",
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
      readonly environment: "production";
      readonly release: string | undefined;
    };

export type ErrorReportingDisabledReason =
  | "no_dsn"
  | "invalid_dsn"
  | "server"
  | "local_host"
  | "lovable_preview"
  | "non_production_host"
  | "not_production_build";

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
  if (!PRODUCTION_HOSTNAMES.includes(hostname)) {
    return { enabled: false, reason: "non_production_host" };
  }
  const environment = "production";
  const release = env?.release?.trim() || undefined;
  return { enabled: true, dsn, environment, release };
}

// ── Scrubbing ────────────────────────────────────────────────────────────────

/** UUID with literal or percent-encoded (`%2D`) hyphens. */
const UUID_BODY = String.raw`[0-9a-f]{8}(?:-|%2[Dd])[0-9a-f]{4}(?:-|%2[Dd])[0-9a-f]{4}(?:-|%2[Dd])[0-9a-f]{4}(?:-|%2[Dd])[0-9a-f]{12}`;
/** A UUID anywhere in free text (row ids in error messages). */
const UUID_TEXT_PATTERN = new RegExp(String.raw`(?<![0-9a-z])${UUID_BODY}(?![0-9a-z])`, "gi");
export const REDACTED_ID = "[id]";
/** E-mail addresses, with a literal or URL-encoded (`%40`) at sign. */
const EMAIL_PATTERN = /[A-Z0-9._%+-]+(?:@|%40)[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** Bearer / JWT / API-key shaped values. JWTs are three base64url segments. */
const JWT_PATTERN = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_PATTERN = /\b(bearer\s+)[A-Za-z0-9._~+/=-]{4,}/gi;
/** Verdant bridge tokens (`vbt_…`), which can appear bare with no key or scheme in front. */
const BRIDGE_TOKEN_PATTERN = /\bvbt_[A-Za-z0-9_-]{6,}/g;
/**
 * Secrets recognisable by prefix alone, with no key label in front (`gateway rejected
 * sk_live_…`). Prefixes follow `SECRET_LIKE_PATTERNS` in `src/lib/mcp/manifestView.ts`
 * plus standard provider formats. The prefix is kept for diagnosis; the rest is dropped.
 */
const KNOWN_SECRET_PATTERN =
  /\b((?:sk|rk)_(?:live|test)_|sk-|sb_secret_|sbp_|pdl_[a-z]+_|whsec_|gh[pousr]_|github_pat_|xox[abprs]-|AKIA)[A-Za-z0-9_-]{6,}/g;
/** `Basic <base64>` credentials (HTTP Basic auth). Keeps the scheme, drops the value. */
const BASIC_PATTERN = /\b(basic\s+)[A-Za-z0-9+/=]{4,}/gi;
/**
 * Any key whose name contains a credential word (snake, kebab or camel case:
 * `refresh_token`, `clientSecret`, `x-api-key`, `Set-Cookie`, `session_id`), bare
 * or quoted, followed by `:`, `=` or URL-encoded `%3D` with optional spaces. The
 * value may be double- or single-quoted (escapes included), already redacted, or
 * bare. A bare value runs to the next `, ; & } ] [ "` or line end (`#` and `'`
 * do not end it: `abc#123`, `it's secret`), so a value
 * with spaces (`password: hunter two`) is redacted whole; over-redacting the
 * rest of a clause is preferred to leaking part of a credential.
 * Keeps the key, separator and value quotes; drops the value.
 * `code` and bare `key` are not credential words here, so diagnostics such as a
 * Postgres `code: 23505` stay readable; see OAUTH_PARAM_PATTERN for `code=`.
 */
/** Separator: `:`, `=` or URL-encoded `%3D`, with optional whitespace on either side. */
const CREDENTIAL_SEPARATOR = String.raw`(\s*(?:[:=]|%3[Dd])\s*)`;
/**
 * A quote, or a backslash-escaped one (`\"`) when JSON was serialised inside another
 * string (`payload=\"access_token\":\"…\"`).
 */
const QUOTE = String.raw`\\*["']`;
/**
 * A value whose quote is escaped at any serialisation depth (`\"…\"`, `\\\"…\\\"`,
 * seven or more backslashes). It closes only on the same quote behind exactly the same
 * backslash run, so an inner quote escaped one level deeper (`\"abc\\\"def\"`) stays
 * inside the value; unterminated, it runs to the end.
 */
const ESCAPED_QUOTED_VALUE = String.raw`(?<esc>\\+)(?<q>["'])[\s\S]*?(?:(?<!\\)\k<esc>\k<q>|$)`;
/**
 * Value: escaped-quoted, quoted (escapes included), bracketed (an array, across lines too,
 * or already `[redacted]`), or bare up to the next delimiter. A quoted or bracketed value
 * with no closing quote or bracket (a truncated payload) runs to the end of the text.
 */
const CREDENTIAL_VALUE = String.raw`(${ESCAPED_QUOTED_VALUE}|"(?:[^"\\]|\\.)*(?:"|$)|'(?:[^'\\]|\\.)*(?:'|$)|\[[^\]]*(?:\]|$)|[^\s,;&}[\]"][^,;&}[\]"\n]*)`;
/** What a one-time or recovery code is called (`MFA code`, `recovery_codes`, `pin`). Not `error` or `status`. */
const ONE_TIME_CODE_QUALIFIERS = String.raw`auth|authorization|verification|otp|security|confirmation|mfa|2fa|sms|totp|recovery|backup|reset|invite|login|pin`;
/** Words that make an identifier a credential name, including `*_KEY` / `*-key`, named `…Key`s and one-time codes (`auth_code`, `mfa_code`, `recovery_codes`, PKCE `code_verifier`, `otp`). */
const CREDENTIAL_WORDS = String.raw`token|secret|passw(?:or)?d|pwd|pass|api[-_]?key|apikey|authorization|session|cookie|credential|[-_]key|(?:private|secret|service|access|signing|encryption|master|anon|role|client)key|(?:${ONE_TIME_CODE_QUALIFIERS}|one[-_]?time)[-_]?codes?|code[-_]?verifier|otp`;
const CREDENTIAL_PATTERN = new RegExp(
  String.raw`(${QUOTE}|)(?<![A-Za-z0-9_-])([A-Za-z0-9_-]*(?:${CREDENTIAL_WORDS})[A-Za-z0-9_-]*)\1` +
    CREDENTIAL_SEPARATOR +
    CREDENTIAL_VALUE,
  "gi",
);
/** What a key is called when its label has a space (`API key`, `service role key`). Not `primary` or `foreign`. */
const SPACED_KEY_QUALIFIERS = String.raw`api|secret|signing|private|access|encryption|master|anon|client|service(?:\s+role)?`;
/**
 * Human-readable credential labels with a space: one-time codes (`auth code: 123456`,
 * `MFA code: …`, `recovery codes: …`, `code verifier: …`), named keys (`API key: …`,
 * `service role key: …`) and an exact `pin:`. `error code:` / `status code:` /
 * `primary key:` are not matched, nor are `spin:` / `pinned:`.
 */
const SPACED_CREDENTIAL_LABEL_PATTERN = new RegExp(
  String.raw`(${QUOTE}|)\b((?:${ONE_TIME_CODE_QUALIFIERS}|one[- ]time)\s+codes?|code\s+verifier|(?:${SPACED_KEY_QUALIFIERS})\s+key|pin)\1` +
    CREDENTIAL_SEPARATOR +
    CREDENTIAL_VALUE,
  "gi",
);
/**
 * An exactly quoted `"key"` / `'key'` in object form (`{"key":"sk_live_…"}`). A bare
 * `key:` is not matched, so diagnostics such as Postgres `Key (plant_id)=…` stay readable.
 */
const QUOTED_KEY_PATTERN = new RegExp(
  String.raw`(${QUOTE})(key)\1(\s*:\s*)` + CREDENTIAL_VALUE,
  "gi",
);
/**
 * An exactly quoted `"code"` / `'code'` in object form (`{"code":"4/0Ab…"}`, an OAuth
 * exchange). Only SQLSTATE and PostgREST diagnostic codes (`"23505"`, `"42P01"`, `"PGRST116"`) are kept.
 */
const QUOTED_CODE_PATTERN = new RegExp(
  String.raw`(${QUOTE})(code)\1(\s*:\s*)` + CREDENTIAL_VALUE,
  "gi",
);
/** SQLSTATE (`23505`, `42P01`) or PostgREST (`PGRST116`) code shape, optionally (escape-)quoted. */
const DIAGNOSTIC_CODE_VALUE = /^(\\*["']?)(?:[0-9A-Z]{5}|PGRST\d{3})\1$/;
/** The fields a PostgREST error object carries beside `code`. */
const POSTGREST_ERROR_FIELDS = ["details", "hint", "message"];

/**
 * The text of the innermost object enclosing `offset` at its own depth: nested objects are
 * left out. Scans from the start of the text and treats `quote` (the code key's own quote,
 * judged by backslash parity, see isDelimitingQuote) as a string delimiter, so braces inside string values are
 * not structure. Null when no balanced object encloses `offset`.
 */
function enclosingObjectTopLevel(text: string, offset: number, quote: string): string | null {
  const quoteChar = quote[quote.length - 1];
  const level = quote.length - 1;
  const open: Array<{ start: number; topLevel: string }> = [];
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === quoteChar && isDelimitingQuote(text, i, level)) {
      inString = !inString;
    } else if (!inString && char === "{") {
      open.push({ start: i, topLevel: "" });
      continue;
    } else if (!inString && char === "}") {
      const object = open.pop();
      if (object && object.start < offset && i > offset) return object.topLevel;
      continue;
    }
    if (open.length > 0) open[open.length - 1].topLevel += char;
  }
  return null;
}

/**
 * Whether the quote at `index` delimits a string serialised `level` times over (0 for
 * plain JSON, 1 for `\"…\"`, 3, 7, …), judged by the parity of the backslash run before
 * it: plain JSON closes on an even run (`"…\\"` ends after an escaped backslash), level 1
 * on 1, 5, 9 … backslashes, and so on. A quote escaped inside the string fails the test.
 */
function isDelimitingQuote(text: string, index: number, level: number): boolean {
  let run = 0;
  while (index - run - 1 >= 0 && text[index - run - 1] === "\\") run += 1;
  return run % (2 * (level + 1)) === level;
}

/**
 * True when the code at `offset` sits in an object whose own top-level keys, quoted
 * exactly like `code`, include `details`, `hint` and `message`: the full PostgREST error
 * shape. A code beside only some of them (`{"code":"12345","message":"OAuth exchange
 * failed"}`), with them only in a nested object or inside a string value, or in another
 * object, could be a verification or OAuth code and is redacted.
 */
function isInPostgrestErrorObject(text: string, offset: number, quote: string): boolean {
  const topLevel = enclosingObjectTopLevel(text, offset, quote);
  if (topLevel == null) return false;
  const q = quote.replace(/[\\"']/g, (char) => `\\${char}`);
  return POSTGREST_ERROR_FIELDS.every((field) =>
    new RegExp(String.raw`(?:^|,)\s*${q}${field}${q}\s*:`, "i").test(topLevel),
  );
}

/**
 * `state` / `nonce` in object or colon form (`{"state":"…"}`, `nonce: …`). A nonce is
 * always redacted. An OAuth state is an opaque string of any shape, so a state is
 * redacted too unless it is one of READABLE_STATES (`state: pending`).
 */
const STATE_NONCE_PATTERN = new RegExp(
  String.raw`(${QUOTE}|)\b(state|nonce)\1(\s*:\s*)` + CREDENTIAL_VALUE,
  "gi",
);
/** Lifecycle words a diagnostic `state` may carry; any other state value is redacted. */
const READABLE_STATES = new Set([
  "active",
  "inactive",
  "pending",
  "idle",
  "loading",
  "ready",
  "open",
  "closed",
  "running",
  "stopped",
  "complete",
  "completed",
  "failed",
  "error",
  "success",
  "unknown",
  "draft",
  "archived",
  "null",
  "undefined",
  "true",
  "false",
]);

function isReadableState(value: string): boolean {
  return READABLE_STATES.has(value.replace(/^\\*["']|\\*["']$/g, "").toLowerCase());
}

/** OAuth `code=` / `key=` / `state=` / `nonce=` parameters (auth callbacks carry them), `=` or `%3D` with optional spaces. */
const OAUTH_PARAM_PATTERN =
  /\b(code|key|state|nonce)(\s*(?:=|%3[Dd])\s*)("[^"]*"|'[^']*'|\[redacted\]|[^&\s"'#]+)/gi;

export const REDACTED = "[redacted]";

/** REDACTED, keeping the quotes of a quoted value so serialised text stays well-formed. */
function redactedLike(value: string): string {
  const quote = /^\\*["']/.exec(value)?.[0] ?? "";
  return `${quote}${REDACTED}${quote}`;
}

/** Most nested URL-encoding layers decoded before scrubbing (`%253D` is two). */
const MAX_DECODE_PASSES = 3;
const PERCENT_RUN_PATTERN = /(?:%[0-9A-Fa-f]{2})+/g;
const ASCII_ESCAPE_PATTERN = /%[0-7][0-9A-Fa-f]/g;

/**
 * Characters that end a bare credential value. When decoding produces one, it is held as
 * a private-use stand-in until redaction is done, so an encoded `%26` / `%3B` / `%2C`
 * inside a credential cannot end its value early (`access_token%3Aabc%26def…`).
 */
const VALUE_DELIMITERS = "&;,}][\n";
const DELIMITER_STAND_IN_BASE = 0xe000;
const DELIMITER_STAND_IN_PATTERN = new RegExp(
  `[${[...VALUE_DELIMITERS]
    .map((char) => `\\u${(DELIMITER_STAND_IN_BASE + char.charCodeAt(0)).toString(16)}`)
    .join("")}]`,
  "g",
);

function holdDelimiters(decoded: string): string {
  return decoded.replace(/[&;,}\][\n]/g, (char) =>
    String.fromCharCode(DELIMITER_STAND_IN_BASE + char.charCodeAt(0)),
  );
}

function restoreDelimiters(text: string): string {
  return text.replace(DELIMITER_STAND_IN_PATTERN, (char) =>
    String.fromCharCode(char.charCodeAt(0) - DELIMITER_STAND_IN_BASE),
  );
}

/**
 * Decodes one layer of `%XX` escapes so encoded credentials (`Bearer%20…`,
 * `%22password%22%3A…`, `%2540`) meet the same patterns as plain text. Decoded value
 * delimiters are held (see VALUE_DELIMITERS). In a run that is not valid UTF-8 only the
 * ASCII escapes are decoded.
 */
function decodeOneLayer(text: string): string {
  return text.replace(PERCENT_RUN_PATTERN, (run) => {
    try {
      return holdDelimiters(decodeURIComponent(run));
    } catch {
      // Malformed UTF-8 in the run: still decode its ASCII escapes (`%3A`, `%20`)
      // so one bad sequence cannot hide the separator next to a credential.
      return run.replace(ASCII_ESCAPE_PATTERN, (escape) =>
        holdDelimiters(String.fromCharCode(parseInt(escape.slice(1), 16))),
      );
    }
  });
}

/** Removes e-mail addresses, UUID row ids, bridge/JWT/bearer tokens and credential-looking query values from free text. Idempotent. */
export function scrubText(value: unknown): string {
  if (value == null) return "";
  // Redact before decoding, while an encoded `%22` inside a credential cannot yet end its
  // value, then again after each decoded layer, for credentials that only decoding
  // reveals (`%22password%22%3A…`). Decoded delimiters stay held until the end.
  let text = redactPatterns(typeof value === "string" ? value : safeString(value));
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    const next = decodeOneLayer(text);
    if (next === text) break;
    text = redactPatterns(next);
  }
  return restoreDelimiters(text);
}

function redactPatterns(text: string): string {
  return text
    .replace(BRIDGE_TOKEN_PATTERN, `vbt_${REDACTED}`)
    .replace(KNOWN_SECRET_PATTERN, (_m, prefix: string) => `${prefix}${REDACTED}`)
    .replace(BEARER_PATTERN, (_m, prefix: string) => `${prefix}${REDACTED}`)
    .replace(BASIC_PATTERN, (_m, prefix: string) => `${prefix}${REDACTED}`)
    .replace(
      CREDENTIAL_PATTERN,
      (_m, quote: string, key: string, separator: string, value: string) =>
        `${quote}${key}${quote}${separator}${redactedLike(value)}`,
    )
    .replace(
      SPACED_CREDENTIAL_LABEL_PATTERN,
      (_m, quote: string, label: string, separator: string, value: string) =>
        `${quote}${label}${quote}${separator}${redactedLike(value)}`,
    )
    .replace(
      QUOTED_KEY_PATTERN,
      (_m, quote: string, key: string, separator: string, value: string) =>
        `${quote}${key}${quote}${separator}${redactedLike(value)}`,
    )
    .replace(
      QUOTED_CODE_PATTERN,
      (match, quote: string, key: string, separator: string, value: string, ...rest: unknown[]) => {
        // CREDENTIAL_VALUE has named groups, so the arguments end with offset, text, groups.
        const offset = rest[rest.length - 3] as number;
        const whole = rest[rest.length - 2] as string;
        return DIAGNOSTIC_CODE_VALUE.test(value) && isInPostgrestErrorObject(whole, offset, quote)
          ? match
          : `${quote}${key}${quote}${separator}${redactedLike(value)}`;
      },
    )
    .replace(
      STATE_NONCE_PATTERN,
      (match, quote: string, key: string, separator: string, value: string) =>
        key.toLowerCase() === "state" && isReadableState(value)
          ? match
          : `${quote}${key}${quote}${separator}${redactedLike(value)}`,
    )
    .replace(
      OAUTH_PARAM_PATTERN,
      (_m, key: string, separator: string, value: string) =>
        `${key}${separator}${redactedLike(value)}`,
    )
    .replace(JWT_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(UUID_TEXT_PATTERN, REDACTED_ID);
}

/** A whole path segment shaped like a UUID (grow, tent, plant and other row ids), hyphens literal or `%2D`. */
const UUID_SEGMENT_PATTERN = new RegExp(String.raw`(?<=\/)${UUID_BODY}(?=\/|$)`, "gi");

function redactPathIds(path: string): string {
  return path.replace(UUID_SEGMENT_PATTERN, ":id");
}

/** Reduces an http(s) URL to origin + pathname, with UUID segments as `:id`; any other scheme becomes `scheme:[redacted]`. Relative or unparsable input keeps only the part before `?`/`#`. */
export function scrubUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const url = new URL(value);
    // Only http(s) has an origin + path worth keeping. data:, javascript:, blob:,
    // extension and other schemes can carry a payload in what follows the scheme.
    if (url.protocol !== "http:" && url.protocol !== "https:") return `${url.protocol}${REDACTED}`;
    return `${url.origin}${redactPathIds(url.pathname)}`;
  } catch {
    return redactPathIds(value.split(/[?#]/, 1)[0] ?? "");
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

/**
 * Default SDK integrations removed at init. `BrowserSession` sends a release-health
 * session envelope with a generated session id on every page load, even when no error
 * occurs; session envelopes never pass through `beforeSend`, so they cannot be scrubbed.
 */
export const EXCLUDED_DEFAULT_INTEGRATIONS: ReadonlyArray<string> = ["BrowserSession"];

/** Filters SDK default integrations by name; usable as Sentry's `integrations` callback. */
export function withoutExcludedIntegrations<T extends { name: string }>(defaults: T[]): T[] {
  return defaults.filter(
    (integration) => !EXCLUDED_DEFAULT_INTEGRATIONS.includes(integration.name),
  );
}

/** Breadcrumb categories that may carry page content, grower data or credentials; dropped outright. */
export const DROPPED_BREADCRUMB_CATEGORIES: ReadonlyArray<string> = [
  "console",
  "ui.input",
  // DOM click descriptors include element attributes (e.g. a cultivar name in `title`).
  "ui.click",
];

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
