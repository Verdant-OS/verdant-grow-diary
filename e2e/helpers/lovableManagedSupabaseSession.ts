/**
 * Lovable managed browser Supabase session — pure preflight + Playwright
 * restore helpers for the One-Tent Loop authenticated proof.
 *
 * Contract:
 *  - Pure evaluation of a snapshot of environment variables. No I/O,
 *    no network, no Supabase, no filesystem, no process reads inside
 *    `evaluateManagedSession`.
 *  - Fails closed on any missing or malformed value.
 *  - Never returns or logs tokens, cookies, or full session JSON — the
 *    caller MUST redact everything below.
 *  - Safe diagnostics contain only:
 *      status, reason, missing[], hasStorageKey, hasSessionJson,
 *      hasCookies, hasUserId, hasAccessToken
 *  - Deterministic machine-readable receipts: the same env snapshot
 *    always renders byte-identical ONE_TENT_PREFLIGHT_JSON output.
 *
 * Cookie policy (documented conservative rule):
 *  - Canonical variable LOVABLE_BROWSER_COOKIES_JSON wins; legacy
 *    LOVABLE_BROWSER_SUPABASE_COOKIES_JSON is accepted as fallback.
 *  - If BOTH are present and differ (after trim), preflight fails
 *    closed with `conflicting_cookie_sources`. We never silently pick.
 *  - Malformed cookie JSON ALWAYS blocks — even when a complete valid
 *    storage session exists. A supplied-but-unusable cookie payload is
 *    treated as operator error, not optional diagnostics, because
 *    silently dropping it would make the restored browser state differ
 *    from what the operator believes was restored.
 *  - Cookie validation is all-or-nothing: any malformed cookie in the
 *    set blocks restoration. No partial restore of mixed sets.
 *
 * Cookie-only capability (documented):
 *  - signed_in + valid non-empty cookies + NO session JSON + NO storage
 *    key ⇒ the browser MAY be able to restore an authenticated shell
 *    (`restore_strategy: "cookies_only"`, `browser_restore: true`), but
 *    the FULL proof stays blocked (`cookie_only_seed_unavailable`)
 *    because the seed and row-level assertions require the managed
 *    user id + access token, which cookies alone do not safely yield.
 *
 * Consumers:
 *   scripts/e2e/lovable-managed-session-preflight.mjs (CLI — parity
 *     locked against this file by src/test/one-tent-preflight-receipt.test.ts)
 *   e2e/one-tent-loop-golden-path-ui.spec.ts          (browser restore)
 *   src/test/lovable-managed-session-preflight.test.ts
 *   src/test/one-tent-cookie-restoration.test.ts
 */

export const MANAGED_SESSION_ENV = {
  status: "LOVABLE_BROWSER_AUTH_STATUS",
  sessionJson: "LOVABLE_BROWSER_SUPABASE_SESSION_JSON",
  storageKey: "LOVABLE_BROWSER_SUPABASE_STORAGE_KEY",
  /** Legacy cookie variable — still accepted as a fallback. */
  cookiesJson: "LOVABLE_BROWSER_SUPABASE_COOKIES_JSON",
  /** Canonical cookie variable — takes precedence when legacy is absent. */
  cookiesJsonCanonical: "LOVABLE_BROWSER_COOKIES_JSON",
  supabaseUrl: "VITE_SUPABASE_URL",
  targetProjectRef: "LOVABLE_E2E_TARGET_PROJECT_REF",
} as const;

export type ManagedSessionBlockedReason =
  | "reported_signed_out"
  | "missing_session_json"
  | "missing_storage_key"
  | "invalid_session_json"
  | "missing_access_token"
  | "missing_user_id"
  | "invalid_cookies_json"
  | "conflicting_cookie_sources"
  | "cookie_only_seed_unavailable"
  | "target_project_mismatch";

export type ManagedSessionRestoreStrategy =
  "storage_session" | "storage_plus_cookies" | "cookies_only" | "none";

/** A validated, normalized cookie safe to hand to Playwright addCookies. */
export interface NormalizedManagedCookie {
  name: string;
  value: string;
  domain?: string;
  url?: string;
  path: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expires?: number;
}

export type ManagedCookieParseResult =
  | { ok: true; provided: boolean; cookies: NormalizedManagedCookie[] }
  | { ok: false; reason: "invalid_cookies_json" | "conflicting_cookie_sources" };

export interface ManagedSessionReady {
  status: "ready";
  storageKey: string;
  restoreStrategy: "storage_session" | "storage_plus_cookies";
  session: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    user: { id: string; email?: string };
  };
  cookies: NormalizedManagedCookie[];
}

export interface ManagedSessionBlocked {
  status: "blocked";
  reason: ManagedSessionBlockedReason;
  missing: string[];
  /**
   * cookie_only_seed_unavailable is the one blocked state that still
   * carries browser-restore capability: validated cookies + strategy.
   */
  restoreStrategy: ManagedSessionRestoreStrategy;
  cookies: NormalizedManagedCookie[];
}

export type ManagedSessionPreflightResult = ManagedSessionReady | ManagedSessionBlocked;

export interface ManagedSessionEnvSnapshot {
  authStatus?: string | null;
  sessionJson?: string | null;
  storageKey?: string | null;
  /** Legacy cookie env value (LOVABLE_BROWSER_SUPABASE_COOKIES_JSON). */
  cookiesJson?: string | null;
  /** Canonical cookie env value (LOVABLE_BROWSER_COOKIES_JSON). */
  cookiesJsonCanonical?: string | null;
  supabaseUrl?: string | null;
  targetProjectRef?: string | null;
}

const VALID_SAME_SITE: Record<string, "Strict" | "Lax" | "None"> = {
  strict: "Strict",
  lax: "Lax",
  none: "None",
};

function normalizeOneCookie(raw: unknown): NormalizedManagedCookie | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  const name = typeof c.name === "string" ? c.name.trim() : "";
  if (!name) return null;
  if (typeof c.value !== "string") return null;
  const domain = typeof c.domain === "string" && c.domain.trim() ? c.domain.trim() : undefined;
  const url = typeof c.url === "string" && c.url.trim() ? c.url.trim() : undefined;
  if (!domain && !url) return null;
  const out: NormalizedManagedCookie = { name, value: c.value, path: "/" };
  if (domain) out.domain = domain;
  if (url) out.url = url;
  if (c.path !== undefined) {
    if (typeof c.path !== "string" || !c.path.startsWith("/")) return null;
    out.path = c.path;
  }
  // Boolean fields: absent = omitted; present-but-not-boolean = malformed
  // (all-or-nothing policy — a wrong-typed field marks the payload bad).
  for (const key of ["httpOnly", "secure"] as const) {
    if (c[key] !== undefined) {
      if (typeof c[key] !== "boolean") return null;
      out[key] = c[key] as boolean;
    }
  }
  if (c.sameSite !== undefined) {
    if (typeof c.sameSite !== "string") return null;
    const normalized = VALID_SAME_SITE[c.sameSite.toLowerCase()];
    if (!normalized) return null;
    out.sameSite = normalized;
  }
  if (c.expires !== undefined) {
    if (typeof c.expires !== "number" || !Number.isFinite(c.expires) || c.expires <= 0) {
      return null;
    }
    out.expires = c.expires;
  }
  return out;
}

/**
 * Pure cookie parse + validation. Never throws; never logs; never
 * includes cookie values in any failure reason.
 */
export function parseManagedCookies(env: {
  canonical?: string | null;
  legacy?: string | null;
}): ManagedCookieParseResult {
  const canonical = (env.canonical ?? "").trim();
  const legacy = (env.legacy ?? "").trim();
  if (canonical && legacy && canonical !== legacy) {
    return { ok: false, reason: "conflicting_cookie_sources" };
  }
  const raw = canonical || legacy;
  if (!raw) return { ok: true, provided: false, cookies: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid_cookies_json" };
  }
  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as Record<string, unknown>).cookies)
  ) {
    // Documented safe wrapper shape: { "cookies": [...] }.
    list = (parsed as Record<string, unknown>).cookies as unknown[];
  } else {
    return { ok: false, reason: "invalid_cookies_json" };
  }

  const cookies: NormalizedManagedCookie[] = [];
  for (const item of list) {
    const normalized = normalizeOneCookie(item);
    // All-or-nothing: one malformed cookie blocks the whole set.
    if (!normalized) return { ok: false, reason: "invalid_cookies_json" };
    cookies.push(normalized);
  }
  return { ok: true, provided: true, cookies };
}

function cookieSourceVarNames(env: ManagedSessionEnvSnapshot): string[] {
  const names: string[] = [];
  if ((env.cookiesJsonCanonical ?? "").trim()) names.push(MANAGED_SESSION_ENV.cookiesJsonCanonical);
  if ((env.cookiesJson ?? "").trim()) names.push(MANAGED_SESSION_ENV.cookiesJson);
  return names.length ? names.sort() : [MANAGED_SESSION_ENV.cookiesJsonCanonical];
}

/**
 * Pure preflight evaluation. Given a snapshot of the env values,
 * decide whether the injected managed browser session is safe to use.
 * Does no I/O of any kind.
 */
export function evaluateManagedSession(
  env: ManagedSessionEnvSnapshot,
): ManagedSessionPreflightResult {
  const authStatus = (env.authStatus ?? "").trim();
  const rawSession = (env.sessionJson ?? "").trim();
  const storageKey = (env.storageKey ?? "").trim();

  const blockedNoRestore = (
    reason: ManagedSessionBlockedReason,
    missing: string[],
  ): ManagedSessionBlocked => ({
    status: "blocked",
    reason,
    missing: [...missing].sort(),
    restoreStrategy: "none",
    cookies: [],
  });

  if (authStatus && authStatus !== "signed_in" && authStatus !== "injected") {
    return blockedNoRestore("reported_signed_out", [MANAGED_SESSION_ENV.status]);
  }

  // Cookies are evaluated FIRST so the conservative malformed-cookie rule
  // holds even when a complete storage session exists.
  const cookieResult = parseManagedCookies({
    canonical: env.cookiesJsonCanonical,
    legacy: env.cookiesJson,
  });
  if (cookieResult.ok === false) {
    const missing =
      cookieResult.reason === "conflicting_cookie_sources"
        ? [MANAGED_SESSION_ENV.cookiesJson, MANAGED_SESSION_ENV.cookiesJsonCanonical]
        : cookieSourceVarNames(env);
    return blockedNoRestore(cookieResult.reason, missing);
  }
  const cookies = cookieResult.cookies;

  if (!rawSession) {
    if (!storageKey && cookies.length > 0) {
      // Cookie-only: browser restore MAY work, but seed/row assertions
      // cannot safely resolve the managed identity. Full proof: blocked.
      return {
        status: "blocked",
        reason: "cookie_only_seed_unavailable",
        missing: [MANAGED_SESSION_ENV.sessionJson, MANAGED_SESSION_ENV.storageKey].sort(),
        restoreStrategy: "cookies_only",
        cookies,
      };
    }
    return blockedNoRestore("missing_session_json", [MANAGED_SESSION_ENV.sessionJson]);
  }

  if (!storageKey) {
    return blockedNoRestore("missing_storage_key", [MANAGED_SESSION_ENV.storageKey]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSession);
  } catch {
    return blockedNoRestore("invalid_session_json", [MANAGED_SESSION_ENV.sessionJson]);
  }

  if (!parsed || typeof parsed !== "object") {
    return blockedNoRestore("invalid_session_json", [MANAGED_SESSION_ENV.sessionJson]);
  }

  const s = parsed as Record<string, unknown>;
  const accessToken = typeof s.access_token === "string" ? s.access_token : "";
  if (!accessToken) {
    return blockedNoRestore("missing_access_token", ["session.access_token"]);
  }

  const user = s.user && typeof s.user === "object" ? (s.user as Record<string, unknown>) : null;
  const userId = user && typeof user.id === "string" ? user.id : "";
  if (!userId) {
    return blockedNoRestore("missing_user_id", ["session.user.id"]);
  }

  // Target-project belt-and-suspenders (pure string check, mirrors the
  // seed script): when a target ref is DECLARED it must match the
  // configured Supabase URL host. Undeclared ref does not block.
  const targetRef = (env.targetProjectRef ?? "").trim();
  const supabaseUrl = (env.supabaseUrl ?? "").trim();
  if (targetRef && supabaseUrl) {
    let host = "";
    try {
      host = new URL(supabaseUrl).host;
    } catch {
      host = "";
    }
    if (!host.startsWith(`${targetRef}.`)) {
      return blockedNoRestore("target_project_mismatch", [MANAGED_SESSION_ENV.targetProjectRef]);
    }
  }

  return {
    status: "ready",
    storageKey,
    restoreStrategy: cookies.length > 0 ? "storage_plus_cookies" : "storage_session",
    session: {
      access_token: accessToken,
      refresh_token: typeof s.refresh_token === "string" ? s.refresh_token : undefined,
      expires_at: typeof s.expires_at === "number" ? s.expires_at : undefined,
      user: {
        id: userId,
        email: typeof user!.email === "string" ? (user!.email as string) : undefined,
      },
    },
    cookies,
  };
}

/**
 * Machine-readable summary that is SAFE to log. Never includes any
 * token, cookie contents, or full session JSON. Deterministic for the
 * same input snapshot.
 */
export interface ManagedSessionSafeDiagnostics {
  status: "ready" | "blocked";
  reason?: ManagedSessionBlockedReason;
  missing: string[];
  hasStorageKey: boolean;
  hasSessionJson: boolean;
  hasCookies: boolean;
  hasUserId: boolean;
  hasAccessToken: boolean;
}

export function buildSafeDiagnostics(
  env: ManagedSessionEnvSnapshot,
  result: ManagedSessionPreflightResult,
): ManagedSessionSafeDiagnostics {
  const hasStorageKey = !!(env.storageKey && env.storageKey.trim());
  const hasSessionJson = !!(env.sessionJson && env.sessionJson.trim());
  const hasCookies = !!(
    (env.cookiesJson && env.cookiesJson.trim()) ||
    (env.cookiesJsonCanonical && env.cookiesJsonCanonical.trim())
  );
  const hasUserId = result.status === "ready";
  const hasAccessToken = result.status === "ready";
  if (result.status === "ready") {
    return {
      status: "ready",
      missing: [],
      hasStorageKey,
      hasSessionJson,
      hasCookies,
      hasUserId,
      hasAccessToken,
    };
  }
  return {
    status: "blocked",
    reason: result.reason,
    missing: result.missing,
    hasStorageKey,
    hasSessionJson,
    hasCookies,
    hasUserId,
    hasAccessToken,
  };
}

// ---------------------------------------------------------------------------
// Versioned deterministic preflight receipt (ONE_TENT_PREFLIGHT_JSON=…)
// ---------------------------------------------------------------------------

export const ONE_TENT_PREFLIGHT_JSON_PREFIX = "ONE_TENT_PREFLIGHT_JSON=";

export interface ManagedSessionPreflightReceipt {
  schema_version: "1";
  proof: "one-tent-loop-authenticated-ui";
  status: "ready" | "blocked";
  reason: null | ManagedSessionBlockedReason;
  restore_strategy: ManagedSessionRestoreStrategy;
  capabilities: {
    browser_restore: boolean;
    authenticated_seed: boolean;
    full_browser_proof: boolean;
  };
  managed_auth_status: "signed_in" | "signed_out" | "unknown";
  storage_key_present: boolean;
  session_present: boolean;
  cookies_present: boolean;
  access_token_present: boolean;
  user_id_present: boolean;
  target_project_verified: boolean;
  missing: string[];
}

function sessionFieldPresence(env: ManagedSessionEnvSnapshot): {
  accessToken: boolean;
  userId: boolean;
} {
  const raw = (env.sessionJson ?? "").trim();
  if (!raw) return { accessToken: false, userId: false };
  try {
    const s = JSON.parse(raw) as Record<string, unknown> | null;
    if (!s || typeof s !== "object") return { accessToken: false, userId: false };
    const user = s.user && typeof s.user === "object" ? (s.user as Record<string, unknown>) : null;
    return {
      accessToken: typeof s.access_token === "string" && s.access_token.length > 0,
      userId: !!user && typeof user.id === "string" && (user.id as string).length > 0,
    };
  } catch {
    return { accessToken: false, userId: false };
  }
}

export function buildManagedSessionPreflightReceipt(
  env: ManagedSessionEnvSnapshot,
  result: ManagedSessionPreflightResult,
): ManagedSessionPreflightReceipt {
  const authStatus = (env.authStatus ?? "").trim();
  const managedAuthStatus: ManagedSessionPreflightReceipt["managed_auth_status"] = !authStatus
    ? "unknown"
    : authStatus === "signed_in" || authStatus === "injected"
      ? "signed_in"
      : "signed_out";

  const cookieResult = parseManagedCookies({
    canonical: env.cookiesJsonCanonical,
    legacy: env.cookiesJson,
  });
  // cookies_present = one or more VALIDATED cookies were provided.
  const cookiesPresent = cookieResult.ok && cookieResult.cookies.length > 0;

  const targetRef = (env.targetProjectRef ?? "").trim();
  const supabaseUrl = (env.supabaseUrl ?? "").trim();
  let targetProjectVerified = false;
  if (targetRef && supabaseUrl) {
    try {
      targetProjectVerified = new URL(supabaseUrl).host.startsWith(`${targetRef}.`);
    } catch {
      targetProjectVerified = false;
    }
  }

  const presence = sessionFieldPresence(env);
  const ready = result.status === "ready";
  const cookieOnly =
    result.status === "blocked" && result.reason === "cookie_only_seed_unavailable";

  return {
    schema_version: "1",
    proof: "one-tent-loop-authenticated-ui",
    status: result.status,
    reason: ready ? null : (result as ManagedSessionBlocked).reason,
    restore_strategy: result.restoreStrategy,
    capabilities: {
      browser_restore: ready || cookieOnly,
      authenticated_seed: ready,
      full_browser_proof: ready,
    },
    managed_auth_status: managedAuthStatus,
    storage_key_present: !!(env.storageKey && env.storageKey.trim()),
    session_present: !!(env.sessionJson && env.sessionJson.trim()),
    cookies_present: cookiesPresent,
    access_token_present: presence.accessToken,
    user_id_present: presence.userId,
    target_project_verified: targetProjectVerified,
    missing: ready ? [] : [...(result as ManagedSessionBlocked).missing].sort(),
  };
}

/**
 * Deterministic one-line serialization. Key order is the literal
 * insertion order of `buildManagedSessionPreflightReceipt` — stable by
 * construction. No timestamps, no randomness, no paths.
 */
export function renderManagedSessionPreflightReceipt(
  receipt: ManagedSessionPreflightReceipt,
): string {
  return `${ONE_TENT_PREFLIGHT_JSON_PREFIX}${JSON.stringify(receipt)}`;
}

/** Read a snapshot from `process.env`. Kept isolated so tests stay pure. */
export function readManagedSessionEnv(
  source: Record<string, string | undefined> = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env ?? {},
): ManagedSessionEnvSnapshot {
  return {
    authStatus: source[MANAGED_SESSION_ENV.status] ?? null,
    sessionJson: source[MANAGED_SESSION_ENV.sessionJson] ?? null,
    storageKey: source[MANAGED_SESSION_ENV.storageKey] ?? null,
    cookiesJson: source[MANAGED_SESSION_ENV.cookiesJson] ?? null,
    cookiesJsonCanonical: source[MANAGED_SESSION_ENV.cookiesJsonCanonical] ?? null,
    supabaseUrl: source[MANAGED_SESSION_ENV.supabaseUrl] ?? null,
    targetProjectRef: source[MANAGED_SESSION_ENV.targetProjectRef] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Cookie restoration (dependency-injected so tests never need a browser)
// ---------------------------------------------------------------------------

export interface CookieRestoreContextLike {
  addCookies(cookies: ReadonlyArray<Record<string, unknown>>): Promise<void>;
}
export interface CookieRestorePageLike {
  goto(url: string): Promise<unknown>;
}

/**
 * Restore validated managed cookies into a browser context BEFORE any
 * navigation. All-or-nothing: caller must pass already-validated
 * cookies from `parseManagedCookies`/`evaluateManagedSession`. Never
 * logs cookie names or values.
 *
 * Returns safe diagnostics only (counts + attempted flag).
 */
export async function restoreManagedCookiesBeforeNavigation(
  context: CookieRestoreContextLike,
  page: CookieRestorePageLike,
  cookies: ReadonlyArray<NormalizedManagedCookie>,
  firstUrl: string,
): Promise<{ cookieCount: number; restorationAttempted: boolean }> {
  if (cookies.length > 0) {
    // Playwright accepts either url or domain+path per cookie; our
    // normalizer guarantees one of them is present.
    await context.addCookies(cookies.map((c) => ({ ...c })));
  }
  await page.goto(firstUrl);
  return { cookieCount: cookies.length, restorationAttempted: cookies.length > 0 };
}
