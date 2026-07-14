/**
 * managed-session-materialize-core — pure helpers that turn a real Supabase
 * session (from a live login or an existing e2e/.auth snapshot) into the
 * LOVABLE_BROWSER_* managed-session env the One-Tent preflight/walk expects.
 *
 * Pure + deterministic. No network, no fs, no clock. The CLI wrapper
 * (materialize-managed-session.mjs) performs the login / file reads and calls
 * these. This module never fabricates a session — callers must supply a real
 * one; helpers only reshape and validate it.
 *
 * The whole point of this tooling: the managed injector (or an operator with
 * fixture credentials) produces a genuine supabase-js v2 Session; we emit the
 * FULL session verbatim under the app's real storage key so the browser walk
 * restores auth exactly as the app itself would have written it. Nothing here
 * is a shortcut around authentication.
 */

/**
 * Derive the supabase-js v2 default auth storage key: `sb-<ref>-auth-token`.
 * The project ref is the first DNS label of the Supabase URL host
 * (`https://<ref>.supabase.co`) or an explicitly provided project id.
 * Returns null when neither yields a usable ref.
 */
export function deriveSupabaseStorageKey({ supabaseUrl, projectId } = {}) {
  const explicit = typeof projectId === "string" ? projectId.trim() : "";
  if (explicit) return `sb-${explicit}-auth-token`;
  const url = typeof supabaseUrl === "string" ? supabaseUrl.trim() : "";
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  const ref = host.split(".")[0] ?? "";
  if (!ref) return null;
  return `sb-${ref}-auth-token`;
}

/**
 * Validate that a parsed session object is a complete supabase-js v2 session
 * usable by the browser walk. supabase-js `_isValidSession` requires
 * access_token AND refresh_token AND expires_at — a session missing any of
 * them passes the preflight's laxer check but is discarded by the app,
 * bouncing to /auth. This helper enforces the stricter, walk-ready contract.
 */
export function validateFullSession(session) {
  if (!session || typeof session !== "object") {
    return { ok: false, reason: "session_not_object" };
  }
  const missing = [];
  if (typeof session.access_token !== "string" || !session.access_token) {
    missing.push("access_token");
  }
  if (typeof session.refresh_token !== "string" || !session.refresh_token) {
    missing.push("refresh_token");
  }
  if (typeof session.expires_at !== "number" || !Number.isFinite(session.expires_at)) {
    missing.push("expires_at");
  }
  const user = session.user && typeof session.user === "object" ? session.user : null;
  if (!user || typeof user.id !== "string" || !user.id) {
    missing.push("user.id");
  }
  if (missing.length > 0) {
    return { ok: false, reason: "incomplete_session", missing: missing.sort() };
  }
  return { ok: true };
}

/**
 * Extract the verbatim session JSON string that supabase-js stored in
 * sessionStorage from an e2e/.auth/session-storage.json snapshot
 * (`{ origin, entries: { <storageKey>: <verbatim JSON string> } }`).
 * Returns { storageKey, sessionJson } or null when no auth-token entry.
 */
export function extractSessionFromStorageSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const entries = snapshot.entries;
  if (!entries || typeof entries !== "object") return null;
  for (const [key, value] of Object.entries(entries)) {
    // supabase-js v2 key shape: sb-<ref>-auth-token.
    if (/^sb-.+-auth-token$/.test(key) && typeof value === "string" && value) {
      return { storageKey: key, sessionJson: value };
    }
  }
  return null;
}

/**
 * Build the managed-session env map from a complete session + storage key.
 * Emits the canonical env var names. Cookies are intentionally omitted:
 * this app authenticates from sessionStorage, not cookies, so
 * restore_strategy "storage_session" is the correct, minimal shape.
 */
export function buildManagedSessionEnv({ sessionJson, storageKey, projectRef }) {
  const env = {
    LOVABLE_BROWSER_AUTH_STATUS: "signed_in",
    LOVABLE_BROWSER_SUPABASE_SESSION_JSON: sessionJson,
    LOVABLE_BROWSER_SUPABASE_STORAGE_KEY: storageKey,
  };
  if (typeof projectRef === "string" && projectRef.trim()) {
    env.LOVABLE_E2E_TARGET_PROJECT_REF = projectRef.trim();
  }
  return env;
}

/** Serialize an env map to `KEY=$'...'`-safe dotenv lines (single-quoted). */
export function serializeEnvFile(env) {
  return (
    Object.entries(env)
      .map(([k, v]) => `${k}=${JSON.stringify(String(v))}`)
      .join("\n") + "\n"
  );
}
