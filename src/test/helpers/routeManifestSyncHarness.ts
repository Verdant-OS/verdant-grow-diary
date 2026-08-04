/**
 * Shared harness for asserting that routes mounted in the TanStack file-route
 * tree (src/routes, via createFileRoute) and the APP_ROUTES
 * manifest in src/lib/appRouteManifest.ts stay in sync.
 *
 * Hard constraints:
 *   - Pure helpers. No React, no test framework imports.
 *   - Read-only on the repo: only reads route modules under src/routes from disk.
 *   - No route behavior is mutated by this file.
 *
 * Classic note: older tests referred to src/App.tsx path scrapes.
 * That file is gone after the TanStack migration; this harness is the
 * replacement source of truth for what is mounted.
 *
 * Returns structured diffs so test failures can name the offending side
 * (mounted-but-missing vs. manifest-but-not-mounted) and call out access-group
 * mismatches when they are detectable from the manifest data alone.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { APP_ROUTES, type AppRouteAccess, type AppRouteEntry } from "@/lib/appRouteManifest";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const ROUTES_DIR = resolve(REPO_ROOT, "src/routes");

/** @deprecated Classic App.tsx path — kept only so call sites fail loudly if used. */
export const APP_TSX_PATH = resolve(REPO_ROOT, "src/App.tsx");

const CREATE_FILE_ROUTE_RE = /createFileRoute\(\s*["']([^"']+)["']\s*\)/g;
const ALIAS_REDIRECT_TO_RE = /RouteAliasRedirect\s+to=["']([^"']+)["']/;

/**
 * Pathless layout route ids — not URL destinations in the Classic manifest.
 * Child URLs are attributed without these segments.
 */
const PATHLESS_LAYOUT_IDS = new Set(["/_app", "/_app/_operator"]);

/**
 * Convert a TanStack file-route id to the Classic URL path used in APP_ROUTES.
 *
 * Examples:
 *   /_app/dashboard              → /dashboard
 *   /_app/_operator/operator/ecowitt → /operator/ecowitt
 *   /cultivars/$slug             → /cultivars/:slug
 *   /cultivars/                  → /cultivars
 *   /$                           → *
 *   /_app and /_app/_operator    → null (layout only)
 */
export function tanstackRouteIdToClassicPath(routeId: string): string | null {
  if (routeId === "/$") return "*";
  if (PATHLESS_LAYOUT_IDS.has(routeId)) return null;

  let path = routeId;
  if (path.startsWith("/_app/_operator")) {
    path = path.slice("/_app/_operator".length);
    if (path === "") return null;
  } else if (path.startsWith("/_app")) {
    path = path.slice("/_app".length);
    if (path === "") return null;
  }

  // TanStack $param → Classic :param
  path = path.replace(/\$([A-Za-z0-9_]+)/g, ":$1");

  // Index routes: /cultivars/ → /cultivars
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  return path;
}

function listRouteTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listRouteTsxFiles(full));
      continue;
    }
    if (name.endsWith(".tsx") && name !== "__root.tsx") {
      out.push(full);
    }
  }
  return out.sort();
}

/** Absolute paths of every route module under src/routes (excluding __root). */
export function listRouteModuleFiles(routesDir: string = ROUTES_DIR): string[] {
  return listRouteTsxFiles(routesDir);
}

/** Read every createFileRoute("…") id under src/routes. */
export function extractTanstackRouteIds(routesDir: string = ROUTES_DIR): string[] {
  const ids: string[] = [];
  for (const file of listRouteTsxFiles(routesDir)) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(CREATE_FILE_ROUTE_RE)) {
      ids.push(match[1]);
    }
  }
  return ids;
}

/**
 * Concatenate all route module sources (plus __root) for static greps that
 * formerly scanned Classic App.tsx (imports, redirect components, etc.).
 */
export function readAllRouteModuleSources(routesDir: string = ROUTES_DIR): string {
  const parts: string[] = [];
  const rootFile = join(routesDir, "__root.tsx");
  try {
    parts.push(readFileSync(rootFile, "utf8"));
  } catch {
    /* optional */
  }
  for (const file of listRouteTsxFiles(routesDir)) {
    const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
    parts.push(`\n/* === ${rel} === */\n`);
    parts.push(readFileSync(file, "utf8"));
  }
  return parts.join("");
}

/**
 * Source of the route module that owns a Classic path, or null if unmapped.
 */
export function readRouteModuleSourceForPath(
  classicPath: string,
  routesDir: string = ROUTES_DIR,
): string | null {
  for (const file of listRouteTsxFiles(routesDir)) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(CREATE_FILE_ROUTE_RE)) {
      if (tanstackRouteIdToClassicPath(match[1]) === classicPath) {
        return src;
      }
    }
  }
  return null;
}

/**
 * If the route module for classicPath is a RouteAliasRedirect, return its `to`
 * target. Otherwise null.
 */
export function getRouteAliasRedirectTarget(classicPath: string): string | null {
  const src = readRouteModuleSourceForPath(classicPath);
  if (!src) return null;
  const m = src.match(ALIAS_REDIRECT_TO_RE);
  return m?.[1] ?? null;
}

/** True if Classic path is mounted in the file-route tree. */
export function isRouteMounted(classicPath: string): boolean {
  return extractMountedAppRoutePaths().includes(classicPath);
}

/**
 * @deprecated Use extractMountedAppRoutePaths (now file-route based).
 * Kept for call sites that still import the Classic name.
 */
export function readAppTsxSource(): string {
  // Compatibility: return concatenated route sources so legacy scanners that
  // still call this after a partial rewire do not crash mid-suite.
  return readAllRouteModuleSources();
}

/**
 * Extract every mounted URL path in Classic manifest form.
 *
 * Optional appSource is ignored (legacy signature for App.tsx injection).
 * Prefer omitting it so paths always come from src/routes.
 */
export function extractMountedAppRoutePaths(_appSource?: string): string[] {
  const classic = new Set<string>();
  for (const id of extractTanstackRouteIds()) {
    const path = tanstackRouteIdToClassicPath(id);
    if (path) classic.add(path);
  }
  return [...classic].sort();
}

export interface RouteManifestDiff {
  /** Mounted in file routes but absent from APP_ROUTES. */
  missingFromManifest: string[];
  /** Present in APP_ROUTES but not mounted in file routes. */
  missingFromApp: string[];
  /** Duplicate paths inside the manifest itself (should be empty). */
  duplicateManifestPaths: string[];
}

/**
 * Compute the bidirectional diff between mounted file routes and the manifest.
 * All arrays are sorted ascending for deterministic snapshots.
 */
export function diffAppRoutesAgainstManifest(appSource?: string): RouteManifestDiff {
  const appPaths = extractMountedAppRoutePaths(appSource);
  const appSet = new Set(appPaths);
  const manifestSet = new Set(APP_ROUTES.map((r) => r.path));

  const missingFromManifest = [...appSet].filter((p) => !manifestSet.has(p)).sort();
  const missingFromApp = [...manifestSet].filter((p) => !appSet.has(p)).sort();

  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const r of APP_ROUTES) {
    if (seen.has(r.path)) dupes.add(r.path);
    seen.add(r.path);
  }

  return {
    missingFromManifest,
    missingFromApp,
    duplicateManifestPaths: [...dupes].sort(),
  };
}

export interface AccessMismatch {
  path: string;
  manifestAccess: AppRouteAccess;
  /** What we detected from path shape (best-effort). */
  detectedAccess: AppRouteAccess | "unknown";
}

/**
 * Best-effort access-group cross-check. Conservative: flag when the manifest
 * claims operator for a path that does not begin with /operator/, and
 * vice versa for clearly operator-shaped paths that aren't marked operator
 * or internal in the manifest.
 */
export function findAccessGroupMismatches(): AccessMismatch[] {
  const out: AccessMismatch[] = [];
  for (const r of APP_ROUTES) {
    const shaped = isOperatorShapedPath(r.path);
    if (shaped && r.access !== "operator" && r.access !== "internal") {
      out.push({
        path: r.path,
        manifestAccess: r.access,
        detectedAccess: "operator",
      });
    }
  }
  return out;
}

function isOperatorShapedPath(path: string): boolean {
  return path.startsWith("/operator/");
}

/** Subset selector for pricing / public-billing-relevant manifest entries. */
export function getPricingManifestSnapshot(): ReadonlyArray<AppRouteEntry> {
  const PRICING_PATHS = new Set<string>([
    "/pricing",
    "/billing/:plan",
    "/founder",
    "/welcome",
    "/hardware-integrations",
  ]);
  return APP_ROUTES.filter((r) => PRICING_PATHS.has(r.path))
    .map((r) => ({ ...r }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Mounted operator routes — used by the operator smoke test. */
export function getMountedOperatorPaths(appSource?: string): string[] {
  return extractMountedAppRoutePaths(appSource).filter(isOperatorShapedPath).sort();
}

/**
 * True when the classic path is served under the /_app/_operator layout
 * (presentation RequireOperatorRole gate).
 */
export function isMountedUnderOperatorLayout(classicPath: string): boolean {
  for (const id of extractTanstackRouteIds()) {
    if (!id.startsWith("/_app/_operator/")) continue;
    const mapped = tanstackRouteIdToClassicPath(id);
    if (mapped === classicPath) return true;
  }
  return false;
}

/**
 * True when the classic path is served under the /_app layout (auth shell)
 * but not under /_app/_operator.
 */
export function isMountedUnderAppShell(classicPath: string): boolean {
  for (const id of extractTanstackRouteIds()) {
    if (!id.startsWith("/_app/")) continue;
    if (id.startsWith("/_app/_operator")) continue;
    const mapped = tanstackRouteIdToClassicPath(id);
    if (mapped === classicPath) return true;
  }
  return false;
}
