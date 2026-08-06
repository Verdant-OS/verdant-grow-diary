import type { AppRouteEntry } from "../../src/lib/appRouteManifest";

export type FieldExercisePolicy = "fill-safe-fields" | "audit-only";

export type RouteContentExpectation =
  | {
      kind: "test-id";
      value: string;
      text?: string;
    }
  | {
      kind: "heading";
      value: string;
    }
  | {
      kind: "field";
      value: string;
    };

export type CoreCensusRoute = {
  path: string;
  expectedPathname?: string;
  expectedContent?: readonly RouteContentExpectation[];
  label: string;
  fieldPolicy: FieldExercisePolicy;
};

export const PRIVILEGED_ROUTE_PREFIXES = [
  "/admin",
  "/diagnostics",
  "/ingest-inspector",
  "/internal",
  "/leads",
  "/one-tent-loop-proof",
  "/operator",
  "/pi-ingest-status",
  "/sensors/ecowitt-audit",
  "/sensors/ingest-normalizer",
  "/demo/one-tent-live-proof",
] as const;

export const PUBLIC_CORE_CENSUS_ROUTES = [
  { path: "/welcome", label: "Welcome", fieldPolicy: "audit-only" },
  { path: "/auth", label: "Authentication", fieldPolicy: "fill-safe-fields" },
  { path: "/pricing", label: "Pricing", fieldPolicy: "audit-only" },
  { path: "/founder", label: "Founder Lifetime", fieldPolicy: "fill-safe-fields" },
  {
    path: "/checkout/success",
    label: "Checkout success return",
    fieldPolicy: "audit-only",
  },
  {
    path: "/checkout/cancel",
    label: "Checkout cancellation return",
    fieldPolicy: "audit-only",
  },
  { path: "/contact", label: "Contact", fieldPolicy: "fill-safe-fields" },
  { path: "/feedback", label: "Feedback", fieldPolicy: "fill-safe-fields" },
  { path: "/cultivars", label: "Cultivar library", fieldPolicy: "fill-safe-fields" },
  {
    path: "/cultivars/sour-stomper",
    label: "Cultivar detail",
    fieldPolicy: "fill-safe-fields",
  },
  { path: "/guides", label: "Grower guides", fieldPolicy: "audit-only" },
  {
    path: "/guides/cronk-nutrients-grow-diary",
    label: "CRONK nutrient diary guide",
    fieldPolicy: "audit-only",
  },
  {
    path: "/guides/grow-stage-care-guide",
    label: "Grow-stage care guide",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/customer/guide/oreoz-vs-gelonade-comparison",
    label: "Next Door Cannabis customer comparison",
    fieldPolicy: "audit-only",
  },
  {
    path: "/hardware-integrations",
    label: "Hardware integrations",
    fieldPolicy: "audit-only",
  },
  {
    path: "/how-ai-doctor-works",
    label: "AI Doctor explainer",
    fieldPolicy: "audit-only",
  },
  { path: "/glossary", label: "Glossary", fieldPolicy: "fill-safe-fields" },
  { path: "/quick-log", label: "Public Quick Log", fieldPolicy: "fill-safe-fields" },
  {
    path: "/sensors/csv-preview",
    label: "Local sensor CSV preview",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/partners/csv-preview",
    label: "Partner CSV preview",
    fieldPolicy: "audit-only",
  },
  {
    path: "/tools/vpd-calculator",
    label: "VPD calculator",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/ai-doctor-readiness-check",
    label: "AI Doctor readiness check",
    fieldPolicy: "fill-safe-fields",
  },
  { path: "/docs/mcp-api", label: "MCP API docs", fieldPolicy: "audit-only" },
  { path: "/breeder-beta", label: "Breeder beta", fieldPolicy: "fill-safe-fields" },
  { path: "/creator-beta", label: "Creator beta", fieldPolicy: "fill-safe-fields" },
  {
    path: "/pheno-comparison",
    label: "Public Pheno Comparison",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/pheno-expression-showcase",
    label: "Pheno expression showcase",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/internal/contextual-pheno-comparison-demo",
    label: "Contextual Pheno Comparison demo",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/pheno-hunts/55555555-5555-4555-8555-555555555555/compare",
    label: "Public Pheno Hunt comparison",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/pheno-hunts/55555555-5555-4555-8555-555555555555/showcase",
    label: "Public Pheno Hunt showcase",
    fieldPolicy: "fill-safe-fields",
  },
  { path: "/reset-password", label: "Reset password", fieldPolicy: "fill-safe-fields" },
  { path: "/unsubscribe", label: "Unsubscribe", fieldPolicy: "fill-safe-fields" },
  { path: "/terms", label: "Terms", fieldPolicy: "audit-only" },
  { path: "/privacy", label: "Privacy", fieldPolicy: "audit-only" },
  { path: "/refund", label: "Refund policy", fieldPolicy: "audit-only" },
] as const satisfies readonly CoreCensusRoute[];

export const AUTHENTICATED_CORE_CENSUS_ROUTES = [
  { path: "/dashboard", label: "Dashboard", fieldPolicy: "fill-safe-fields" },
  {
    path: "/daily-check?plantId=33333333-3333-4333-8333-333333333333&growId=11111111-1111-4111-8111-111111111111",
    expectedPathname: "/daily-check",
    label: "Daily Grow Check",
    fieldPolicy: "fill-safe-fields",
  },
  { path: "/grows", label: "My Grows", fieldPolicy: "fill-safe-fields" },
  { path: "/tents", label: "Tents", fieldPolicy: "fill-safe-fields" },
  { path: "/plants", label: "Plants", fieldPolicy: "fill-safe-fields" },
  { path: "/timeline", label: "Timeline", fieldPolicy: "fill-safe-fields" },
  { path: "/sensors", label: "Sensors", fieldPolicy: "fill-safe-fields" },
  { path: "/actions", label: "Action Queue", fieldPolicy: "fill-safe-fields" },
  {
    path: "/actions/77777777-7777-4777-8777-777777777777",
    label: "Action Queue detail",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [
      {
        kind: "test-id",
        value: "action-detail-ai-doctor-provenance",
        text: "Source: AI Doctor",
      },
    ],
  },
  { path: "/alerts", label: "Alerts", fieldPolicy: "fill-safe-fields" },
  {
    path: "/alerts/88888888-8888-4888-8888-888888888888",
    label: "Alert detail",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [{ kind: "heading", value: "Mocked VPD review" }],
  },
  { path: "/doctor", label: "AI Doctor", fieldPolicy: "fill-safe-fields" },
  {
    path: "/doctor/sessions",
    label: "AI Doctor history",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/doctor/sessions/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    label: "AI Doctor session detail",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [
      {
        kind: "test-id",
        value: "ai-doctor-session-detail-question",
        text: "What should I verify next?",
      },
    ],
  },
  { path: "/reports", label: "Reports", fieldPolicy: "fill-safe-fields" },
  {
    path: "/reports/diary-range",
    label: "Diary range report",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/diary/environment-summary",
    label: "Environment summary",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/diary/pheno-expression-comparison",
    label: "Oreoz and Gelonade diary comparison",
    fieldPolicy: "audit-only",
    expectedContent: [{ kind: "test-id", value: "oreoz-gelonade-diary-comparison" }],
  },
  {
    path: "/diary/strains/oreoz",
    label: "Oreoz phenotype diary profile",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [{ kind: "test-id", value: "cultivar-diary-profile-oreoz" }],
  },
  {
    path: "/reports/post-grow/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    label: "Post-grow report",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [{ kind: "test-id", value: "post-grow-report-page" }],
  },
  { path: "/settings", label: "Settings", fieldPolicy: "audit-only" },
  {
    path: "/settings/agent-integrations",
    label: "Agent integrations",
    fieldPolicy: "audit-only",
  },
  {
    path: "/settings/analytics",
    label: "Analytics consent",
    fieldPolicy: "audit-only",
  },
  {
    path: "/account/preferences",
    label: "Account preferences",
    fieldPolicy: "audit-only",
  },
  { path: "/invite", label: "Grower invite", fieldPolicy: "fill-safe-fields" },
  { path: "/breeding", label: "Breeding programs", fieldPolicy: "fill-safe-fields" },
  {
    path: "/breeding/new",
    label: "New breeding program",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/breeding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    label: "Breeding program detail",
    fieldPolicy: "audit-only",
    expectedContent: [{ kind: "heading", value: "Core Census Breeding Program" }],
  },
  {
    path: "/breeding/log/new?growId=11111111-1111-4111-8111-111111111111",
    expectedPathname: "/breeding/log/new",
    label: "New breeding log event",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [
      { kind: "heading", value: "Log Breeding Event" },
      { kind: "field", value: "Plant" },
    ],
  },
  { path: "/genetics", label: "Genetics library", fieldPolicy: "fill-safe-fields" },
  {
    path: "/genetics/accessions/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    label: "Genetics accession detail",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [{ kind: "heading", value: "Sour Stomper" }],
  },
  {
    path: "/genetics/batches/dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    label: "Genetics propagation batch detail",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [{ kind: "heading", value: "Core Census Batch" }],
  },
  {
    path: "/genetics/health/accession/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    label: "Genetics health evidence",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [
      { kind: "test-id", value: "screening-row", text: "HLVd" },
      { kind: "test-id", value: "quarantine-row", text: "HLVd" },
    ],
  },
  {
    path: "/genetics/trace/accession/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    label: "Genetics traceability",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [
      {
        kind: "test-id",
        value: "trace-node",
        text: "Core Census Sour Stomper Accession",
      },
    ],
  },
  { path: "/pheno-hunts", label: "Pheno Hunts", fieldPolicy: "fill-safe-fields" },
  {
    path: "/pheno-hunts/new?growId=11111111-1111-4111-8111-111111111111&tentId=22222222-2222-4222-8222-222222222222",
    expectedPathname: "/pheno-hunts/new",
    label: "New Pheno Hunt",
    fieldPolicy: "fill-safe-fields",
  },
  {
    path: "/pheno-hunts/55555555-5555-4555-8555-555555555555/workspace",
    label: "Pheno Hunt workspace",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [{ kind: "test-id", value: "pheno-workspace" }],
  },
  {
    path: "/pheno-hunts/55555555-5555-4555-8555-555555555555/keepers",
    label: "Pheno Hunt keepers",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [{ kind: "test-id", value: "pheno-keepers" }],
  },
  { path: "/grow-lineage", label: "Grow lineage", fieldPolicy: "audit-only" },
  {
    path: "/grows/11111111-1111-4111-8111-111111111111",
    label: "Grow detail",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [{ kind: "test-id", value: "grow-status-card" }],
  },
  {
    path: "/grows/11111111-1111-4111-8111-111111111111/learning",
    label: "Grow learning report",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [
      {
        kind: "test-id",
        value: "plant-memory-episode-ffffffff-ffff-4fff-8fff-ffffffffffff",
      },
    ],
  },
  {
    path: "/plants/33333333-3333-4333-8333-333333333333",
    label: "Plant detail",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [{ kind: "test-id", value: "plant-detail-tent", text: "Core Census Tent" }],
  },
  {
    path: "/tents/22222222-2222-4222-8222-222222222222",
    label: "Tent detail",
    fieldPolicy: "fill-safe-fields",
    expectedContent: [{ kind: "test-id", value: "tent-detail-metric-chips" }],
  },
  { path: "/onboarding", label: "Onboarding", fieldPolicy: "fill-safe-fields" },
  { path: "/start-room", label: "Start your room", fieldPolicy: "fill-safe-fields" },
  { path: "/health", label: "App health", fieldPolicy: "audit-only" },
] as const satisfies readonly CoreCensusRoute[];

export type LinkDisposition =
  | "navigate"
  | "excluded-privileged"
  | "external"
  | "fragment"
  | "contact"
  | "download"
  | "unsafe"
  | "unknown-route";

export type LinkClassification = {
  disposition: LinkDisposition;
  href: string;
  pathname?: string;
  /**
   * Fragment WITHOUT the leading "#", when the link carries one. Retained so
   * the click sweep can tell a same-document fragment link (which changes only
   * the hash) from a real navigation: asserting the hash-stripped pathname on
   * such a link is trivially true BEFORE the click and proves nothing.
   */
  hash?: string;
  reason?: string;
};

export type LinkDescriptor = {
  href: string | null;
  download?: boolean;
};

export function visibleLinkByHrefSelector(href: string): string {
  return `a[href=${JSON.stringify(href)}]:visible`;
}

const READ_ONLY_EDGE_FUNCTIONS = new Set([
  "environment-summary-report-entitlement",
  "founder-slots-remaining",
  "premium-export-entitlement",
]);

const READ_ONLY_RPCS = new Set([
  "genetics_trace_resolve",
  "get_latest_tent_sensor_snapshot",
  "has_role",
  "verdant_search",
]);

export function isReadOnlyRpc(rpcName: string): boolean {
  return READ_ONLY_RPCS.has(rpcName);
}

export function isReadOnlyEdgeFunction(functionName: string): boolean {
  return (
    /^(check-|count-|get-|health|list-|preview-|resolve-|status)/.test(functionName) ||
    READ_ONLY_EDGE_FUNCTIONS.has(functionName)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routePatternToRegExp(pattern: string): RegExp {
  const segments = pattern.split("/").map((segment) => {
    if (segment.startsWith(":")) return "[^/]+";
    return escapeRegExp(segment);
  });
  return new RegExp(`^${segments.join("/")}/?$`);
}

export function matchesKnownAppRoute(
  pathname: string,
  manifestPatterns: readonly string[],
): boolean {
  return manifestPatterns
    .filter((pattern) => pattern !== "*")
    .some((pattern) => routePatternToRegExp(pattern).test(pathname));
}

export function missingAuthenticatedCensusRoutePatterns(
  manifest: ReadonlyArray<Pick<AppRouteEntry, "path" | "access">>,
  routes: readonly CoreCensusRoute[],
): string[] {
  const assignedPatterns = new Set(
    routes
      .map((route) => new URL(route.path, "http://localhost").pathname)
      .map((pathname) => matchingManifestRoute(pathname, manifest)?.path)
      .filter((pattern): pattern is string => pattern !== undefined),
  );
  return manifest
    .filter((route) => route.access === "auth")
    .map((route) => route.path)
    .filter((pattern) => !assignedPatterns.has(pattern))
    .sort();
}

export function missingAuthenticatedDynamicRouteSuccessContracts(
  manifest: ReadonlyArray<Pick<AppRouteEntry, "path" | "access">>,
  routes: readonly CoreCensusRoute[],
): string[] {
  const contractedPatterns = new Set(
    routes
      .filter((route) => (route.expectedContent?.length ?? 0) > 0)
      .map((route) => new URL(route.path, "http://localhost").pathname)
      .map((pathname) => matchingManifestRoute(pathname, manifest)?.path)
      .filter((pattern): pattern is string => pattern !== undefined),
  );

  return manifest
    .filter(
      (route) =>
        route.access === "auth" && route.path.split("/").some((segment) => segment.startsWith(":")),
    )
    .map((route) => route.path)
    .filter((pattern) => !contractedPatterns.has(pattern))
    .sort();
}

function matchingManifestRoute(
  pathname: string,
  manifest: ReadonlyArray<Pick<AppRouteEntry, "path" | "access">>,
): Pick<AppRouteEntry, "path" | "access"> | undefined {
  return manifest
    .filter((route) => route.path !== "*" && routePatternToRegExp(route.path).test(pathname))
    .sort((left, right) => {
      const leftDynamicSegments = left.path
        .split("/")
        .filter((segment) => segment.startsWith(":")).length;
      const rightDynamicSegments = right.path
        .split("/")
        .filter((segment) => segment.startsWith(":")).length;
      return (
        leftDynamicSegments - rightDynamicSegments ||
        right.path.length - left.path.length ||
        left.path.localeCompare(right.path)
      );
    })[0];
}

export function expectedCensusNavigationPath(
  pathname: string,
  manifest: ReadonlyArray<Pick<AppRouteEntry, "path" | "access">>,
  signedIn: boolean,
): string {
  if (signedIn) return pathname;

  const route = matchingManifestRoute(pathname, manifest);
  if (route && ["auth", "operator", "internal"].includes(route.access)) {
    return "/welcome";
  }
  return pathname;
}

export function isPrivilegedRoute(pathname: string): boolean {
  return PRIVILEGED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function classifyLink(
  descriptor: LinkDescriptor,
  manifestPatterns: readonly string[],
  appOrigin = "http://localhost:5173",
): LinkClassification {
  const href = descriptor.href?.trim() ?? "";
  if (!href) {
    return { disposition: "unsafe", href, reason: "empty href" };
  }
  if (descriptor.download) {
    return { disposition: "download", href };
  }
  if (href.startsWith("#")) {
    return { disposition: "fragment", href };
  }
  if (/^(mailto|tel):/i.test(href)) {
    return { disposition: "contact", href };
  }
  if (/^(javascript|data|vbscript):/i.test(href)) {
    return { disposition: "unsafe", href, reason: "unsafe URL scheme" };
  }

  let target: URL;
  let origin: URL;
  try {
    origin = new URL(appOrigin);
    target = new URL(href, origin);
  } catch {
    return { disposition: "unsafe", href, reason: "malformed URL" };
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return { disposition: "unsafe", href, reason: "unsupported URL scheme" };
  }
  if (target.origin !== origin.origin) {
    return { disposition: "external", href };
  }

  const pathname = target.pathname;
  if (isPrivilegedRoute(pathname)) {
    return { disposition: "excluded-privileged", href, pathname };
  }
  if (!matchesKnownAppRoute(pathname, manifestPatterns)) {
    return {
      disposition: "unknown-route",
      href,
      pathname,
      reason: "same-origin link does not match the app route manifest",
    };
  }
  const hash = target.hash ? target.hash.replace(/^#/, "") : "";
  return { disposition: "navigate", href, pathname, ...(hash ? { hash } : {}) };
}

export type CensusFieldDescriptor = {
  type: string;
  accessibleName: string;
  min?: string | null;
  max?: string | null;
  step?: string | null;
};

export type CensusSelectOption = {
  value: string;
  disabled: boolean;
};

export function selectAvailableAlternativeValue(
  options: readonly CensusSelectOption[],
  currentValue: string,
): string | undefined {
  return options.find(
    (option) => !option.disabled && option.value !== "" && option.value !== currentValue,
  )?.value;
}

export type FallbackSelectObservedState = {
  disabled: boolean;
  visible: boolean;
  receivesEvents: boolean;
  options: readonly CensusSelectOption[];
};

/**
 * Decides whether an exercise failure on a fallback select (one with no
 * unique accessible-name locator) is a real product defect or locator churn.
 * Fatal requires positive proof the exercised element stayed put: the live
 * nth() query must still resolve to the very DOM node that was snapshotted
 * (`liveElementIsSnapshotElement` — repeated selects can share an identical
 * option list, so option equality alone cannot prove identity) AND that
 * node's full observed state must still match the snapshot — the control's
 * own disabled flag (an async loading state can disable the whole select)
 * plus every option's value and disabled flag (a re-render can mutate a
 * reused node's options in place, including disabling the chosen
 * alternative). Only then did the value fail to stick on a stable, enabled
 * select — a broken onChange. Any missing proof (a different node, changed
 * state, or an element that can no longer be resolved) is churn and
 * downgrades to an unexercised audit entry.
 */
export function fallbackSelectExerciseFailureIsFatal(
  snapshot: FallbackSelectObservedState,
  live: FallbackSelectObservedState | undefined,
  liveElementIsSnapshotElement: boolean,
): boolean {
  // A control that was already disabled, hidden, or event-blocked (overlay /
  // pointer-events) when snapshotted can never prove a broken onChange — the
  // transition itself, arriving after the earlier checks, is churn.
  if (snapshot.disabled || !snapshot.visible || !snapshot.receivesEvents) return false;
  if (!liveElementIsSnapshotElement || !live) return false;
  // A control that became disabled, hidden, or event-blocked by catch time
  // timed out on actionability, not on a value that failed to stick.
  if (live.disabled || !live.visible || !live.receivesEvents) return false;
  return (
    live.options.length === snapshot.options.length &&
    live.options.every(
      (option, index) =>
        option.value === snapshot.options[index].value &&
        option.disabled === snapshot.options[index].disabled,
    )
  );
}

const NON_FILLABLE_FIELD_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function isSafelyFillableFieldType(type: string): boolean {
  return !NON_FILLABLE_FIELD_TYPES.has(type.toLowerCase());
}

function boundedNumberValue(
  minValue: string | null | undefined,
  maxValue: string | null | undefined,
  stepValue: string | null | undefined,
): string {
  const min = Number.parseFloat(minValue ?? "");
  const max = Number.parseFloat(maxValue ?? "");
  const step = Number.parseFloat(stepValue ?? "");
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const candidate = safeMin + safeStep;
  const bounded = Number.isFinite(max) ? Math.min(candidate, max) : candidate;
  return String(bounded);
}

function clampPreferredNumber(
  preferred: number,
  minValue: string | null | undefined,
  maxValue: string | null | undefined,
): string {
  const min = Number.parseFloat(minValue ?? "");
  const max = Number.parseFloat(maxValue ?? "");
  const lowerBounded = Number.isFinite(min) ? Math.max(preferred, min) : preferred;
  return String(Number.isFinite(max) ? Math.min(lowerBounded, max) : lowerBounded);
}

export function placeholderValueForField(field: CensusFieldDescriptor): string {
  const type = field.type.toLowerCase();
  const name = field.accessibleName.toLowerCase();

  if (type === "email") return "verdant-census@example.invalid";
  if (type === "password") return "Verdant-Census-Only-123!";
  if (type === "tel") return "5550100199";
  if (type === "url") return "https://example.invalid/verdant-census";
  if (type === "date") return "2026-07-01";
  if (type === "datetime-local") return "2026-07-01T12:00";
  if (type === "month") return "2026-07";
  if (type === "time") return "12:00";
  if (type === "week") return "2026-W27";
  if (type === "number") {
    if (name.includes("humidity")) return clampPreferredNumber(55, field.min, field.max);
    if (name.includes("temperature") || name.includes("temp")) {
      return clampPreferredNumber(75, field.min, field.max);
    }
    if (name.includes("ppm")) return clampPreferredNumber(750, field.min, field.max);
    if (name.includes("ec")) return clampPreferredNumber(1.5, field.min, field.max);
    if (name.includes("ph")) return clampPreferredNumber(6.3, field.min, field.max);
    return boundedNumberValue(field.min, field.max, field.step);
  }
  if (type === "search" || name.includes("search") || name.includes("filter")) {
    return "Cronk nutrients";
  }
  if (name.includes("email")) return "verdant-census@example.invalid";
  if (name.includes("name")) return "Verdant Census Grower";
  if (name.includes("subject")) return "Browser census check";
  if (
    name.includes("note") ||
    name.includes("observation") ||
    name.includes("message") ||
    name.includes("feedback")
  ) {
    return "Mocked browser census observation. No live data.";
  }
  return "Verdant browser census";
}
