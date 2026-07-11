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
 *
 * Consumers:
 *   scripts/e2e/lovable-managed-session-preflight.mjs (CLI)
 *   e2e/one-tent-loop-golden-path-ui.spec.ts          (browser restore)
 *   src/test/lovable-managed-session-preflight.test.ts
 */

export const MANAGED_SESSION_ENV = {
  status: "LOVABLE_BROWSER_AUTH_STATUS",
  sessionJson: "LOVABLE_BROWSER_SUPABASE_SESSION_JSON",
  storageKey: "LOVABLE_BROWSER_SUPABASE_STORAGE_KEY",
  cookiesJson: "LOVABLE_BROWSER_SUPABASE_COOKIES_JSON",
} as const;

export type ManagedSessionBlockedReason =
  | "reported_signed_out"
  | "missing_session_json"
  | "missing_storage_key"
  | "invalid_session_json"
  | "missing_access_token"
  | "missing_user_id";

export interface ManagedSessionReady {
  status: "ready";
  storageKey: string;
  session: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    user: { id: string; email?: string };
  };
  cookies: unknown[];
}

export interface ManagedSessionBlocked {
  status: "blocked";
  reason: ManagedSessionBlockedReason;
  missing: string[];
}

export type ManagedSessionPreflightResult =
  | ManagedSessionReady
  | ManagedSessionBlocked;

export interface ManagedSessionEnvSnapshot {
  authStatus?: string | null;
  sessionJson?: string | null;
  storageKey?: string | null;
  cookiesJson?: string | null;
}

/**
 * Pure preflight evaluation. Given a snapshot of the four env values,
 * decide whether the injected managed browser session is safe to use.
 * Does no I/O of any kind.
 */
export function evaluateManagedSession(
  env: ManagedSessionEnvSnapshot,
): ManagedSessionPreflightResult {
  const authStatus = (env.authStatus ?? "").trim();
  const rawSession = (env.sessionJson ?? "").trim();
  const storageKey = (env.storageKey ?? "").trim();
  const rawCookies = (env.cookiesJson ?? "").trim();

  if (authStatus && authStatus !== "signed_in" && authStatus !== "injected") {
    return {
      status: "blocked",
      reason: "reported_signed_out",
      missing: [MANAGED_SESSION_ENV.status],
    };
  }

  if (!rawSession) {
    return {
      status: "blocked",
      reason: "missing_session_json",
      missing: [MANAGED_SESSION_ENV.sessionJson],
    };
  }

  if (!storageKey) {
    return {
      status: "blocked",
      reason: "missing_storage_key",
      missing: [MANAGED_SESSION_ENV.storageKey],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSession);
  } catch {
    return {
      status: "blocked",
      reason: "invalid_session_json",
      missing: [MANAGED_SESSION_ENV.sessionJson],
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      status: "blocked",
      reason: "invalid_session_json",
      missing: [MANAGED_SESSION_ENV.sessionJson],
    };
  }

  const s = parsed as Record<string, unknown>;
  const accessToken = typeof s.access_token === "string" ? s.access_token : "";
  if (!accessToken) {
    return {
      status: "blocked",
      reason: "missing_access_token",
      missing: ["session.access_token"],
    };
  }

  const user =
    s.user && typeof s.user === "object" ? (s.user as Record<string, unknown>) : null;
  const userId = user && typeof user.id === "string" ? user.id : "";
  if (!userId) {
    return {
      status: "blocked",
      reason: "missing_user_id",
      missing: ["session.user.id"],
    };
  }

  let cookies: unknown[] = [];
  if (rawCookies) {
    try {
      const c = JSON.parse(rawCookies);
      if (Array.isArray(c)) cookies = c;
    } catch {
      // Cookies are optional; ignore parse failure.
    }
  }

  return {
    status: "ready",
    storageKey,
    session: {
      access_token: accessToken,
      refresh_token:
        typeof s.refresh_token === "string" ? s.refresh_token : undefined,
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
  const hasCookies = !!(env.cookiesJson && env.cookiesJson.trim());
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

/** Read a snapshot from `process.env`. Kept isolated so tests stay pure. */
export function readManagedSessionEnv(
  source: Record<string, string | undefined> = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {},
): ManagedSessionEnvSnapshot {
  return {
    authStatus: source[MANAGED_SESSION_ENV.status] ?? null,
    sessionJson: source[MANAGED_SESSION_ENV.sessionJson] ?? null,
    storageKey: source[MANAGED_SESSION_ENV.storageKey] ?? null,
    cookiesJson: source[MANAGED_SESSION_ENV.cookiesJson] ?? null,
  };
}
