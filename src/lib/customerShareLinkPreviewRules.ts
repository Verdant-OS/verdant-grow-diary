/**
 * customerShareLinkPreviewRules — pure helpers for the operator-facing
 * Customer Mode share-link preview step.
 *
 * Hard constraints:
 *  - No I/O. No Supabase. No fetch. No validation against private data.
 *  - The shareId is treated as opaque user input. We only normalize it
 *    enough to be safe inside a URL path segment.
 *  - No persistence, no token minting, no signing.
 */

export const CUSTOMER_SHARE_LINK_PREVIEW_DISCLAIMER =
  "Preview only — share-token publishing backend not yet available.";

export const CUSTOMER_SHARE_LINK_PUBLIC_ONLY_COPY =
  "Only explicitly customer-facing content should appear in this guide.";

export const CUSTOMER_SHARE_LINK_BASE_PATH = "/customer";

/**
 * Normalize a free-form shareId into something safe to drop into a URL
 * path segment.
 *
 * Rules:
 *  - Trim whitespace.
 *  - Strip path separators (`/`, `\`) and hash/query chars (`#`, `?`).
 *  - Strip whitespace inside the value.
 *  - Drop control characters.
 *  - Cap length at 128 characters.
 *  - Return null when the result is empty.
 */
export function normalizeShareIdInput(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) return null;
  // Remove path/query/hash/whitespace/control chars.
  const stripped = trimmed
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\s/\\?#]+/g, "");
  if (stripped.length === 0) return null;
  return stripped.slice(0, 128);
}

export interface CustomerShareLinkPreview {
  /** Normalized shareId, or null when input is invalid/empty. */
  shareId: string | null;
  /** Customer guide path (relative). Null when shareId is invalid. */
  path: string | null;
  /** Whether the "Open preview" action should be enabled. */
  canOpen: boolean;
}

/**
 * Build a local preview URL for the Customer Mode guide.
 *
 * Pure. Does not call window.* or fetch. Returns a relative path so
 * presenters can decide how to render it (link, copy field, etc.).
 */
export function buildCustomerSharePreview(
  raw: string | null | undefined,
): CustomerShareLinkPreview {
  const shareId = normalizeShareIdInput(raw);
  if (!shareId) {
    return { shareId: null, path: null, canOpen: false };
  }
  const path = `${CUSTOMER_SHARE_LINK_BASE_PATH}/${encodeURIComponent(shareId)}`;
  return { shareId, path, canOpen: true };
}

/**
 * Build an absolute URL for the Customer Mode guide given an optional
 * origin (e.g. `window.location.origin`).
 *
 * Pure. Returns null when the shareId or origin is missing/invalid.
 */
export function buildCustomerShareAbsoluteUrl(
  raw: string | null | undefined,
  origin: string | null | undefined,
): string | null {
  const preview = buildCustomerSharePreview(raw);
  if (!preview.path) return null;
  const safeOrigin = typeof origin === "string" ? origin.trim() : "";
  if (!safeOrigin) return null;
  // Strip a trailing slash on origin to avoid `//customer/...`.
  const cleanOrigin = safeOrigin.replace(/\/+$/, "");
  return `${cleanOrigin}${preview.path}`;
}
