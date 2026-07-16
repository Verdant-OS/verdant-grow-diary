// Sanitizer for any post-auth redirect target. The /auth and /reset-password
// pages may accept ?redirectTo=... query params. We must never honor a value
// that could navigate the user off-origin or execute a javascript:/data: URI.
//
// Allowed: same-origin relative paths that start with a single "/".
// Rejected:
//   - empty / non-string
//   - protocol-relative ("//evil.example")
//   - full URLs ("https://evil", "http://...")
//   - javascript:, data:, vbscript:, file:, blob:
//   - backslash variants ("/\\evil", "\\evil")
//   - anything that doesn't start with "/"
//   - control chars / whitespace
//
// Returns the sanitized internal path, or the fallback ("/" by default).
import { APP_ROUTES } from "@/lib/appRouteManifest";

export const DEFAULT_AUTH_REDIRECT = "/";

/** Where AppShell sends signed-out visitors (the public landing). */
export const SIGNED_OUT_LANDING = "/welcome";

const DANGEROUS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function sanitizeAuthRedirect(
  value: unknown,
  fallback: string = DEFAULT_AUTH_REDIRECT,
): string {
  const safeFallback =
    typeof fallback === "string" && fallback.startsWith("/") && !fallback.startsWith("//")
      ? fallback
      : DEFAULT_AUTH_REDIRECT;

  if (typeof value !== "string") return safeFallback;
  // Reject control chars / whitespace / null bytes anywhere.
  // eslint-disable-next-line no-control-regex -- deliberately match C0 control chars + DEL (plus whitespace) to reject them
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return safeFallback;
  if (value.length === 0 || value.length > 512) return safeFallback;
  if (!value.startsWith("/")) return safeFallback;
  // Protocol-relative URL: "//host/..." or "/\\host" (browser/path quirks).
  if (value.startsWith("//") || value.startsWith("/\\")) return safeFallback;
  // Any backslash is suspicious for an internal path.
  if (value.includes("\\")) return safeFallback;
  // Strip the leading "/" before scheme check (defense in depth — a leading
  // "/" already prevents schemes, but we still want to reject "javascript:"
  // sneakily embedded after a slash variant).
  if (DANGEROUS_SCHEME.test(value.slice(1))) return safeFallback;
  return value;
}

/**
 * Does `pathname` match one manifest route pattern (`/plants/:id` style)?
 * `:param` segments match any single non-empty segment; the `*` catch-all
 * never matches — an unknown path must not be treated as a known route.
 */
function matchesRoutePattern(pattern: string, pathname: string): boolean {
  if (pattern === "*") return false;
  const patternSegments = pattern.split("/");
  const pathSegments = pathname.split("/");
  if (patternSegments.length !== pathSegments.length) return false;
  return patternSegments.every((segment, i) =>
    segment.startsWith(":") ? pathSegments[i].length > 0 : segment === pathSegments[i],
  );
}

/** True when `pathname` resolves to a route mounted in the app manifest. */
export function isKnownAppRoutePath(pathname: string): boolean {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return false;
  const trimmed = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return APP_ROUTES.some((route) => matchesRoutePattern(route.path, trimmed));
}

/**
 * Strict deep-link return-to resolver. On top of `sanitizeAuthRedirect`'s
 * character-level checks, the path portion must match a route in the app's
 * own manifest — a positive allowlist, so a crafted-but-syntactically-clean
 * value (e.g. "/evil-page") is dropped instead of honored. Returns the
 * sanitized internal path (query preserved), or null when the value is
 * unsafe or unknown.
 */
export function resolveKnownRouteReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const sanitized = sanitizeAuthRedirect(value, DEFAULT_AUTH_REDIRECT);
  // sanitizeAuthRedirect returns the fallback on rejection; only a value
  // that survived unchanged is trustworthy.
  if (sanitized !== value) return null;
  const pathname = sanitized.split("?")[0].split("#")[0];
  if (!isKnownAppRoutePath(pathname)) return null;
  return sanitized;
}

/**
 * Signed-out redirect target for the protected-route boundary. Preserves the
 * intended in-app location as a `redirectTo` query param on the landing path
 * so /auth can restore it after sign-in — but only when the location is a
 * known manifest route (never raw attacker-controllable strings).
 */
export function buildSignedOutRedirect(pathname: string, search: string = ""): string {
  const returnTo = resolveKnownRouteReturnTo(`${pathname}${search}`);
  if (
    !returnTo ||
    returnTo === DEFAULT_AUTH_REDIRECT ||
    returnTo === SIGNED_OUT_LANDING ||
    returnTo.startsWith(`${SIGNED_OUT_LANDING}?`)
  ) {
    return SIGNED_OUT_LANDING;
  }
  return `${SIGNED_OUT_LANDING}?redirectTo=${encodeURIComponent(returnTo)}`;
}
