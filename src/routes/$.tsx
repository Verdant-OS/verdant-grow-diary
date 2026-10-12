import { createFileRoute, notFound } from "@tanstack/react-router";
import NotFound from "@/pages/NotFound";

/**
 * Catch-all for unmatched paths.
 *
 * Rendering <NotFound /> as a plain route component is a soft 404: the HTML
 * says "not found" but the SSR response is HTTP 200, so crawlers keep the URL.
 * The router only reports status 404 when a match is in the not-found state
 * (router-core: `hasNotFoundMatch()` → `statusCode = 404`), which happens when
 * a loader throws `notFound()`. The route-level `notFoundComponent` then
 * renders the same page, on the server and on client navigation.
 */
export const Route = createFileRoute("/$")({
  loader: () => {
    throw notFound();
  },
  notFoundComponent: NotFound,
  component: NotFound,
});
