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
export const DEFAULT_AUTH_REDIRECT = "/";

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
