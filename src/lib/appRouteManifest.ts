/**
 * App route manifest — single source of truth for every route mounted in
 * `src/App.tsx`.
 *
 * Why this exists:
 *   The App router used to be reflected in `src/test/pricing.test.ts` via a
 *   hard-coded sorted list. Any new route silently went stale until the next
 *   test run. This manifest is the *expected* set; the test cross-checks it
 *   against the actual routes scraped from `App.tsx` so drift fails fast in
 *   either direction.
 *
 * Hard constraints (Slice P1):
 *   - Pure data + pure helpers. No React, no component imports.
 *   - No pricing-tier behavior. `protected-tier` / `requiredTier` are
 *     intentionally NOT introduced here — they need product decisions about
 *     which routes are tier-gated and where the current tier comes from.
 *   - `access` reflects today's actual routing behavior only.
 *   - Deterministic ordering: entries are sorted by `path` ascending.
 */

/**
 * What kind of access gate the App router currently applies to a route.
 *
 *  - `public`    — mounted outside `<RequireAuth>` and renders a real page
 *                  (e.g. `/welcome`, `/pricing`, `/auth`, `*` NotFound).
 *  - `auth`      — mounted inside `<RequireAuth>`; available to any signed-in
 *                  user regardless of tier. Today this covers the entire
 *                  product surface (no tier-gating yet).
 *  - `operator`  — mounted inside `<RequireAuth>` but intended for operator /
 *                  diagnostic use (e.g. `/operator/ecowitt`, `/diagnostics`,
 *                  `/sensors/ecowitt-audit`). Not exposed in normal user nav.
 *  - `internal`  — mounted inside `<RequireAuth>` for internal admin/support
 *                  flows (e.g. `/admin/leads`, `/leads`, `/grow-lineage`).
 *  - `redirect`  — a `<Navigate>` alias to another route (e.g. `/login` →
 *                  `/auth`). Carries no page of its own.
 */
export type AppRouteAccess =
  | "public"
  | "auth"
  | "operator"
  | "internal"
  | "redirect";

export const APP_ROUTE_ACCESS_VALUES: ReadonlyArray<AppRouteAccess> = [
  "public",
  "auth",
  "operator",
  "internal",
  "redirect",
];

export interface AppRouteEntry {
  /** Exact path string as it appears in `App.tsx` (`path="..."`). */
  path: string;
  /** Current routing gate — see `AppRouteAccess`. */
  access: AppRouteAccess;
  /** Optional short human label. Required when `showInNav` is true. */
  label?: string;
  /** Whether this route is intended for the user-facing primary navigation. */
  showInNav?: boolean;
  /** Optional one-line description for documentation / tooling. */
  description?: string;
}

/**
 * Every route currently mounted in `src/App.tsx`, sorted by `path`.
 *
 * Keep this list in sync with `App.tsx`. The pricing route-list test
 * cross-checks both directions and will fail if they drift.
 */
export const APP_ROUTES: ReadonlyArray<AppRouteEntry> = [
  { path: "*", access: "public", description: "NotFound catch-all." },
  { path: "/", access: "auth", description: "Dashboard." },
  { path: "/action-queue", access: "redirect", description: "→ /actions" },
  { path: "/actions", access: "auth" },
  { path: "/actions/:actionId", access: "auth" },
  { path: "/admin/leads", access: "internal" },
  { path: "/alerts", access: "auth" },
  { path: "/alerts/:alertId", access: "auth" },
  { path: "/auth", access: "public" },
  { path: "/billing/:plan", access: "public", description: "Billing placeholder." },
  { path: "/daily-check", access: "auth" },
  { path: "/demo", access: "redirect", description: "→ /welcome" },
  { path: "/diagnostics", access: "operator" },
  { path: "/diary/environment-summary", access: "auth", description: "Environment summary report (diary)." },
  { path: "/doctor", access: "auth" },
  { path: "/doctor/sessions", access: "auth" },
  { path: "/doctor/sessions/:sessionId", access: "auth" },
  { path: "/features", access: "redirect", description: "→ /welcome" },
  { path: "/grow-lineage", access: "internal" },
  { path: "/grow-room", access: "redirect", description: "→ /" },
  { path: "/grows", access: "auth" },
  { path: "/grows/:growId", access: "auth" },
  { path: "/hardware-integrations", access: "public" },
  
  { path: "/ingest-inspector", access: "operator" },
  { path: "/internal/ai-doctor-confidence-audit", access: "internal", description: "AI Doctor confidence internal static audit." },
  { path: "/internal/ai-doctor-phase1-preview", access: "internal", description: "Static Phase 1 view model preview." },
  { path: "/internal/one-tent-loop-proof", access: "internal", description: "One-tent loop internal proof checklist." },
  { path: "/internal/sensor-truth-audit", access: "internal", description: "Sensor truth internal static audit." },
  { path: "/leads", access: "internal" },

  { path: "/login", access: "redirect", description: "→ /auth" },
  { path: "/logs", access: "auth" },
  { path: "/onboarding", access: "auth", description: "Post-sign-in start-screen choice (diary-first default)." },
  { path: "/operator/ecowitt", access: "operator", description: "Cloud Canary preview." },
  { path: "/operator/ecowitt-bridge-debug", access: "operator", description: "EcoWitt bridge debug (localhost-only diagnostics)." },
  { path: "/operator/ecowitt-bridge-status", access: "operator", description: "EcoWitt bridge status." },
  { path: "/operator/ecowitt-live-bringup", access: "operator", description: "EcoWitt live bring-up operator checklist." },
  { path: "/operator/ecowitt-tent-preview", access: "operator", description: "EcoWitt multi-tent read-only normalizer preview." },
  { path: "/operator/ggs-real-payload-ingest", access: "operator", description: "GGS real payload ingest operator tool (read-only preview)." },
  { path: "/operator/one-tent-loop-smoke-test", access: "operator", description: "One-tent loop smoke-test operator checklist (read-only)." },
  { path: "/operator/one-tent-proof-record", access: "operator", description: "One-tent proof record export." },
  
  { path: "/pi-ingest-status", access: "operator" },
  { path: "/plants", access: "auth" },
  { path: "/plants/:id", access: "auth" },
  { path: "/pricing", access: "public" },
  { path: "/register", access: "redirect", description: "→ /auth" },
  { path: "/reports", access: "auth" },
  { path: "/reset-password", access: "public", description: "Password reset landing page." },
  { path: "/sensors", access: "auth" },
  
  { path: "/sensors/ecowitt-audit", access: "operator" },
  { path: "/sensors/ingest-normalizer", access: "operator" },
  { path: "/settings", access: "auth" },
  { path: "/signup", access: "redirect", description: "→ /auth" },
  { path: "/tasks", access: "auth" },
  { path: "/tents", access: "auth" },
  { path: "/tents/:id", access: "auth" },
  { path: "/timeline", access: "auth" },
  { path: "/welcome", access: "public" },
];

/** All manifest paths in the manifest's deterministic (path-ascending) order. */
export function getAppRouteManifestPaths(): string[] {
  return APP_ROUTES.map((r) => r.path);
}

/** All manifest paths sorted (alphabetical). Stable for set comparisons. */
export function getAppRouteManifestPathsSorted(): string[] {
  return [...getAppRouteManifestPaths()].sort();
}

/** Filter helper — useful for future nav/access work, no React inside. */
export function getRoutesByAccess(
  access: AppRouteAccess,
): ReadonlyArray<AppRouteEntry> {
  return APP_ROUTES.filter((r) => r.access === access);
}

/**
 * Pure invariant check. Returns the list of duplicate paths (empty if the
 * manifest is well-formed). Callers can `expect(...).toEqual([])` in tests
 * and skip wiring custom error throwers.
 */
export function findDuplicateAppRoutePaths(): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const r of APP_ROUTES) {
    if (seen.has(r.path)) dupes.add(r.path);
    seen.add(r.path);
  }
  return [...dupes].sort();
}

/**
 * Throws if the manifest has duplicate paths. Provided for callers that
 * prefer fail-fast semantics over array-based assertions.
 */
export function assertUniqueAppRouteManifestPaths(): void {
  const dupes = findDuplicateAppRoutePaths();
  if (dupes.length > 0) {
    throw new Error(
      `[appRouteManifest] Duplicate route path(s): ${dupes.join(", ")}`,
    );
  }
}
