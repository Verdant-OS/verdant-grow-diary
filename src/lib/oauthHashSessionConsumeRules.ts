/**
 * oauthHashSessionConsumeRules — consume OAuth implicit-flow hash fragments
 * into a Supabase session after Google SSO returns to the public origin.
 *
 * Managed OAuth (Lovable) redirects back to `window.location.origin` with
 * `#access_token=...&refresh_token=...` (or `#error=...`). The SPA must
 * parse those fragments, call `setSession`, and clear the hash without a
 * full reload so `OAuthPostAuthRedirect` can honor a pending redirectTo
 * once `user` exists.
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

export type OAuthHashSetSession = (
  tokens: OAuthHashSessionTokens,
) => Promise<{ error: unknown } | null | undefined>;

/**
 * Parse → setSession (when tokens are valid) → always clear OAuth-looking hash.
 * Fail closed on malformed / provider error / setSession failure: clear hash,
 * never invent a session.
 */
export async function consumeOAuthHashSessionIfPresent(deps: {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
  readonly setSession: OAuthHashSetSession;
  readonly replaceState: (url: string) => void;
}): Promise<OAuthHashConsumeOutcome> {
  const parsed = parseOAuthHashFragment(deps.hash);
  if (parsed.kind === "none") return "noop";

  const clear = () => {
    clearOAuthHashFromAddressBar(
      { pathname: deps.pathname, search: deps.search, hash: deps.hash },
      deps.replaceState,
    );
  };

  if (!shouldAttemptOAuthHashSessionConsume(parsed)) {
    clear();
    return "cleared_without_session";
  }

  try {
    const result = await deps.setSession(parsed.tokens);
    const error =
      result && typeof result === "object" && "error" in result ? result.error : null;
    clear();
    return error ? "cleared_without_session" : "consumed";
  } catch {
    clear();
    return "cleared_without_session";
  }
}
