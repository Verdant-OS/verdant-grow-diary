import { APP_ROUTES } from "@/lib/appRouteManifest";

/**
 * Privacy rules for analytics page locations.
 *
 * Analytics receives known route shape only. Query strings and hashes may
 * contain grower-entered search text, attribution payloads, email addresses,
 * reset tokens, or row identifiers, so they are always discarded rather than
 * partially sanitized.
 */

const UNKNOWN_ROUTE_ANALYTICS_PATH = "/:unknown";
const PUBLIC_SEO_ROUTE_SHAPES = new Set(["/cultivars/:slug", "/guides/:slug", "/strains/:slug"]);
const PUBLIC_SEO_SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_PUBLIC_SEO_SLUG_LENGTH = 80;

interface AnalyticsRouteShape {
  path: string;
  segments: ReadonlyArray<string>;
  staticSegmentCount: number;
}

const ANALYTICS_ROUTE_SHAPES: ReadonlyArray<AnalyticsRouteShape> = APP_ROUTES.filter(
  ({ path }) => path !== "*",
)
  .map(({ path }) => {
    const segments = path === "/" ? [] : path.slice(1).split("/");
    return {
      path,
      segments,
      staticSegmentCount: segments.filter((segment) => !segment.startsWith(":")).length,
    };
  })
  // Exact/static routes win before parameterized siblings such as
  // `/breeding/new` vs `/breeding/:programId`. The lexical fallback keeps the
  // matching order deterministic if the manifest gains overlapping shapes.
  .sort(
    (a, b) =>
      b.staticSegmentCount - a.staticSegmentCount ||
      a.segments.length - b.segments.length ||
      a.path.localeCompare(b.path),
  );

function pathnameOnly(input: string): string | null {
  const queryIndex = input.indexOf("?");
  const hashIndex = input.indexOf("#");
  const boundary = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((lowest, index) => Math.min(lowest, index), input.length);
  const pathname = input.slice(0, boundary);

  if (!pathname.startsWith("/") || pathname.length === 0) return null;
  if (pathname === "/") return pathname;

  // React Router accepts a trailing slash for these routes. Normalize it so a
  // single page identity remains deterministic in analytics.
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function matchesRouteShape(pathSegments: ReadonlyArray<string>, route: AnalyticsRouteShape) {
  if (pathSegments.length !== route.segments.length) return false;

  return route.segments.every((routeSegment, index) => {
    if (routeSegment.startsWith(":")) return pathSegments[index].length > 0;
    return routeSegment === pathSegments[index];
  });
}

function isConservativePublicSeoSlug(value: string): boolean {
  return value.length <= MAX_PUBLIC_SEO_SLUG_LENGTH && PUBLIC_SEO_SLUG_RE.test(value);
}

/**
 * Returns only a de-identified, known route pathname. Never returns a query or
 * hash. A public SEO slug remains literal only when the caller has independently
 * verified the page's single same-origin canonical and supplies its pathname.
 */
export function sanitizePagePath(input: string, trustedCanonicalPathname?: string | null): string {
  const pathname = pathnameOnly(input);
  if (pathname === null) return UNKNOWN_ROUTE_ANALYTICS_PATH;

  const pathSegments = pathname === "/" ? [] : pathname.slice(1).split("/");
  if (pathSegments.some((segment) => segment.length === 0)) {
    return UNKNOWN_ROUTE_ANALYTICS_PATH;
  }

  const route = ANALYTICS_ROUTE_SHAPES.find((candidate) =>
    matchesRouteShape(pathSegments, candidate),
  );
  if (!route) return UNKNOWN_ROUTE_ANALYTICS_PATH;

  const slugIndex = route.segments.indexOf(":slug");
  const canonicalPathname = trustedCanonicalPathname
    ? pathnameOnly(trustedCanonicalPathname)
    : null;
  if (
    PUBLIC_SEO_ROUTE_SHAPES.has(route.path) &&
    slugIndex >= 0 &&
    isConservativePublicSeoSlug(pathSegments[slugIndex]) &&
    canonicalPathname === pathname
  ) {
    return pathname;
  }

  // Returning the manifest shape masks every dynamic segment by construction,
  // regardless of whether its value resembles a UUID, short number, email,
  // token, or other grower-controlled text.
  return route.path;
}

/**
 * Builds an explicit GA page_location so the browser's raw URL is never used
 * as a fallback. Non-http origins fail closed to the sanitized pathname.
 */
export function buildSafeAnalyticsPageLocation(
  origin: string,
  input: string,
  trustedCanonicalPathname?: string | null,
): string {
  const safePath = sanitizePagePath(input, trustedCanonicalPathname);
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
      return safePath;
    }
    return `${parsedOrigin.origin}${safePath}`;
  } catch {
    return safePath;
  }
}
