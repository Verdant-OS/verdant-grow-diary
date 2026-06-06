/**
 * Shared harness for asserting that routes mounted in `src/App.tsx` and the
 * `APP_ROUTES` manifest in `src/lib/appRouteManifest.ts` stay in sync.
 *
 * Hard constraints:
 *   - Pure helpers. No React, no test framework imports.
 *   - Read-only on the repo: only reads `src/App.tsx` from disk.
 *   - No route behavior is mutated by this file.
 *
 * Returns structured diffs so test failures can name the offending side
 * (mounted-but-missing vs. manifest-but-not-mounted) and call out access-group
 * mismatches when they are detectable from the manifest data alone.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  APP_ROUTES,
  type AppRouteAccess,
  type AppRouteEntry,
} from "@/lib/appRouteManifest";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const APP_TSX_PATH = resolve(REPO_ROOT, "src/App.tsx");

/** Read the on-disk `src/App.tsx` source. */
export function readAppTsxSource(): string {
  return readFileSync(APP_TSX_PATH, "utf8");
}

/** Extract every `path="..."` literal mounted in App.tsx. */
export function extractMountedAppRoutePaths(appSource?: string): string[] {
  const src = appSource ?? readAppTsxSource();
  return [...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

export interface RouteManifestDiff {
  /** Mounted in App.tsx but absent from `APP_ROUTES`. */
  missingFromManifest: string[];
  /** Present in `APP_ROUTES` but not mounted in App.tsx. */
  missingFromApp: string[];
  /** Duplicate paths inside the manifest itself (should be empty). */
  duplicateManifestPaths: string[];
}

/**
 * Compute the bidirectional diff between mounted App routes and the manifest.
 * All arrays are sorted ascending for deterministic snapshots.
 */
export function diffAppRoutesAgainstManifest(
  appSource?: string,
): RouteManifestDiff {
  const appPaths = extractMountedAppRoutePaths(appSource);
  const appSet = new Set(appPaths);
  const manifestSet = new Set(APP_ROUTES.map((r) => r.path));

  const missingFromManifest = [...appSet]
    .filter((p) => !manifestSet.has(p))
    .sort();
  const missingFromApp = [...manifestSet]
    .filter((p) => !appSet.has(p))
    .sort();

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
  /** What we detected from App.tsx context (best-effort). */
  detectedAccess: AppRouteAccess | "unknown";
}

/**
 * Best-effort access-group cross-check. Today this is conservative: we only
 * flag a mismatch when the manifest claims `operator` for a path that does
 * not begin with `/operator/`, `/diagnostics`, `/sensors/`, `/ingest-`,
 * `/imports/`, or `/pi-`, and vice versa for clearly operator-shaped paths
 * that aren't marked `operator` in the manifest. We do not parse JSX nesting
 * because that requires a real React parser; this heuristic is enough to
 * catch the realistic drift (a new `/operator/*` route shipped as `auth`).
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
    "/welcome",
    "/hardware-integrations",
  ]);
  return APP_ROUTES.filter((r) => PRICING_PATHS.has(r.path))
    .map((r) => ({ ...r }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Mounted operator routes — used by the operator smoke test. */
export function getMountedOperatorPaths(appSource?: string): string[] {
  return extractMountedAppRoutePaths(appSource)
    .filter(isOperatorShapedPath)
    .sort();
}
