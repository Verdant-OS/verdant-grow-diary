/**
 * Feature detection for the Web Share and Clipboard APIs.
 *
 * `lib.dom` types `navigator.share` and `navigator.clipboard` as always
 * present, so `navigator.share?.bind(navigator)` narrows to a value TypeScript
 * considers non-optional — the `nativeShare ? … : …` fallbacks that every share
 * card relies on then read as dead branches. These helpers keep the runtime
 * detection honest (Safari/iOS lack Clipboard write, non-secure contexts lack
 * both, SSR has no `navigator` at all) and return `undefined` when unavailable.
 *
 * Read-only: capability detection, no data access and no side effects.
 */

/** `navigator.share`, bound, or `undefined` when the browser has no Web Share. */
export function getNativeShare(): ((data: ShareData) => Promise<void>) | undefined {
  if (typeof navigator === "undefined") return undefined;
  const share = (navigator as Partial<Navigator>).share;
  return typeof share === "function" ? share.bind(navigator) : undefined;
}

/** `navigator.clipboard.writeText`, bound, or `undefined` when unavailable. */
export function getClipboardWriteText(): ((text: string) => Promise<void>) | undefined {
  if (typeof navigator === "undefined") return undefined;
  const clipboard = (navigator as Partial<Navigator>).clipboard;
  const writeText = clipboard?.writeText;
  return typeof writeText === "function" ? writeText.bind(clipboard) : undefined;
}
