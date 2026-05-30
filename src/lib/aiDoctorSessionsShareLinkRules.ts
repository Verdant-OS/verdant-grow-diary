/**
 * Pure helpers for the /doctor/sessions Copy Link button.
 *
 * No data writes. No AI invocation. No automation. No device control.
 * Only reads from `window.location` / `navigator.clipboard` when called.
 */

export type CopyLinkStatus = "idle" | "success" | "error";

/**
 * Build the shareable URL for the current filtered/paginated index view.
 * `search` is the raw search string (with or without leading "?").
 */
export function buildShareUrl(origin: string, pathname: string, search: string): string {
  let s = search ?? "";
  if (s.length > 0 && !s.startsWith("?")) s = `?${s}`;
  const base = origin && origin !== "null" ? origin : "";
  return `${base}${pathname}${s}`;
}

/**
 * Read the current shareable URL from `window` when available. Returns null
 * in non-browser environments (caller can fall back).
 */
export function readCurrentShareUrl(): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  const { origin, pathname, search } = window.location;
  return buildShareUrl(origin ?? "", pathname ?? "", search ?? "");
}

/**
 * Fallback copy using a transient <textarea> + document.execCommand("copy").
 * Returns true on success, false otherwise. Safe no-op outside the DOM.
 */
export function copyTextFallback(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  document.body.appendChild(ta);
  try {
    ta.select();
    // execCommand is deprecated but still works as a fallback in most browsers.
    const ok = typeof document.execCommand === "function" && document.execCommand("copy");
    return !!ok;
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}

/**
 * Copy `text` to the clipboard using the async Clipboard API when available,
 * with a synchronous textarea fallback. Throws on total failure so callers
 * can surface an error state.
 */
export async function copyShareLink(text: string): Promise<void> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(text);
    return;
  }
  if (copyTextFallback(text)) return;
  throw new Error("clipboard-unavailable");
}
