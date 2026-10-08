import { buildLegacyStrainSlugAliasTarget, buildRouteAliasTarget } from "@/lib/routeAliasRules";
import {
  CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER,
  buildContentSecurityPolicyReportOnly,
} from "@/lib/securityHeadersRules";

/**
 * Host routing that `vercel.json` applied on Vercel and that the Cloudflare
 * Worker must apply itself. Nitro's Lovable config does not accept
 * `routeRules`, and Workers static-asset `_redirects` never see SSR paths
 * because the Worker handles those requests.
 *
 * The SPA catch-all rewrite (`/((?!assets/|~oauth).*)` → `/`) is recorded so
 * the oauth hop and asset paths stay excluded, and it is not applied as an
 * internal rewrite. On this SSR app that rewrite would replace every route
 * with `/`.
 */

export const LOVABLE_OAUTH_ORIGIN =
  "https://66255e7b-892c-4be5-8686-ab1cfc3666db.lovableproject.com";

export const SPA_CATCH_ALL_REWRITE = {
  source: "/((?!assets/|~oauth).*)",
  destination: "/",
} as const;

/**
 * `vercel.json` `/(.*)` headers, unchanged. Report-only CSP is not in this
 * list: `vercel.json` does not publish it, and `public/_headers` does not
 * either. `hostHeadersForPathname` appends it for Worker responses.
 */
export const GLOBAL_SECURITY_HEADERS = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "SAMEORIGIN"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  ["Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()"],
] as const;

export const UNSUBSCRIBE_HEADERS = [
  ["Cache-Control", "no-store"],
  ["Referrer-Policy", "no-referrer"],
  ["X-Robots-Tag", "noindex, nofollow, noarchive"],
] as const;

export const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Build-time only. The SEO snapshot capture sends this so a permanent alias
 * can still render its noindex head. The temporary /~oauth hop ignores it.
 */
export const SEO_SNAPSHOT_HEADER = "x-verdant-seo-snapshot";
export const SEO_SNAPSHOT_HEADER_VALUE = "1";

const EXACT_PERMANENT_REDIRECTS: Readonly<Record<string, string>> = {
  "/strains": "/cultivars",
  "/features": "/welcome",
  "/demo": "/welcome",
  "/refunds": "/refund",
  "/refund-policy": "/refund",
  "/terms-of-service": "/terms",
  "/privacy-policy": "/privacy",
};

export type HostHeader = [string, string];

export type HostRoutingDecision =
  | {
      kind: "redirect";
      status: 307 | 308;
      location: string;
      headers: HostHeader[];
    }
  | {
      kind: "continue";
      spaRewriteMatched: boolean;
      location: null;
      headers: HostHeader[];
    };

function safeSearch(search: string | null | undefined): string {
  if (typeof search !== "string" || search.length === 0) return "";
  if (!search.startsWith("?")) return "";
  if (/[\u0000\r\n]/.test(search)) return "";
  return search;
}

function normalizePathname(pathname: string | null | undefined): string | null {
  if (typeof pathname !== "string" || pathname.length === 0) return null;
  if (!pathname.startsWith("/")) return null;
  if (/[\u0000\r\n\\]/.test(pathname)) return null;
  return pathname;
}

function stripOneTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function isSpaCatchAllExcluded(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  const rest = pathname.slice(1);
  return rest.startsWith("assets/") || rest.startsWith("~oauth");
}

export function hostHeadersForPathname(pathname: string | null | undefined): HostHeader[] {
  const headers = new Map<string, string>();
  for (const [name, value] of GLOBAL_SECURITY_HEADERS) headers.set(name, value);
  headers.set(CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER, buildContentSecurityPolicyReportOnly());

  const path = normalizePathname(pathname);
  if (!path) return [...headers.entries()];

  const exact = stripOneTrailingSlash(path);
  if (exact === "/unsubscribe") {
    for (const [name, value] of UNSUBSCRIBE_HEADERS) headers.set(name, value);
  }
  if (path.startsWith("/assets/") || exact.startsWith("/assets/")) {
    headers.set("Cache-Control", ASSET_CACHE_CONTROL);
  }
  return [...headers.entries()];
}

function continueDecision(pathname: string | null): HostRoutingDecision {
  return {
    kind: "continue",
    spaRewriteMatched: pathname != null && !isSpaCatchAllExcluded(pathname),
    location: null,
    headers: hostHeadersForPathname(pathname),
  };
}

function redirectDecision(
  pathname: string,
  status: 307 | 308,
  location: string,
): HostRoutingDecision {
  return {
    kind: "redirect",
    status,
    location,
    headers: hostHeadersForPathname(pathname),
  };
}

function oauthLocation(pathname: string, search: string): string | null {
  if (pathname !== "/~oauth" && !pathname.startsWith("/~oauth/")) return null;

  const trimmed = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const segments = trimmed.split("/").slice(1);
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }

  const location = `${LOVABLE_OAUTH_ORIGIN}${pathname}${search}`;
  let resolved: URL;
  try {
    resolved = new URL(location);
  } catch {
    return null;
  }
  if (resolved.origin !== LOVABLE_OAUTH_ORIGIN) return null;
  if (!resolved.pathname.startsWith("/~oauth")) return null;
  return `${resolved.origin}${pathname}${search}`;
}

function strainSlugLocation(pathname: string, search: string): string | null {
  const match = /^\/strains\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  return buildLegacyStrainSlugAliasTarget(match[1], search, "");
}

export function resolveHostRouting(input: {
  pathname?: string | null;
  search?: string | null;
}): HostRoutingDecision {
  const pathname = normalizePathname(input.pathname);
  if (!pathname) return continueDecision(null);

  const search = safeSearch(input.search);
  const oauth = oauthLocation(pathname, search);
  if (oauth) return redirectDecision(pathname, 307, oauth);

  const exactDestination = EXACT_PERMANENT_REDIRECTS[stripOneTrailingSlash(pathname)];
  if (exactDestination) {
    return redirectDecision(pathname, 308, buildRouteAliasTarget(exactDestination, search, ""));
  }

  const slugDestination = strainSlugLocation(stripOneTrailingSlash(pathname), search);
  if (slugDestination) return redirectDecision(pathname, 308, slugDestination);

  return continueDecision(pathname);
}

function pathnameFromRequest(request: Request): string | null {
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

function searchFromRequest(request: Request): string {
  try {
    return new URL(request.url).search;
  } catch {
    return "";
  }
}

export const SEO_SNAPSHOT_ENV = "VERDANT_SEO_SNAPSHOT";

/** workerd sets this. A production or `wrangler dev` isolate must not skip redirects. */
export const CLOUDFLARE_WORKERS_RUNTIME = "Cloudflare-Workers";

export function seoSnapshotRuntimeAllowed(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.userAgent !== CLOUDFLARE_WORKERS_RUNTIME;
}

function snapshotEnvValue(env: unknown): unknown {
  if (!env || typeof env !== "object") return undefined;
  return (env as Record<string, unknown>)[SEO_SNAPSHOT_ENV];
}

/**
 * Nitro's Cloudflare module stores the Worker env on `globalThis.__env__` and
 * then calls the SSR fetch with the request only. The capture script sets the
 * snapshot flag on that outer env.
 */
export function workerRoutingEnv(explicit: unknown): unknown {
  if (snapshotEnvValue(explicit) === SEO_SNAPSHOT_HEADER_VALUE) return explicit;
  const stored = (globalThis as { __env__?: unknown }).__env__;
  if (snapshotEnvValue(stored) === SEO_SNAPSHOT_HEADER_VALUE) return stored;
  return explicit;
}

/** Build-only. A request header alone must not skip a public redirect. */
export function seoSnapshotBypassRequested(request: Request, env: unknown): boolean {
  if (!seoSnapshotRuntimeAllowed()) return false;
  return (
    snapshotEnvValue(env) === SEO_SNAPSHOT_HEADER_VALUE &&
    request.headers.get(SEO_SNAPSHOT_HEADER) === SEO_SNAPSHOT_HEADER_VALUE
  );
}

export function redirectResponseFor(request: Request, env?: unknown): Response | null {
  const decision = resolveHostRouting({
    pathname: pathnameFromRequest(request),
    search: searchFromRequest(request),
  });
  if (decision.kind !== "redirect") return null;
  // Permanent legacy aliases still have an SSR document. The snapshot capture
  // re-requests those with the build env flag and header so the head-fidelity
  // gate can read it. The oauth hop is temporary and is never skipped.
  if (decision.status === 308 && seoSnapshotBypassRequested(request, env)) {
    return null;
  }

  const headers = new Headers();
  for (const [name, value] of decision.headers) headers.set(name, value);
  headers.set("Location", decision.location);
  return new Response(null, { status: decision.status, headers });
}

export function withHostHeaders(request: Request, response: Response): Response {
  if (!response) return response;
  const desired = hostHeadersForPathname(pathnameFromRequest(request));
  const headers = new Headers(response.headers);
  let changed = false;
  for (const [name, value] of desired) {
    if (headers.get(name) === value) continue;
    headers.set(name, value);
    changed = true;
  }
  if (!changed) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
