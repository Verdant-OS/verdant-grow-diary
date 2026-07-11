/**
 * One-Tent managed-session preflight core (dependency-free JS mirror).
 *
 * The TypeScript helper e2e/helpers/lovableManagedSupabaseSession.ts is
 * the source of truth; this mirror keeps the preflight CLI free of any
 * TS/toolchain dependency. BOTH implementations are parity-locked by
 * src/test/one-tent-preflight-receipt.test.ts: the same env snapshot
 * must produce byte-identical ONE_TENT_PREFLIGHT_JSON receipts from
 * each copy. If you edit one, edit both — the parity test will fail on
 * any drift.
 *
 * Never returns or logs tokens, cookies, session JSON, or emails.
 * Pure: no I/O, no network, no Date.now, no randomness.
 */

export const MANAGED_SESSION_ENV = {
  status: "LOVABLE_BROWSER_AUTH_STATUS",
  sessionJson: "LOVABLE_BROWSER_SUPABASE_SESSION_JSON",
  storageKey: "LOVABLE_BROWSER_SUPABASE_STORAGE_KEY",
  cookiesJson: "LOVABLE_BROWSER_SUPABASE_COOKIES_JSON",
  cookiesJsonCanonical: "LOVABLE_BROWSER_COOKIES_JSON",
  supabaseUrl: "VITE_SUPABASE_URL",
  targetProjectRef: "LOVABLE_E2E_TARGET_PROJECT_REF",
};

export const ONE_TENT_PREFLIGHT_JSON_PREFIX = "ONE_TENT_PREFLIGHT_JSON=";

const VALID_SAME_SITE = { strict: "Strict", lax: "Lax", none: "None" };

function normalizeOneCookie(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  if (typeof raw.value !== "string") return null;
  const domain =
    typeof raw.domain === "string" && raw.domain.trim() ? raw.domain.trim() : undefined;
  const url = typeof raw.url === "string" && raw.url.trim() ? raw.url.trim() : undefined;
  if (!domain && !url) return null;
  const out = { name, value: raw.value, path: "/" };
  if (domain) out.domain = domain;
  if (url) out.url = url;
  if (raw.path !== undefined) {
    if (typeof raw.path !== "string" || !raw.path.startsWith("/")) return null;
    out.path = raw.path;
  }
  for (const key of ["httpOnly", "secure"]) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== "boolean") return null;
      out[key] = raw[key];
    }
  }
  if (raw.sameSite !== undefined) {
    if (typeof raw.sameSite !== "string") return null;
    const normalized = VALID_SAME_SITE[raw.sameSite.toLowerCase()];
    if (!normalized) return null;
    out.sameSite = normalized;
  }
  if (raw.expires !== undefined) {
    if (typeof raw.expires !== "number" || !Number.isFinite(raw.expires) || raw.expires <= 0) {
      return null;
    }
    out.expires = raw.expires;
  }
  return out;
}

export function parseManagedCookies(env) {
  const canonical = (env.canonical ?? "").trim();
  const legacy = (env.legacy ?? "").trim();
  if (canonical && legacy && canonical !== legacy) {
    return { ok: false, reason: "conflicting_cookie_sources" };
  }
  const raw = canonical || legacy;
  if (!raw) return { ok: true, provided: false, cookies: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid_cookies_json" };
  }
  let list;
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.cookies)) {
    list = parsed.cookies;
  } else {
    return { ok: false, reason: "invalid_cookies_json" };
  }
  const cookies = [];
  for (const item of list) {
    const normalized = normalizeOneCookie(item);
    if (!normalized) return { ok: false, reason: "invalid_cookies_json" };
    cookies.push(normalized);
  }
  return { ok: true, provided: true, cookies };
}

function cookieSourceVarNames(env) {
  const names = [];
  if ((env.cookiesJsonCanonical ?? "").trim()) names.push(MANAGED_SESSION_ENV.cookiesJsonCanonical);
  if ((env.cookiesJson ?? "").trim()) names.push(MANAGED_SESSION_ENV.cookiesJson);
  return names.length ? names.sort() : [MANAGED_SESSION_ENV.cookiesJsonCanonical];
}

export function evaluateManagedSession(env) {
  const authStatus = (env.authStatus ?? "").trim();
  const rawSession = (env.sessionJson ?? "").trim();
  const storageKey = (env.storageKey ?? "").trim();

  const blockedNoRestore = (reason, missing) => ({
    status: "blocked",
    reason,
    missing: [...missing].sort(),
    restoreStrategy: "none",
    cookies: [],
  });

  if (authStatus && authStatus !== "signed_in" && authStatus !== "injected") {
    return blockedNoRestore("reported_signed_out", [MANAGED_SESSION_ENV.status]);
  }

  const cookieResult = parseManagedCookies({
    canonical: env.cookiesJsonCanonical,
    legacy: env.cookiesJson,
  });
  if (!cookieResult.ok) {
    const missing =
      cookieResult.reason === "conflicting_cookie_sources"
        ? [MANAGED_SESSION_ENV.cookiesJson, MANAGED_SESSION_ENV.cookiesJsonCanonical]
        : cookieSourceVarNames(env);
    return blockedNoRestore(cookieResult.reason, missing);
  }
  const cookies = cookieResult.cookies;

  if (!rawSession) {
    if (!storageKey && cookies.length > 0) {
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

  let parsed;
  try {
    parsed = JSON.parse(rawSession);
  } catch {
    return blockedNoRestore("invalid_session_json", [MANAGED_SESSION_ENV.sessionJson]);
  }
  if (!parsed || typeof parsed !== "object") {
    return blockedNoRestore("invalid_session_json", [MANAGED_SESSION_ENV.sessionJson]);
  }
  const accessToken = typeof parsed.access_token === "string" ? parsed.access_token : "";
  if (!accessToken) {
    return blockedNoRestore("missing_access_token", ["session.access_token"]);
  }
  const user = parsed.user && typeof parsed.user === "object" ? parsed.user : null;
  const userId = user && typeof user.id === "string" ? user.id : "";
  if (!userId) {
    return blockedNoRestore("missing_user_id", ["session.user.id"]);
  }

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
      refresh_token: typeof parsed.refresh_token === "string" ? parsed.refresh_token : undefined,
      expires_at: typeof parsed.expires_at === "number" ? parsed.expires_at : undefined,
      user: {
        id: userId,
        email: typeof user.email === "string" ? user.email : undefined,
      },
    },
    cookies,
  };
}

function sessionFieldPresence(env) {
  const raw = (env.sessionJson ?? "").trim();
  if (!raw) return { accessToken: false, userId: false };
  try {
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return { accessToken: false, userId: false };
    const user = s.user && typeof s.user === "object" ? s.user : null;
    return {
      accessToken: typeof s.access_token === "string" && s.access_token.length > 0,
      userId: !!user && typeof user.id === "string" && user.id.length > 0,
    };
  } catch {
    return { accessToken: false, userId: false };
  }
}

export function buildManagedSessionPreflightReceipt(env, result) {
  const authStatus = (env.authStatus ?? "").trim();
  const managedAuthStatus = !authStatus
    ? "unknown"
    : authStatus === "signed_in" || authStatus === "injected"
      ? "signed_in"
      : "signed_out";

  const cookieResult = parseManagedCookies({
    canonical: env.cookiesJsonCanonical,
    legacy: env.cookiesJson,
  });
  const cookiesPresent = cookieResult.ok === true && cookieResult.cookies.length > 0;

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
    reason: ready ? null : result.reason,
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
    missing: ready ? [] : [...result.missing].sort(),
  };
}

export function renderManagedSessionPreflightReceipt(receipt) {
  return `${ONE_TENT_PREFLIGHT_JSON_PREFIX}${JSON.stringify(receipt)}`;
}

export function readManagedSessionEnv(source = {}) {
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
