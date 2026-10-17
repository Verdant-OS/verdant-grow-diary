import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

function browserHostname(): string | null {
  if (typeof window === "undefined") return null;
  return window.location?.hostname ?? null;
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
 * a request (for example unit tests, where the server branch also runs) it
 * falls back to the browser hostname, then null.
 */
export const renderHostname = createIsomorphicFn()
  .server((): string | null => {
    try {
      return new URL(getRequest().url).hostname || null;
    } catch {
      return browserHostname();
    }
  })
  .client(browserHostname);
