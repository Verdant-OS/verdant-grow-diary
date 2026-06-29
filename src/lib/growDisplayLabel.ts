/**
 * growDisplayLabel — pure helper for user-facing "Grow" labels.
 *
 * Never returns a raw UUID-shaped string. If a grow name is missing or looks
 * like a UUID, falls back to the canonical "Current grow" label. The original
 * id remains usable as a link target — only the visible text is sanitized.
 *
 * No I/O. No React. Deterministic.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GROW_DISPLAY_FALLBACK = "Current grow";

export function looksLikeUuid(v: unknown): boolean {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

export function formatGrowDisplayLabel(
  name: string | null | undefined,
  _id?: string | null | undefined,
): string {
  if (typeof name === "string") {
    const trimmed = name.trim();
    if (trimmed.length > 0 && !looksLikeUuid(trimmed)) return trimmed;
  }
  return GROW_DISPLAY_FALLBACK;
}
