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
export type AppRouteAccess = "public" | "auth" | "operator" | "internal" | "redirect";

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
  { path: "/.lovable/oauth/consent", access: "public", description: "OAuth consent screen." },
  { path: "/account/preferences", access: "auth" },
  { path: "/action-queue", access: "redirect", description: "→ /actions" },
  { path: "/actions", access: "auth" },
  { path: "/actions/:actionId", access: "auth" },
  { path: "/admin/leads", access: "internal" },
  { path: "/ai-doctor", access: "redirect", description: "→ /doctor" },
  { path: "/alerts", access: "auth" },
  { path: "/alerts/:alertId", access: "auth" },
  { path: "/auth", access: "public" },
  {
    path: "/billing/:plan",
    access: "redirect",
    description: "→ /pricing?plan=<canonical> (legacy billing entry; /pricing owns live checkout).",
  },
  { path: "/breeder-beta", access: "public", description: "Breeder beta landing page." },
  { path: "/breeding", access: "auth" },
  { path: "/breeding/:programId", access: "auth" },
  { path: "/breeding/new", access: "auth", description: "New breeding event entry." },
  { path: "/checkout/cancel", access: "public", description: "Checkout cancelled landing page." },
  { path: "/checkout/success", access: "public", description: "Checkout success landing page." },
  { path: "/creator-beta", access: "public", description: "Creator beta landing page." },
  {
    path: "/customer/:shareId",
    access: "public",
    description: "Customer Mode QR guide shell (read-only, no private grow data).",
  },
  { path: "/daily-check", access: "auth" },
  { path: "/demo", access: "redirect", description: "→ /welcome" },
  {
    path: "/demo/one-tent-live-proof",
    access: "operator",
    description: "One-tent live proof page (legacy /demo path, operator-only).",
  },
  { path: "/diagnostics", access: "operator" },
  {
    path: "/diary/environment-summary",
    access: "auth",
    description: "Environment summary report (diary).",
  },
  { path: "/doctor", access: "auth" },
  { path: "/doctor/sessions", access: "auth" },
  { path: "/doctor/sessions/:sessionId", access: "auth" },
  { path: "/features", access: "redirect", description: "→ /welcome" },
  { path: "/glossary", access: "public" },
  { path: "/grow-lineage", access: "auth" },
  { path: "/grow-room", access: "redirect", description: "→ /" },
  { path: "/grows", access: "auth" },
  { path: "/grows/:growId", access: "auth" },
  {
    path: "/grows/:growId/learning",
    access: "auth",
    description: "Post-grow learning report for a specific grow.",
  },
  { path: "/guides", access: "public", description: "Grower guides index." },
  {
    path: "/guides/grow-stage-care-guide",
    access: "public",
    description: "Searchable grow-stage care guide with checklists.",
  },
  { path: "/guides/:slug", access: "public", description: "Individual grower guide page." },
  { path: "/hardware-integrations", access: "public" },
  { path: "/health", access: "auth", description: "Health check page." },
  { path: "/how-ai-doctor-works", access: "public", description: "AI Doctor explainer page." },
  { path: "/ingest-inspector", access: "operator" },
  {
    path: "/internal/ai-doctor-confidence-audit",
    access: "internal",
    description: "AI Doctor confidence internal static audit.",
  },
  {
    path: "/internal/ai-doctor-phase1-preview",
    access: "internal",
    description: "Static Phase 1 view model preview.",
  },
  {
    path: "/internal/contextual-pheno-comparison-demo",
    access: "internal",
    description: "Internal read-only Contextual Pheno Comparison v0.1 demo (fixture data only).",
  },
  {
    path: "/internal/demo-proof-walkthrough",
    access: "internal",
    description: "Read-only operator walkthrough of the V0 One-Tent Loop proof path.",
  },
  {
    path: "/internal/one-tent-loop-proof",
    access: "internal",
    description: "One-tent loop internal proof checklist.",
  },
  {
    path: "/internal/sensor-truth-audit",
    access: "internal",
    description: "Sensor truth internal static audit.",
  },
  { path: "/leads", access: "internal" },
  { path: "/login", access: "redirect", description: "→ /auth" },
  { path: "/logs", access: "redirect", description: "→ /timeline" },
  {
    path: "/onboarding",
    access: "auth",
    description: "Post-sign-in start-screen choice (diary-first default).",
  },
  {
    path: "/one-tent-loop-proof",
    access: "internal",
    description: "Live one-tent loop proof page (operator-gated).",
  },
  {
    path: "/operator/ai-doctor-phase1",
    access: "operator",
    description: "Operator AI Doctor Phase 1 results page.",
  },
  {
    path: "/operator/billing-entitlement-resolution",
    access: "operator",
    description: "Operator billing entitlement resolution audit (read-only).",
  },
  {
    path: "/operator/billing-subscription-updates",
    access: "operator",
    description: "Operator billing subscription update audit (read-only).",
  },
  {
    path: "/operator/demo-preview",
    access: "operator",
    description: "Operator demo preview page (read-only).",
  },
  { path: "/operator/ecowitt", access: "operator", description: "Cloud Canary preview." },
  {
    path: "/operator/ecowitt-bridge-debug",
    access: "operator",
    description: "EcoWitt bridge debug (read-only).",
  },
  {
    path: "/operator/ecowitt-bridge-status",
    access: "operator",
    description: "EcoWitt bridge status (read-only).",
  },
  {
    path: "/operator/ecowitt-live-bringup",
    access: "operator",
    description: "EcoWitt live bring-up tooling (read-only).",
  },
  {
    path: "/operator/ecowitt-tent-preview",
    access: "operator",
    description: "EcoWitt per-tent preview (read-only).",
  },
  {
    path: "/operator/ggs-real-payload-ingest",
    access: "operator",
    description: "GGS Sentinel smoke runner verdict over real Spider Farmer GGS rows.",
  },
  {
    path: "/operator/one-tent-live-proof",
    access: "operator",
    description: "Operator one-tent live proof page.",
  },
  {
    path: "/operator/one-tent-loop-smoke-test",
    access: "operator",
    description: "Operator one-tent loop smoke test (read-only).",
  },
  {
    path: "/operator/one-tent-proof-record",
    access: "operator",
    description: "One-tent proof record export.",
  },
  {
    path: "/operator/paddle-processing-audit",
    access: "operator",
    description: "Operator Paddle processing audit (read-only).",
  },
  {
    path: "/operator/post-grow-reflection-dry-run",
    access: "operator",
    description: "Post-Grow Reflection dry-run diagnostics panel (read-only).",
  },
  {
    path: "/operator/release-readiness",
    access: "operator",
    description: "Operator release readiness checklist (read-only).",
  },
  {
    path: "/pheno-comparison",
    access: "public",
    description:
      "Read-only Pheno Comparison preview (sample data, mounted outside AuthProvider/GrowsProvider/AppShell — no grows read, no write chrome).",
  },
  {
    path: "/pheno-expression-showcase",
    access: "public",
    description: "Mix-and-match showcase of example phenos (fixture-only, network-free).",
  },
  {
    path: "/pheno-hunts/:id/compare",
    access: "public",
    description: "Per-hunt comparison (read-only, graceful without session).",
  },
  {
    path: "/pheno-hunts/:id/keepers",
    access: "auth",
    description: "Pheno hunt keepers selection.",
  },
  { path: "/pheno-hunts/:id/workspace", access: "auth", description: "Pheno hunt workspace." },
  { path: "/pheno-hunts/new", access: "auth", description: "New pheno hunt entry." },
  { path: "/pi-ingest-status", access: "operator" },
  { path: "/plants", access: "auth" },
  { path: "/plants/:id", access: "auth" },
  { path: "/pricing", access: "public" },
  { path: "/privacy", access: "public", description: "Privacy policy page." },
  { path: "/privacy-policy", access: "redirect", description: "→ /privacy" },
  {
    path: "/quick-log",
    access: "public",
    description:
      "Public 30-second Quick Log starter (local draft on this device only; routes to signup with allow-listed UTM attribution).",
  },
  { path: "/refund", access: "public", description: "Refund policy page." },
  { path: "/refund-policy", access: "redirect", description: "→ /refund" },
  { path: "/refunds", access: "redirect", description: "→ /refund" },
  { path: "/register", access: "redirect", description: "→ /auth" },
  { path: "/reports", access: "auth" },
  { path: "/reports/post-grow/:growId", access: "auth", description: "Post-grow learning report." },
  { path: "/reset-password", access: "public", description: "Password reset landing page." },
  { path: "/sensors", access: "auth" },
  { path: "/sensors/ecowitt-audit", access: "operator" },
  { path: "/sensors/ingest-normalizer", access: "operator" },
  { path: "/settings", access: "auth" },
  {
    path: "/settings/agent-integrations",
    access: "auth",
    description: "Agent integrations settings.",
  },
  { path: "/signup", access: "redirect", description: "→ /auth" },
  { path: "/tasks", access: "auth" },
  { path: "/tents", access: "auth" },
  { path: "/tents/:id", access: "auth" },
  { path: "/terms", access: "public", description: "Terms of service page." },
  { path: "/terms-of-service", access: "redirect", description: "→ /terms" },
  { path: "/timeline", access: "auth" },
  { path: "/upgrade", access: "public", description: "Upgrade / pricing presenter page." },
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
export function getRoutesByAccess(access: AppRouteAccess): ReadonlyArray<AppRouteEntry> {
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
    throw new Error(`[appRouteManifest] Duplicate route path(s): ${dupes.join(", ")}`);
  }
}
