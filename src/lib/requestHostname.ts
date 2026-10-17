import { createIsomorphicFn } from "@tanstack/react-start";

export type RequestHostnameReader = () => string | null;

/**
 * Where the SSR entry registers the server-side request reader
 * (`installRequestHostnameReader` in `requestHostname.server.ts`). This module
 * must not import that file or `@tanstack/react-start/server`; see there.
 */
export const REQUEST_HOSTNAME_READER_KEY: unique symbol = Symbol.for(
  "verdant:request-hostname-reader",
);

function browserHostname(): string | null {
  if (typeof window === "undefined") return null;
  return window.location?.hostname ?? null;
}

function registeredRequestReader(): RequestHostnameReader | null {
  const reader = (globalThis as Record<symbol, unknown>)[REQUEST_HOSTNAME_READER_KEY];
  return typeof reader === "function" ? (reader as RequestHostnameReader) : null;
}

/**
 * Hostname of the page being rendered, on the server and in the browser.
 *
 * Server: the incoming request's host, so a live-token build served from a
 * non-production hostname renders the off-host state in its HTML instead of
 * claiming live checkout until hydration. Browser: `window.location.hostname`.
 * Both sides read the same host, so server markup and hydration match.
 *
 * The Start compiler strips the server branch from the client bundle. Without
 * a registered reader or a request (for example unit tests, where the server
 * branch also runs) it falls back to the browser hostname, then null.
 */
export const renderHostname = createIsomorphicFn()
  .server((): string | null => {
    const read = registeredRequestReader();
    if (!read) return browserHostname();
    try {
      return read();
    } catch {
      return browserHostname();
    }
  })
  .client(browserHostname);
