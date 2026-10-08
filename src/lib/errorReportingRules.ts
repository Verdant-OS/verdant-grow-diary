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
 * - Page URLs are reduced to origin + route template (`/plants/:id`); a path only the
 *   catch-all renders becomes `/:unmatched`. Other URLs keep origin plus only the
 *   code-defined path segments (`/assets/<built file>`, Supabase `/<service>/v1/<name>`);
 *   every other segment becomes `:id` (UUID) or `:redacted`.
 *   Query strings and fragments are always dropped: auth flows carry tokens there.
 * - Messages, exception values and breadcrumb messages leave only as an allowlisted
 *   summary (`summarizeErrorText`). Other strings (tags, extra, breadcrumb data) are
 *   scrubbed for token-like values, e-mail addresses and UUID row ids.
 * - No session replay, no performance tracing, no console capture.
 */

import { APP_ROUTES } from "@/lib/appRouteManifest";

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
const QUOTE = String.raw`(?:\\*["']|[\uE022\uE027])`;
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
 * judged by backslash parity, see isDelimitingQuote), double or single, as a string delimiter, so braces inside string values are
 * not structure. Null when no balanced object encloses `offset`.
 */
function enclosingObjectTopLevel(text: string, offset: number, quote: string): string | null {
  const level = quote.length - 1;
  const open: Array<{ start: number; topLevel: string }> = [];
  // The quote character of the string being scanned, or null outside strings. Both
  // styles are tracked: a `"…}…"` value inside a single-quoted object is still a string.
  let openQuote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const inString = openQuote !== null;
    if ((char === '"' || char === "'") && isDelimitingQuote(text, i, level)) {
      if (openQuote === null) openQuote = char;
      else if (openQuote === char) openQuote = null;
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

/**
 * Most URL-encoding layers decoded (`%253D` is two). Text still encoded after this many
 * layers is redacted whole rather than sent with a recoverable layer left.
 */
const MAX_DECODE_PASSES = 8;
const PERCENT_RUN_PATTERN = /(?:%[0-9A-Fa-f]{2})+/g;
const ASCII_ESCAPE_PATTERN = /%[0-7][0-9A-Fa-f]/g;

/**
 * Characters that end a credential value. When decoding produces one, it is held as a
 * private-use stand-in until redaction is done, so an encoded `%26` / `%3B` / `%2C` /
 * `%22` inside a credential cannot end its value early (`access_token%3Aabc%26def…`).
 * A held quote still counts as a key quote (see QUOTE), so `%22access_token%22%3A…` is
 * recognised.
 */
const VALUE_DELIMITERS = "&;,}][\n\"'";
const DELIMITER_STAND_IN_BASE = 0xe000;
const DELIMITER_STAND_IN_PATTERN = new RegExp(
  `[${[...VALUE_DELIMITERS]
    .map((char) => `\\u${(DELIMITER_STAND_IN_BASE + char.charCodeAt(0)).toString(16)}`)
    .join("")}]`,
  "g",
);

const HELD_DELIMITER_PATTERN = new RegExp(
  `[${[...VALUE_DELIMITERS].map((char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`).join("")}]`,
  "g",
);

function holdDelimiters(decoded: string): string {
  return decoded.replace(HELD_DELIMITER_PATTERN, (char) =>
    String.fromCharCode(DELIMITER_STAND_IN_BASE + char.charCodeAt(0)),
  );
}

function restoreDelimiters(text: string): string {
  return text.replace(DELIMITER_STAND_IN_PATTERN, (char) =>
    String.fromCharCode(char.charCodeAt(0) - DELIMITER_STAND_IN_BASE),
  );
}

/** HTML entities an HTML-safe diagnostic uses for quotes and separators (`&quot;`, `&#58;`, `&#x22;`). */
/**
 * An entity starts with `&`, or with the held stand-in a decoded `&amp;` became (`&amp;quot;`),
 * and ends with `;` or its held stand-in, so a percent-encoded entity (`%26quot%3B`) decodes too.
 * Names are case-sensitive: the uppercase forms are only the four the HTML spec defines.
 */
const HTML_ENTITY_PATTERN =
  /[&\uE026](?:#(\d{1,7})|#[xX]([0-9A-Fa-f]{1,6})|(quot|apos|amp|colon|comma|semi|equals|lt|gt|QUOT|AMP|LT|GT))[;\uE03B]/g;
const NAMED_HTML_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  amp: "&",
  colon: ":",
  comma: ",",
  semi: ";",
  equals: "=",
  lt: "<",
  gt: ">",
};

/**
 * Decodes HTML entities until none remain, so nested escaping (`&amp;quot;`, `&#38;quot;`)
 * is undone too. Text still holding entities after MAX_DECODE_PASSES layers is redacted
 * whole rather than sent with a recoverable layer left.
 */
function decodeHtmlEntities(text: string): string {
  let current = text;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    const next = decodeHtmlEntityLayer(current);
    if (next === current) return current;
    current = next;
  }
  return decodeHtmlEntityLayer(current) === current ? current : REDACTED;
}

function decodeHtmlEntityLayer(text: string): string {
  return text.replace(
    HTML_ENTITY_PATTERN,
    (entity, decimal?: string, hex?: string, name?: string) => {
      const code = decimal ? Number(decimal) : hex ? parseInt(hex, 16) : null;
      if (code !== null) {
        return code > 0 && code <= 0x10ffff ? holdDelimiters(String.fromCodePoint(code)) : entity;
      }
      return holdDelimiters(NAMED_HTML_ENTITIES[(name ?? "").toLowerCase()] ?? entity);
    },
  );
}

/**
 * Decodes one layer of `%XX` escapes and HTML entities so encoded credentials
 * (`Bearer%20…`, `%22password%22%3A…`, `%2540`, `&quot;access_token&quot;:…`) meet the
 * same patterns as plain text. Decoded value delimiters are held (see VALUE_DELIMITERS).
 * In a percent run that is not valid UTF-8 only the ASCII escapes are decoded.
 */
function decodeOneLayer(text: string): string {
  return decodeHtmlEntities(text).replace(PERCENT_RUN_PATTERN, (run) => {
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
  // HTML entities decode to held characters, so decoding them first keeps `&amp;` inside a
  // credential from ending it at the raw pass.
  let text = redactPatterns(
    decodeHtmlEntities(typeof value === "string" ? value : safeString(value)),
  );
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    const next = decodeOneLayer(text);
    if (next === text) return restoreDelimiters(text);
    text = redactPatterns(next);
  }
  return decodeOneLayer(text) === text ? restoreDelimiters(text) : REDACTED;
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
const UUID_SEGMENT_PATTERN = new RegExp(String.raw`^${UUID_BODY}$`, "i");

/** A Vite build asset, `<name>-<8-character content hash>.<ext>`: a grower-named file has no hash. */
const FINGERPRINTED_ASSET_PATTERN =
  /^[A-Za-z0-9_.-]{1,96}-[A-Za-z0-9_-]{8}\.(?:m?js|css|map|wasm|woff2?|ttf|png|svg|jpe?g|webp|avif|gif|ico)$/;
const SUPABASE_HOST_PATTERN = /^[a-z0-9-]+\.supabase\.co$/;

/** Every edge function under `supabase/functions` (a test keeps this equal to the directory). */
export const KNOWN_EDGE_FUNCTIONS: ReadonlySet<string> = new Set([
  "ai-coach",
  "ai-cultivar-qa",
  "ai-doctor-review",
  "auth-email-hook",
  "checkout-status",
  "create-breeding-suggestions",
  "delete-account",
  "ecowitt-ingest",
  "ecowitt-real-ingest",
  "edge-metrics-alert-check",
  "edge-metrics-latest",
  "environment-summary-report-entitlement",
  "founder-slots-remaining",
  "get-paddle-price",
  "handle-email-suppression",
  "handle-email-unsubscribe",
  "live-sensor-entitlement",
  "mcp",
  "mint-bridge-token",
  "operator-credits-audit",
  "operator-ggs-real-payload-commit",
  "paddle-portal-session",
  "paddle-webhook",
  "payments-webhook",
  "pi-ingest-readings",
  "premium-export-entitlement",
  "preview-transactional-email",
  "process-email-queue",
  "redeem-referral",
  "revoke-bridge-token",
  "rls-selftest",
  "save-founder-prefs",
  "send-transactional-email",
  "sensor-ingest-webhook",
]);
/** Supabase Auth endpoint names the client calls. */
const KNOWN_AUTH_ENDPOINTS: ReadonlySet<string> = new Set([
  "authorize",
  "callback",
  "factors",
  "health",
  "logout",
  "magiclink",
  "otp",
  "reauthenticate",
  "recover",
  "resend",
  "settings",
  "signup",
  "sso",
  "token",
  "user",
  "verify",
]);
const SUPABASE_SERVICES: ReadonlySet<string> = new Set([
  "rest",
  "auth",
  "functions",
  "realtime",
  "storage",
]);
const STORAGE_ACCESS_SEGMENTS: ReadonlySet<string> = new Set([
  "public",
  "sign",
  "authenticated",
  "info",
]);

/**
 * Which path segments are known to be written by code, by closed list and never by
 * shape: a fingerprinted build asset on our own origin (or a relative path), and on a
 * Supabase host the fixed service vocabulary plus known edge-function and auth-endpoint
 * names. Table, RPC and bucket names are not listed, so they are not kept; nor is
 * anything on another host.
 */
function keptSegmentMask(parts: ReadonlyArray<string>, host: string | null): boolean[] {
  const keep = parts.map(() => false);
  const ownOrigin = host === null || PRODUCTION_HOSTNAMES.includes(host);
  if (ownOrigin && parts.length === 2 && parts[0] === "assets") {
    return [true, FINGERPRINTED_ASSET_PATTERN.test(parts[1] ?? "")];
  }
  if (host === null || !SUPABASE_HOST_PATTERN.test(host)) return keep;
  const [service = "", version = "", name = "", access = ""] = parts;
  if (!SUPABASE_SERVICES.has(service) || version !== "v1") return keep;
  keep[0] = true;
  keep[1] = true;
  if (parts.length < 3) return keep;
  if (service === "functions") keep[2] = KNOWN_EDGE_FUNCTIONS.has(name);
  else if (service === "auth") keep[2] = KNOWN_AUTH_ENDPOINTS.has(name);
  else if (service === "rest") keep[2] = name === "rpc";
  else if (service === "realtime") keep[2] = name === "websocket";
  else if (service === "storage" && name === "object") {
    keep[2] = true;
    if (parts.length > 3) keep[3] = STORAGE_ACCESS_SEGMENTS.has(access);
  }
  return keep;
}

/**
 * Keeps only code-owned path segments (see `keptSegmentMask`). Every other segment is
 * data — a grower label, a file name, a token, possibly percent-encoded any number of
 * times — so UUIDs become `:id` and the rest `:redacted`, without decoding.
 */
function redactPathSegments(path: string, host: string | null): string {
  const parts = path.split("/").slice(1);
  const keep = keptSegmentMask(parts, host);
  const kept = parts.map((segment, index) => {
    if (keep[index] || segment === "") return segment;
    return UUID_SEGMENT_PATTERN.test(segment) ? ":id" : ":redacted";
  });
  return path.startsWith("/") ? `/${kept.join("/")}` : kept.join("/");
}

/** Reduces an http(s) URL to origin + its code-owned path segments, the rest replaced (see `redactPathSegments`); any other scheme becomes `scheme:[redacted]`. Relative or unparsable input keeps only the part before `?`/`#`. */
export function scrubUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const url = new URL(value);
    // Only http(s) has an origin + path worth keeping. data:, javascript:, blob:,
    // extension and other schemes can carry a payload in what follows the scheme.
    if (url.protocol !== "http:" && url.protocol !== "https:") return `${url.protocol}${REDACTED}`;
    return `${url.origin}${redactPathSegments(url.pathname, url.hostname)}`;
  } catch {
    return redactPathSegments(value.split(/[?#]/, 1)[0] ?? "", null);
  }
}

// ── Page routes ──────────────────────────────────────────────────────────────

export const UNMATCHED_ROUTE = "/:unmatched";

const ROUTE_TEMPLATES: ReadonlyArray<ReadonlyArray<string>> = APP_ROUTES.map((route) => route.path)
  .filter((path) => path.startsWith("/"))
  .map((path) => path.split("/").filter(Boolean));

/**
 * The manifest route a pathname renders, as its template (`/plants/:id`); the most
 * specific match wins, so `/pheno-hunts/new` beats `/pheno-hunts/:id`. A path that only
 * the catch-all would render returns `/:unmatched`: its segments came from a link, not code.
 */
export function routeTemplateFor(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  let best: ReadonlyArray<string> | null = null;
  let bestStatic = -1;
  for (const template of ROUTE_TEMPLATES) {
    if (template.length !== segments.length) continue;
    let staticCount = 0;
    const matches = template.every((part, index) => {
      if (part.startsWith(":")) return true;
      staticCount++;
      return part === segments[index];
    });
    if (matches && staticCount > bestStatic) {
      best = template;
      bestStatic = staticCount;
    }
  }
  return best ? `/${best.join("/")}` : UNMATCHED_ROUTE;
}

/** Like `scrubUrl`, for an in-app page URL: the pathname is replaced by its route template. */
export function scrubRouteUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return scrubUrl(value);
      return `${url.origin}${routeTemplateFor(url.pathname)}`;
    } catch {
      return scrubUrl(value);
    }
  }
  return routeTemplateFor(value.split(/[?#]/, 1)[0] ?? "");
}

// ── Free-text summary ────────────────────────────────────────────────────────
//
// Pattern scrubbing cannot recognise grower-authored text (a plant name, a diary
// note) inside an error message, and provider messages forwarded verbatim can carry
// row values. So event messages, exception values and breadcrumb messages never
// leave as text: only an allowlisted summary does — the code-defined scope prefix,
// a SQLSTATE/PostgREST code and an HTTP status. Nothing derived from the rest of the
// text is sent, not even a hash: grower text is low-entropy, so any digest of it could
// be confirmed by guessing. Grouping relies on the summary and the scrubbed stack.

const SCOPE_PREFIX_PATTERN = /^\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\s*:/;
/**
 * Every scope the repository's own throw sites put in front of a forwarded provider
 * message (`fail()` in `growRepo.ts` and `db.ts`, plus three direct throws). A scope not
 * listed here is grower text that happens to look like one, so it is not reported;
 * a new throw site reports only `[redacted]` until it is added.
 */
export const KNOWN_ERROR_SCOPES: ReadonlySet<string> = new Set([
  ...[
    "fetchTents",
    "fetchTent",
    "fetchPlants",
    "fetchPlant",
    "fetchSensorReadings",
    "insertSensorReading",
    "insertSensorReadingsBatch",
  ].map((name) => `growRepo.${name}`),
  ...[
    "fetchGrowRows",
    "fetchGrowRow",
    "insertGrowRow",
    "updateGrowRow",
    "archiveGrow",
    "fetchDiaryEntryRows",
    "insertDiaryEntryRow",
    "updateDiaryEntryRow",
    "deleteDiaryEntry",
    "fetchHarvestRows",
    "insertHarvestRow",
    "fetchProfileRow",
    "fetchUserRoles",
    "assignRole",
    "fetchUnlockRows",
    "fetchUserQuestRows",
  ].map((name) => `db.${name}`),
  "piIngestIdempotencyRepo.insertPiIngestIdempotencyKeys",
  "permissions.moderatePlantAsOperator",
]);
const POSTGREST_CODE_PATTERN = /\bPGRST\d{3}\b/;
/** PostgreSQL's SQLSTATE classes (Appendix A); a five-character value outside them is not reported. */
const SQLSTATE_CLASSES = String.raw`0[0-389ABFLPZ]|10|2[0-8BDF]|3[489BDF]|4[024]|5[3-578]|72|F0|HV|P0|XX`;
const SQLSTATE_PATTERN = new RegExp(
  String.raw`\bsqlstate\b["'\s:=]*((?:${SQLSTATE_CLASSES})[0-9A-Z]{3})\b`,
  "i",
);
const HTTP_STATUS_PATTERN = /\b(?:status(?:[\s_-]?code)?|HTTP)\b["'\s:=]*([1-5]\d{2})\b/i;
/** The message `normalizeCaughtError` builds for a thrown `Response`. */
const CAUGHT_RESPONSE_PATTERN = /^Response ([1-5]\d{2})(?: at |$)/;
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]{0,63}$/;

/**
 * Reduces a free-text message to `scope code=… status=…`, or `[redacted]` when code wrote
 * none of those fields; empty stays empty.
 * A field is kept only when code put it there: the scope must be in `KNOWN_ERROR_SCOPES`,
 * a code or status is read only after such a scope (where the rest is a provider message,
 * and a code needs an explicit `PGRST###` or `SQLSTATE` label), and the only other status
 * kept is the one `normalizeCaughtError` writes for a thrown `Response`.
 */
export function summarizeErrorText(value: unknown): string {
  if (typeof value !== "string" || value === "") return "";
  const parts: string[] = [];
  const scope = SCOPE_PREFIX_PATTERN.exec(value)?.[1];
  if (scope && KNOWN_ERROR_SCOPES.has(scope)) {
    parts.push(scope);
    const code =
      POSTGREST_CODE_PATTERN.exec(value)?.[0] ?? SQLSTATE_PATTERN.exec(value)?.[1]?.toUpperCase();
    if (code) parts.push(`code=${code}`);
    const status = HTTP_STATUS_PATTERN.exec(value)?.[1];
    if (status) parts.push(`status=${status}`);
  } else {
    const status = CAUGHT_RESPONSE_PATTERN.exec(value)?.[1];
    if (status) parts.push(`status=${status}`);
  }
  return parts.length > 0 ? parts.join(" ") : REDACTED;
}

/** Exception types are class names; anything else is free text and becomes `Error`. */
function safeExceptionType(type: string): string {
  return IDENTIFIER_PATTERN.test(type) ? type : "Error";
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
  if (typeof next.message === "string") next.message = summarizeErrorText(next.message);
  if (next.logentry) {
    const logentry: NonNullable<ReportableEvent["logentry"]> = {};
    if (typeof next.logentry.message === "string")
      logentry.message = summarizeErrorText(next.logentry.message);
    if (typeof next.logentry.formatted === "string")
      logentry.formatted = summarizeErrorText(next.logentry.formatted);
    next.logentry = logentry;
  }
  if (typeof next.transaction === "string") next.transaction = scrubRouteUrl(next.transaction);
  if (next.contexts) {
    const contexts: Record<string, unknown> = {};
    for (const name of ALLOWED_EVENT_CONTEXTS) {
      if (next.contexts[name] !== undefined) contexts[name] = next.contexts[name];
    }
    next.contexts = contexts;
  }
  if (next.request) {
    const request: ReportableRequest = {};
    if (typeof next.request.url === "string") request.url = scrubRouteUrl(next.request.url);
    next.request = request;
  }
  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map((ex) => ({
        ...ex,
        ...(typeof ex.type === "string" && { type: safeExceptionType(ex.type) }),
        ...(typeof ex.value === "string" && { value: summarizeErrorText(ex.value) }),
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
  if (typeof next.message === "string") next.message = summarizeErrorText(next.message);
  if (next.data) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next.data)) {
      if (key === "from" || key === "to") {
        // Navigation breadcrumbs: in-app page paths.
        data[key] = scrubRouteUrl(value);
      } else if (key === "url") {
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
  const route = typeof context?.route === "string" ? scrubRouteUrl(context.route) : "";
  return {
    tags: { source, handled },
    extra: route ? { route } : {},
  };
}
