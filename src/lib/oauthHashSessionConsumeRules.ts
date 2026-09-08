/**
 * oauthHashSessionConsumeRules — consume OAuth implicit-flow hash fragments
 * into a Supabase session after Google SSO returns to the public origin.
 *
 * Managed OAuth (Lovable) redirects back to `window.location.origin` with
 * `#access_token=...&refresh_token=...` (or `#error=...`). The SPA must
 * parse those fragments, wipe the hash via replaceState immediately, then
 * call `setSession` from in-memory tokens so `OAuthPostAuthRedirect` can
 * honor a pending redirectTo once `user` exists. Tokens must not remain
 * in `location.hash` (or the current history URL) after app JS runs.
 *
 * Fail closed: never invent sessions from malformed or missing tokens.
 * Does not weaken open-redirect sanitizers — this module only strips the
 * OAuth fragment from the address bar; navigation authority stays in
 * `oauthPostAuthRedirectRules`.
 */

export type OAuthHashSessionTokens = {
  readonly access_token: string;
  readonly refresh_token: string;
};

export type ParsedOAuthHash =
  | { readonly kind: "session"; readonly tokens: OAuthHashSessionTokens }
  | {
      readonly kind: "provider_error";
      readonly error: string;
      readonly errorDescription: string | null;
    }
  | { readonly kind: "none" }
  | { readonly kind: "malformed" };

export type OAuthHashConsumeOutcome = "consumed" | "cleared_without_session" | "noop";

/** Soft bounds — reject junk without inventing a session shape. */
const MIN_ACCESS_TOKEN_LEN = 16;
const MIN_REFRESH_TOKEN_LEN = 8;
const MAX_TOKEN_LEN = 8_192;

function stripHashPrefix(hash: string): string {
  if (typeof hash !== "string" || hash.length === 0) return "";
  return hash.startsWith("#") ? hash.slice(1) : hash;
}

/**
 * Parse a URL hash fragment for OAuth session tokens or a provider error.
 * Anything else is `none` (leave the hash alone) or `malformed` (oauth-looking
 * but unusable — clear the hash, do not set a session).
 */
export function parseOAuthHashFragment(hash: unknown): ParsedOAuthHash {
  if (typeof hash !== "string") return { kind: "none" };
  const raw = stripHashPrefix(hash);
  if (!raw) return { kind: "none" };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return { kind: "none" };
  }

  const hasAccess = params.has("access_token");
  const hasRefresh = params.has("refresh_token");
  const hasError = params.has("error");

  if (!hasAccess && !hasRefresh && !hasError) return { kind: "none" };

  if (hasError) {
    const error = (params.get("error") ?? "").trim();
    if (!error) return { kind: "malformed" };
    const errorDescriptionRaw = params.get("error_description");
    const errorDescription =
      typeof errorDescriptionRaw === "string" && errorDescriptionRaw.trim().length > 0
        ? errorDescriptionRaw.trim()
        : null;
    return { kind: "provider_error", error, errorDescription };
  }

  const access_token = (params.get("access_token") ?? "").trim();
  const refresh_token = (params.get("refresh_token") ?? "").trim();

  if (
    !access_token ||
    !refresh_token ||
    access_token.length < MIN_ACCESS_TOKEN_LEN ||
    refresh_token.length < MIN_REFRESH_TOKEN_LEN ||
    access_token.length > MAX_TOKEN_LEN ||
    refresh_token.length > MAX_TOKEN_LEN
  ) {
    return { kind: "malformed" };
  }

  return {
    kind: "session",
    tokens: { access_token, refresh_token },
  };
}

export function shouldAttemptOAuthHashSessionConsume(
  parsed: ParsedOAuthHash,
): parsed is { readonly kind: "session"; readonly tokens: OAuthHashSessionTokens } {
  return parsed.kind === "session";
}

/** Path + search with no hash. Never invents a destination from the fragment. */
export function urlWithoutHash(pathname: unknown, search: unknown): string {
  const path = typeof pathname === "string" && pathname.length > 0 ? pathname : "/";
  const query = typeof search === "string" ? search : "";
  // search may already include leading `?` (Location.search) or be empty.
  return `${path}${query}`;
}

export type OAuthHashLocationLike = {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
};

/**
 * Strip the hash from the address bar without a full reload.
 * Returns true only when an OAuth-looking hash was present and replaceState ran.
 */
export function clearOAuthHashFromAddressBar(
  locationLike: OAuthHashLocationLike,
  replaceState: (url: string) => void,
): boolean {
  const parsed = parseOAuthHashFragment(locationLike.hash);
  if (parsed.kind === "none") return false;
  const url = urlWithoutHash(locationLike.pathname, locationLike.search);
  try {
    replaceState(url);
    return true;
  } catch {
    return false;
  }
}

export function hashLooksLikeOAuthReturn(hash: unknown): boolean {
  return parseOAuthHashFragment(typeof hash === "string" ? hash : "").kind !== "none";
}

/**
 * One-shot in-memory stash used by the before-paint wipe script so consume
 * can still call setSession after location.hash is already empty.
 * Never log this key's value.
 */
export const OAUTH_RETURN_HASH_STASH_KEY = "__VERDANT_OAUTH_RETURN_HASH__" as const;

export type OAuthHashStashHolder = {
  [OAUTH_RETURN_HASH_STASH_KEY]?: unknown;
};

export function takeOAuthReturnHashStash(holder: OAuthHashStashHolder): string | null {
  const raw = holder[OAUTH_RETURN_HASH_STASH_KEY];
  try {
    delete holder[OAUTH_RETURN_HASH_STASH_KEY];
  } catch {
    try {
      holder[OAUTH_RETURN_HASH_STASH_KEY] = undefined;
    } catch {
      // Ignore stash holders that reject delete/assign.
    }
  }
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function resolveOAuthHashSource(locationHash: unknown, stashedHash: unknown): string {
  if (typeof stashedHash === "string" && stashedHash.length > 0) return stashedHash;
  return typeof locationHash === "string" ? locationHash : "";
}

/**
 * Tiny blocking head script: stash an OAuth-looking hash, then replaceState
 * before first paint. Must stay import-free so it can run before module graph.
 * Detection mirrors parseOAuthHashFragment's oauth-looking keys.
 */
export const OAUTH_HASH_EARLY_WIPE_SCRIPT =
  '(function(){try{var h=location.hash||"";if(h.indexOf("access_token=")<0&&h.indexOf("refresh_token=")<0&&h.indexOf("error=")<0)return;window.' +
  OAUTH_RETURN_HASH_STASH_KEY +
  '=h;history.replaceState(history.state,"",location.pathname+location.search);}catch(e){}})();';

export type OAuthHashSetSession = (
  tokens: OAuthHashSessionTokens,
) => Promise<{ error: unknown } | null | undefined>;

/**
 * Parse → wipe hash (replaceState, synchronous) → setSession from in-memory
 * tokens. Fail closed on malformed / provider error / setSession failure:
 * hash is already gone; never invent a session.
 *
 * Prefer `stashedHash` from the before-paint wipe when location.hash is empty.
 */
export async function consumeOAuthHashSessionIfPresent(deps: {
  readonly hash: string;
  readonly stashedHash?: string | null;
  readonly pathname: string;
  readonly search: string;
  readonly setSession: OAuthHashSetSession;
  readonly replaceState: (url: string) => void;
}): Promise<OAuthHashConsumeOutcome> {
  const sourceHash = resolveOAuthHashSource(deps.hash, deps.stashedHash);
  const parsed = parseOAuthHashFragment(sourceHash);
  if (parsed.kind === "none") return "noop";

  // Wipe first so tokens do not sit in the address bar for setSession latency.
  clearOAuthHashFromAddressBar(
    { pathname: deps.pathname, search: deps.search, hash: sourceHash },
    deps.replaceState,
  );

  if (!shouldAttemptOAuthHashSessionConsume(parsed)) {
    return "cleared_without_session";
  }

  try {
    const result = await deps.setSession(parsed.tokens);
    const error = result && typeof result === "object" && "error" in result ? result.error : null;
    return error ? "cleared_without_session" : "consumed";
  } catch {
    return "cleared_without_session";
  }
}
