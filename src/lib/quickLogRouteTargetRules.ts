import { isUuid } from "@/lib/isUuid";

const TENT_DETAIL_PATH = /^\/tents\/([^/?#]+)\/?$/;

/**
 * Resolve the mobile Quick Log target from an authenticated route.
 *
 * Tent detail is the only route that currently guarantees enough context for
 * a tent-scoped V2 log. Invalid/demo ids fail closed so they can never flow
 * into UUID-backed writes; the existing unscoped Quick Log remains the
 * fallback everywhere else.
 */
export function resolveMobileQuickLogTarget(pathname: unknown): string | null {
  if (typeof pathname !== "string") return null;
  const match = TENT_DETAIL_PATH.exec(pathname);
  if (!match) return null;

  try {
    const tentId = decodeURIComponent(match[1]);
    return isUuid(tentId) ? `tent:${tentId}` : null;
  } catch {
    return null;
  }
}
