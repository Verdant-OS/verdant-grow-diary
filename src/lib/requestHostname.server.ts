import { getRequest } from "@tanstack/react-start/server";
import { REQUEST_HOSTNAME_READER_KEY, type RequestHostnameReader } from "./requestHostname";

/**
 * Server only: the incoming request's hostname. Throws when there is no
 * request in this context; `renderHostname` handles the fallback.
 */
export const readRequestHostname: RequestHostnameReader = () =>
  new URL(getRequest().url).hostname || null;

/**
 * Called once by the SSR entry (`src/server.ts`). `getRequest()` is request
 * scoped, so one process-wide reader still answers per request.
 *
 * Why a registered reader instead of an import: `requestHostname.ts` is in the
 * client graph (paddle.ts → the root payment banner). Any static import of
 * this file or of `@tanstack/react-start/server` from there let a cold dev
 * server walk into start-server-core in the client environment, discover
 * server-only dependencies after startup and full-reload the page, aborting
 * the next navigation (public census, `/auth` ERR_ABORTED).
 */
export function installRequestHostnameReader(): void {
  (globalThis as Record<symbol, unknown>)[REQUEST_HOSTNAME_READER_KEY] = readRequestHostname;
}
