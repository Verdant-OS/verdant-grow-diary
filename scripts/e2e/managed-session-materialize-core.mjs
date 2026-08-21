/**
 * managed-session-materialize-core — pure helpers that turn a real Supabase
 * session (from a live login or an existing e2e/.auth snapshot) into the
 * LOVABLE_BROWSER_* managed-session env the One-Tent preflight/walk expects.
 *
 * Validation helpers are pure + deterministic. The bounded public-response
 * consumer only reads an injected response stream; it performs no network
 * request, fs access, or clock read. The CLI wrapper
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
 * Resolve the one canonical HTTPS origin for an explicitly pinned Supabase
 * project. Returns null for lookalike hosts, credentials, paths, query/hash,
 * non-HTTPS schemes, nondefault ports, or malformed refs.
 */
export function resolveExactSupabaseProjectOrigin({ supabaseUrl, targetProjectRef } = {}) {
  const ref = typeof targetProjectRef === "string" ? targetProjectRef.trim() : "";
  const rawUrl = typeof supabaseUrl === "string" ? supabaseUrl.trim() : "";
  if (!/^[a-z0-9]{20}$/.test(ref) || !rawUrl) return null;
  const expectedOrigin = `https://${ref}.supabase.co`;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.origin !== expectedOrigin) return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return expectedOrigin;
  } catch {
    return null;
  }
}

/**
 * Compare the public version record with identity derived from the exact
 * checked-out commit. Returns only fixed reason codes; it never reflects
 * hashes, response bodies, or other caller-controlled detail.
 */
export function evaluatePublicDeploymentIdentity({ version, expectedSha, expectedTreeHash } = {}) {
  if (
    typeof expectedSha !== "string" ||
    !/^[0-9a-f]{40}$/.test(expectedSha) ||
    typeof expectedTreeHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(expectedTreeHash)
  ) {
    return { ok: false, reason: "invalid_expected_identity" };
  }
  if (version === null || typeof version !== "object" || Array.isArray(version)) {
    return { ok: false, reason: "invalid_public_version" };
  }
  if (version.commitSource !== "git" && version.commitSource !== "github-env") {
    return { ok: false, reason: "public_commit_source_untrusted" };
  }
  if (version.treeHashError !== null) {
    return { ok: false, reason: "public_tree_hash_error_present" };
  }
  if (version.inherited !== null) {
    return { ok: false, reason: "public_identity_inherited" };
  }
  if (version.commit !== expectedSha) {
    return { ok: false, reason: "public_commit_mismatch" };
  }
  if (version.dirty !== false) {
    return { ok: false, reason: "public_deployment_dirty" };
  }
  if (version.treeHash !== expectedTreeHash) {
    return { ok: false, reason: "public_tree_mismatch" };
  }
  return { ok: true };
}

const PADDLE_SANDBOX_TOKEN_PATTERN = /^test_[A-Za-z0-9_-]+$/;
const PADDLE_LIVE_TOKEN_PATTERN = /(?:^|[^A-Za-z0-9_])live_[A-Za-z0-9_-]+/;

/**
 * Read the single committed Paddle client token from production dotenv text.
 * The token remains an internal return value for byte comparison; failures
 * use fixed codes and never reflect dotenv content or credential bytes.
 */
export function resolveCanonicalPaddleSandboxToken(envText) {
  if (typeof envText !== "string") {
    return { ok: false, reason: "canonical_paddle_env_invalid" };
  }
  const assignments = envText
    .split(/\r?\n/u)
    .filter((line) => /^VITE_PAYMENTS_CLIENT_TOKEN\s*=/u.test(line));
  if (assignments.length !== 1) {
    return { ok: false, reason: "canonical_paddle_token_count_invalid" };
  }

  let token = assignments[0].slice(assignments[0].indexOf("=") + 1).trim();
  const first = token[0];
  if (first === '"' || first === "'") {
    if (token.length < 2 || token.at(-1) !== first) {
      return { ok: false, reason: "canonical_paddle_token_invalid" };
    }
    token = token.slice(1, -1);
  }
  if (!PADDLE_SANDBOX_TOKEN_PATTERN.test(token)) {
    return { ok: false, reason: "canonical_paddle_token_not_sandbox" };
  }
  return { ok: true, token };
}

/** Validate public HTML/JS response metadata before buffering any body bytes. */
export function evaluateBoundedPublicAssetResponseMetadata({
  statusCode,
  contentType,
  contentEncoding = "identity",
  contentLength,
  maxBytes,
  kind,
} = {}) {
  if (Number.isInteger(statusCode) && statusCode >= 300 && statusCode < 400) {
    return { ok: false, reason: "public_asset_redirect_rejected" };
  }
  if (statusCode !== 200) {
    return { ok: false, reason: "public_asset_status_invalid" };
  }
  const normalizedType = typeof contentType === "string" ? contentType.toLowerCase() : "";
  const validType =
    kind === "html"
      ? /^text\/html(?:;|$)/u.test(normalizedType)
      : kind === "javascript"
        ? /^(?:application|text)\/(?:javascript|x-javascript)(?:;|$)/u.test(normalizedType)
        : false;
  if (!validType) {
    return { ok: false, reason: "public_asset_content_type_invalid" };
  }
  if (contentEncoding !== "identity") {
    return { ok: false, reason: "public_asset_content_encoding_invalid" };
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || Array.isArray(contentLength)) {
    return { ok: false, reason: "public_asset_content_length_invalid" };
  }
  if (
    contentLength !== undefined &&
    (typeof contentLength !== "string" ||
      !/^\d+$/u.test(contentLength) ||
      Number(contentLength) > maxBytes)
  ) {
    return { ok: false, reason: "public_asset_content_length_invalid" };
  }
  return { ok: true };
}

/**
 * Consume a response that has already been opened by the fixed-origin caller.
 * Setup/evaluator exceptions and stream failures always settle one sanitized
 * rejection; raw errors, headers, and body bytes are never reflected.
 */
export function consumeBoundedPublicAssetResponse({
  response,
  evaluateMetadata,
  maxBytes,
  kind,
  timeoutMs,
} = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const rejectFixed = (reason) => {
      if (settled) return;
      settled = true;
      try {
        response?.destroy();
      } catch {
        // Destruction is best-effort; the sanitized rejection still settles.
      }
      reject(new Error(reason));
    };

    try {
      if (
        !response ||
        typeof response.on !== "function" ||
        typeof response.setTimeout !== "function" ||
        typeof response.destroy !== "function" ||
        typeof evaluateMetadata !== "function" ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs <= 0
      ) {
        throw new Error("invalid_response_contract");
      }
      const metadata = evaluateMetadata({
        statusCode: response.statusCode,
        contentType: String(response.headers?.["content-type"] ?? ""),
        contentEncoding: String(response.headers?.["content-encoding"] ?? "identity"),
        contentLength: response.headers?.["content-length"],
        maxBytes,
        kind,
      });
      if (!metadata?.ok) {
        rejectFixed("public_asset_response_metadata_rejected");
        return;
      }

      const chunks = [];
      let bytes = 0;
      response.setTimeout(timeoutMs, () => rejectFixed("public_asset_response_timeout"));
      response.on("data", (chunk) => {
        try {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > maxBytes) {
            rejectFixed("public_asset_response_body_too_large");
            return;
          }
          chunks.push(buffer);
        } catch {
          rejectFixed("public_asset_response_failed");
        }
      });
      response.on("end", () => {
        if (settled) return;
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          settled = true;
          resolve(body);
        } catch {
          rejectFixed("public_asset_response_failed");
        }
      });
      response.on("error", () => rejectFixed("public_asset_response_failed"));
    } catch {
      rejectFixed("public_asset_response_setup_failed");
    }
  });
}

/** Resolve exactly one same-origin hashed Vite entry module from bounded HTML. */
export function resolvePublicMainModuleAsset({ html, publicOrigin } = {}) {
  if (typeof html !== "string" || typeof publicOrigin !== "string") {
    return { ok: false, reason: "public_main_asset_invalid" };
  }
  let origin;
  try {
    const parsedOrigin = new URL(publicOrigin);
    if (
      parsedOrigin.protocol !== "https:" ||
      parsedOrigin.username ||
      parsedOrigin.password ||
      parsedOrigin.pathname !== "/" ||
      parsedOrigin.search ||
      parsedOrigin.hash
    ) {
      return { ok: false, reason: "public_origin_invalid" };
    }
    origin = parsedOrigin.origin;
  } catch {
    return { ok: false, reason: "public_origin_invalid" };
  }

  const sources = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/giu)) {
    const attributes = match[1];
    const type = attributes.match(/(?:^|\s)type\s*=\s*(["'])module\1/iu);
    const source = attributes.match(/(?:^|\s)src\s*=\s*(["'])([^"']+)\1/iu);
    if (type && source) sources.push(source[2]);
    if (sources.length > 1) {
      return { ok: false, reason: "public_main_asset_count_invalid" };
    }
  }
  if (sources.length !== 1) {
    return { ok: false, reason: "public_main_asset_count_invalid" };
  }

  try {
    const asset = new URL(sources[0], `${origin}/`);
    if (asset.origin !== origin) {
      return { ok: false, reason: "public_main_asset_cross_origin" };
    }
    if (
      asset.protocol !== "https:" ||
      asset.username ||
      asset.password ||
      asset.search ||
      asset.hash ||
      !/^\/assets\/[A-Za-z0-9._~-]+\.js$/u.test(asset.pathname)
    ) {
      return { ok: false, reason: "public_main_asset_invalid" };
    }
    return { ok: true, url: asset.href };
  } catch {
    return { ok: false, reason: "public_main_asset_invalid" };
  }
}

/** Compare the bounded deployed entry bundle with the committed token class. */
export function evaluatePublicPaddleBundle({ canonicalToken, bundle } = {}) {
  if (
    typeof canonicalToken !== "string" ||
    !PADDLE_SANDBOX_TOKEN_PATTERN.test(canonicalToken) ||
    typeof bundle !== "string"
  ) {
    return { ok: false, reason: "public_paddle_contract_invalid" };
  }
  if (PADDLE_LIVE_TOKEN_PATTERN.test(bundle)) {
    return { ok: false, reason: "public_paddle_live_token_present" };
  }
  if (!bundle.includes(canonicalToken)) {
    return { ok: false, reason: "public_paddle_sandbox_token_missing" };
  }
  return { ok: true };
}

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

function serializeDotenvValue(value) {
  const text = String(value);
  if (text.includes("\r") || text.includes("\n")) {
    throw new Error("managed_session_env_value_contains_newline");
  }
  // Bun treats backslash-escaped double quotes in a double-quoted env value as
  // literal backslashes. Single quotes preserve the JSON bytes; encoding any
  // apostrophe as a JSON unicode escape keeps the dotenv boundary closed while
  // JSON.parse restores the original character. Bun expands `$NAME` in every
  // quote style, so escape dollar signs to preserve untrusted session bytes.
  return `'${text.replaceAll("$", "\\$").replaceAll("'", "\\u0027")}'`;
}

/** Serialize an env map to single-quoted, Bun-compatible dotenv lines. */
export function serializeEnvFile(env) {
  return (
    Object.entries(env)
      .map(([k, v]) => `${k}=${serializeDotenvValue(v)}`)
      .join("\n") + "\n"
  );
}
