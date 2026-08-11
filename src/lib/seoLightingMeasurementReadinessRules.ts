/**
 * Lighting launch measurement readiness — pure view-model for the two
 * lighting guide launch pages + GA4/GSC owner gates.
 *
 * No I/O. Snapshot facts mirror artifacts/seo/seo-readiness-status.json and
 * docs/seo/lighting-launch-verification.md so the operator UI works without
 * filesystem access in the browser.
 */

export type ReadinessStatus =
  "PASS" | "FAIL" | "BLOCKED" | "INCOMPLETE" | "NO_DATA" | "UNSET" | "NOT_STARTED" | "NOT_MEASURED";

export type ErrorType =
  | "NONE"
  | "AUTHENTICATED_ACCESS_UNAVAILABLE"
  | "ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS"
  | "CANONICAL_MISMATCH"
  | "SITEMAP_EXCLUSION"
  | "SITEMAP_DUPLICATE"
  | "HTTP_ERROR"
  | "OWNER_SETUP_INCOMPLETE"
  | "UNKNOWN";

export interface CanonicalCheck {
  readonly expected: string;
  readonly observed: string | null;
  readonly match: boolean;
  readonly detail: string;
}

export interface SitemapInclusionCheck {
  readonly included: boolean;
  readonly occurrences: number;
  readonly sitemapUrl: string;
  readonly detail: string;
}

export interface TechnicalCheck {
  readonly id: string;
  readonly label: string;
  readonly status: ReadinessStatus;
  readonly errorType: ErrorType;
  /** Short human explanation when not PASS. */
  readonly explanation: string | null;
  readonly canonical?: CanonicalCheck;
  readonly sitemap?: SitemapInclusionCheck;
}

export interface LaunchPageReadout {
  readonly id: string;
  readonly slug: string;
  readonly path: string;
  readonly title: string;
  readonly absoluteUrl: string;
  readonly overallStatus: ReadinessStatus;
  readonly checks: readonly TechnicalCheck[];
  /** Aggregate FAIL/BLOCKED explanations for the sticky summary. */
  readonly blockers: readonly string[];
}

export interface AccessGate {
  readonly id: "ga4" | "gsc";
  readonly label: string;
  readonly status: ReadinessStatus;
  readonly errorType: ErrorType;
  readonly reasonCode: string;
  readonly explanation: string;
  readonly ownerAction: string;
}

export interface VerificationStamp {
  readonly verifiedAtIso: string | null;
  readonly verifiedAtUtc: string | null;
  readonly verifiedAtChicago: string | null;
}

export interface ReadinessSummary {
  readonly overall: "Ready" | "Blocked";
  readonly readyCount: number;
  readonly blockedCount: number;
  readonly failCount: number;
  readonly incompleteCount: number;
  readonly headline: string;
  readonly nextAction: string;
}

export interface MeasurementReadinessModel {
  readonly scope: string;
  readonly productionHost: string;
  readonly timezone: string;
  readonly snapshotGeneratedAt: string;
  readonly snapshotGeneratedAtChicago: string;
  readonly verdict: string;
  readonly operatingMode: string;
  readonly day0Status: ReadinessStatus;
  readonly fourWeekClock: ReadinessStatus;
  readonly launchPages: readonly LaunchPageReadout[];
  readonly ga4: AccessGate;
  readonly gsc: AccessGate;
  readonly ga4Verification: VerificationStamp;
  readonly gscVerification: VerificationStamp;
  readonly summary: ReadinessSummary;
  readonly checklist: readonly {
    readonly id: string;
    readonly label: string;
    readonly status: ReadinessStatus;
    readonly group: "ga4" | "gsc" | "technical" | "day0";
  }[];
}

export const LIGHTING_PRODUCTION_HOST = "https://verdantgrowdiary.com";
export const LIGHTING_SITEMAP_URL = `${LIGHTING_PRODUCTION_HOST}/sitemap.xml`;

export const LIGHTING_LAUNCH_PAGES = [
  {
    id: "distance-schedule",
    slug: "cannabis-grow-light-distance-and-schedule",
    path: "/guides/cannabis-grow-light-distance-and-schedule",
    title: "Cannabis Grow Light Distance, PPFD & DLI Guide | Verdant",
  },
  {
    id: "light-stress",
    slug: "cannabis-light-stress-light-burn-bleaching-or-heat",
    path: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
    title: "Cannabis Light Stress: Burn, Bleaching, or Heat? | Verdant",
  },
] as const;

/** Snapshot aligned with artifacts/seo/seo-readiness-status.json (point-in-time). */
export const LIGHTING_READINESS_SNAPSHOT = {
  generated_at: "2026-08-02T05:19:48.245Z",
  generated_at_chicago: "2026-08-02T00:19:48.245-05:00",
  timezone: "America/Chicago",
  verdict: "NOT READY — ANALYTICS INSTRUMENTATION DEFECT FOUND",
  operating_mode: "MODE_A_ACCESS_BLOCKED_READINESS_WORK",
  day_0_status: "UNSET" as ReadinessStatus,
  four_week_clock_status: "NOT_STARTED" as ReadinessStatus,
  ga4_access_status: "BLOCKED" as ReadinessStatus,
  gsc_access_status: "BLOCKED" as ReadinessStatus,
  ga4_collection_contract_status: "FAIL" as ReadinessStatus,
  measurement_id: "G-MCXQ9GVS5H",
  stream_id: "15065867361",
  sitemap_url_count: 51,
} as const;

export function formatUtcLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Invalid timestamp";
  return d.toISOString().replace(".000Z", "Z");
}

export function formatChicagoLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Invalid timestamp";
  // en-US with explicit zone so the audit string is stable and readable.
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(d);
  return `${formatted} (America/Chicago)`;
}

export function buildVerificationStamp(iso: string | null | undefined): VerificationStamp {
  if (!iso || !iso.trim()) {
    return { verifiedAtIso: null, verifiedAtUtc: null, verifiedAtChicago: null };
  }
  const trimmed = iso.trim();
  return {
    verifiedAtIso: trimmed,
    verifiedAtUtc: formatUtcLabel(trimmed),
    verifiedAtChicago: formatChicagoLabel(trimmed),
  };
}

export function explainAccessBlocked(reasonCode: string): {
  errorType: ErrorType;
  explanation: string;
  ownerAction: string;
} {
  const code = reasonCode || "AUTHENTICATED_ACCESS_UNAVAILABLE";
  if (code === "AUTHENTICATED_ACCESS_UNAVAILABLE" || code === "BLOCKED") {
    return {
      errorType: "AUTHENTICATED_ACCESS_UNAVAILABLE",
      explanation:
        "Authenticated reporting is unavailable in this environment. Public probes cannot prove property identity, baselines, or URL Inspection results.",
      ownerAction:
        "Complete owner setup (property access + read-only reporting), then mark Verified with an audit timestamp. Do not paste credentials into the app.",
    };
  }
  if (code === "ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS") {
    return {
      errorType: "ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS",
      explanation:
        "GA4 Enhanced Measurement is still emitting automatic page_view on history changes beside Verdant's explicit SPA page_view — navigations will double-count.",
      ownerAction:
        "In the existing production stream: Enhanced Measurement → Page views → advanced → disable “Page changes based on browser history events”. Keep the app emitter; do not create a new stream.",
    };
  }
  return {
    errorType: "UNKNOWN",
    explanation: `Access or measurement gate is not ready (${code}).`,
    ownerAction: "Review docs/seo/analytics-owner-setup-checklist.md and resolve the named gate.",
  };
}

function passCheck(id: string, label: string): TechnicalCheck {
  return { id, label, status: "PASS", errorType: "NONE", explanation: null };
}

function buildLaunchPageReadout(
  page: (typeof LIGHTING_LAUNCH_PAGES)[number],
  opts: {
    httpStatus: number;
    sitemapOccurrences: number;
    canonicalObserved: string | null;
    /** When true, surface authenticated GA4/GSC as BLOCKED on the page readout. */
    accessBlocked: boolean;
    collectionContractFail: boolean;
  },
): LaunchPageReadout {
  const absoluteUrl = `${LIGHTING_PRODUCTION_HOST}${page.path}`;
  const canonicalMatch =
    opts.canonicalObserved === null ? true : opts.canonicalObserved === absoluteUrl;

  const checks: TechnicalCheck[] = [
    {
      id: "http",
      label: "Direct/deep URL HTTP",
      status: opts.httpStatus === 200 ? "PASS" : "FAIL",
      errorType: opts.httpStatus === 200 ? "NONE" : "HTTP_ERROR",
      explanation:
        opts.httpStatus === 200
          ? null
          : `Expected HTTP 200, observed ${opts.httpStatus}. Error type: HTTP_ERROR.`,
    },
    {
      id: "canonical",
      label: "Absolute self-canonical",
      status: canonicalMatch ? "PASS" : "FAIL",
      errorType: canonicalMatch ? "NONE" : "CANONICAL_MISMATCH",
      explanation: canonicalMatch
        ? null
        : `Canonical mismatch. Expected ${absoluteUrl}; observed ${opts.canonicalObserved ?? "(missing)"}. Error type: CANONICAL_MISMATCH.`,
      canonical: {
        expected: absoluteUrl,
        observed: opts.canonicalObserved,
        match: canonicalMatch,
        detail: canonicalMatch
          ? "Observed canonical matches the production absolute URL."
          : "Observed canonical does not match the expected production absolute URL.",
      },
    },
    {
      id: "sitemap",
      label: "Sitemap inclusion",
      status:
        opts.sitemapOccurrences === 1 ? "PASS" : opts.sitemapOccurrences === 0 ? "FAIL" : "FAIL",
      errorType:
        opts.sitemapOccurrences === 1
          ? "NONE"
          : opts.sitemapOccurrences === 0
            ? "SITEMAP_EXCLUSION"
            : "SITEMAP_DUPLICATE",
      explanation:
        opts.sitemapOccurrences === 1
          ? null
          : opts.sitemapOccurrences === 0
            ? `URL is not present in ${LIGHTING_SITEMAP_URL}. Error type: SITEMAP_EXCLUSION.`
            : `URL appears ${opts.sitemapOccurrences} times in the sitemap (expected 1). Error type: SITEMAP_DUPLICATE.`,
      sitemap: {
        included: opts.sitemapOccurrences > 0,
        occurrences: opts.sitemapOccurrences,
        sitemapUrl: LIGHTING_SITEMAP_URL,
        detail:
          opts.sitemapOccurrences === 1
            ? "Exactly one sitemap occurrence (PASS)."
            : opts.sitemapOccurrences === 0
              ? "Not included in production sitemap."
              : `Duplicate sitemap entries: ${opts.sitemapOccurrences}.`,
      },
    },
    passCheck("title", "One useful title"),
    passCheck("robots-meta", "index, follow"),
    passCheck("h1", "One page-level H1"),
    passCheck("json-ld", "JSON-LD parse / identity set"),
  ];

  if (opts.accessBlocked) {
    const explained = explainAccessBlocked("AUTHENTICATED_ACCESS_UNAVAILABLE");
    checks.push({
      id: "ga4-gsc-auth",
      label: "Authenticated GA4 / GSC page baseline",
      status: "BLOCKED",
      errorType: explained.errorType,
      explanation: `${explained.explanation} Error type: ${explained.errorType}. Owner action: ${explained.ownerAction}`,
    });
  }

  if (opts.collectionContractFail) {
    const explained = explainAccessBlocked("ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS");
    checks.push({
      id: "page-view-singleton",
      label: "GA4 page-view singleton contract",
      status: "FAIL",
      errorType: explained.errorType,
      explanation: `${explained.explanation} Error type: ${explained.errorType}. Owner action: ${explained.ownerAction}`,
    });
  }

  const blockers = checks
    .filter((c) => c.status === "FAIL" || c.status === "BLOCKED")
    .map((c) => `${c.label}: ${c.status} (${c.errorType}) — ${c.explanation ?? ""}`.trim());

  let overallStatus: ReadinessStatus = "PASS";
  if (checks.some((c) => c.status === "FAIL")) overallStatus = "FAIL";
  else if (checks.some((c) => c.status === "BLOCKED")) overallStatus = "BLOCKED";

  return {
    id: page.id,
    slug: page.slug,
    path: page.path,
    title: page.title,
    absoluteUrl,
    overallStatus,
    checks,
    blockers,
  };
}

export function buildMeasurementReadinessModel(input?: {
  ga4VerifiedAtIso?: string | null;
  gscVerifiedAtIso?: string | null;
  nowIso?: string;
}): MeasurementReadinessModel {
  const snap = LIGHTING_READINESS_SNAPSHOT;
  const accessBlocked =
    snap.ga4_access_status === "BLOCKED" || snap.gsc_access_status === "BLOCKED";
  const collectionFail = snap.ga4_collection_contract_status === "FAIL";

  const launchPages = LIGHTING_LAUNCH_PAGES.map((page) =>
    buildLaunchPageReadout(page, {
      httpStatus: 200,
      sitemapOccurrences: 1,
      canonicalObserved: `${LIGHTING_PRODUCTION_HOST}${page.path}`,
      accessBlocked,
      collectionContractFail: collectionFail,
    }),
  );

  const ga4Explained = explainAccessBlocked(
    collectionFail ? "ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS" : "AUTHENTICATED_ACCESS_UNAVAILABLE",
  );
  // Access remains BLOCKED even when collection contract also FAILs.
  const ga4Status: ReadinessStatus = snap.ga4_access_status;
  const ga4: AccessGate = {
    id: "ga4",
    label: "GA4",
    status: ga4Status,
    errorType:
      ga4Status === "BLOCKED"
        ? "AUTHENTICATED_ACCESS_UNAVAILABLE"
        : collectionFail
          ? "ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS"
          : "NONE",
    reasonCode:
      ga4Status === "BLOCKED"
        ? "AUTHENTICATED_ACCESS_UNAVAILABLE"
        : collectionFail
          ? "ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS"
          : "OK",
    explanation:
      ga4Status === "BLOCKED"
        ? explainAccessBlocked("AUTHENTICATED_ACCESS_UNAVAILABLE").explanation +
          (collectionFail
            ? ` Additionally: ${explainAccessBlocked("ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS").explanation}`
            : "")
        : ga4Explained.explanation,
    ownerAction:
      ga4Status === "BLOCKED"
        ? explainAccessBlocked("AUTHENTICATED_ACCESS_UNAVAILABLE").ownerAction +
          (collectionFail
            ? ` Also: ${explainAccessBlocked("ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS").ownerAction}`
            : "")
        : ga4Explained.ownerAction,
  };

  const gscExplained = explainAccessBlocked("AUTHENTICATED_ACCESS_UNAVAILABLE");
  const gsc: AccessGate = {
    id: "gsc",
    label: "Search Console",
    status: snap.gsc_access_status,
    errorType: gscExplained.errorType,
    reasonCode: "AUTHENTICATED_ACCESS_UNAVAILABLE",
    explanation: gscExplained.explanation,
    ownerAction: gscExplained.ownerAction,
  };

  const ga4Verification = buildVerificationStamp(input?.ga4VerifiedAtIso ?? null);
  const gscVerification = buildVerificationStamp(input?.gscVerifiedAtIso ?? null);

  const checklist = [
    {
      id: "tech-public",
      label: "Public technical SEO (both lighting URLs)",
      status: "PASS" as ReadinessStatus,
      group: "technical" as const,
    },
    {
      id: "sitemap-both",
      label: "Both URLs in production sitemap (1× each)",
      status: "PASS" as ReadinessStatus,
      group: "technical" as const,
    },
    {
      id: "ga4-access",
      label: "GA4 authenticated access + baseline",
      status: ga4.status,
      group: "ga4" as const,
    },
    {
      id: "ga4-singleton",
      label: "GA4 page-view singleton (Enhanced Measurement)",
      status: collectionFail ? ("FAIL" as ReadinessStatus) : ("PASS" as ReadinessStatus),
      group: "ga4" as const,
    },
    {
      id: "gsc-access",
      label: "Search Console authenticated access + baseline",
      status: gsc.status,
      group: "gsc" as const,
    },
    {
      id: "day0",
      label: "Measurement Day 0",
      status: snap.day_0_status,
      group: "day0" as const,
    },
  ];

  const readyCount = checklist.filter((c) => c.status === "PASS").length;
  const blockedCount = checklist.filter((c) => c.status === "BLOCKED").length;
  const failCount = checklist.filter((c) => c.status === "FAIL").length;
  const incompleteCount = checklist.filter(
    (c) => c.status === "INCOMPLETE" || c.status === "UNSET" || c.status === "NOT_STARTED",
  ).length;

  const overall: "Ready" | "Blocked" =
    failCount === 0 && blockedCount === 0 && incompleteCount === 0 ? "Ready" : "Blocked";

  const headline =
    overall === "Ready"
      ? "Ready — all measurement gates pass"
      : failCount > 0
        ? `Blocked — ${failCount} FAIL, ${blockedCount} BLOCKED`
        : `Blocked — ${blockedCount} BLOCKED gate(s)`;

  const nextAction = collectionFail
    ? "Disable Enhanced Measurement history page views, then re-verify collection."
    : blockedCount > 0
      ? "Complete GA4/GSC owner access, then mark Verified with timestamps."
      : "Capture Day 0 baselines and start the four-week clock.";

  return {
    scope: "LIGHTING_LAUNCH_MEASUREMENT",
    productionHost: LIGHTING_PRODUCTION_HOST,
    timezone: snap.timezone,
    snapshotGeneratedAt: snap.generated_at,
    snapshotGeneratedAtChicago: snap.generated_at_chicago,
    verdict: snap.verdict,
    operatingMode: snap.operating_mode,
    day0Status: snap.day_0_status,
    fourWeekClock: snap.four_week_clock_status,
    launchPages,
    ga4,
    gsc,
    ga4Verification,
    gscVerification,
    summary: {
      overall,
      readyCount,
      blockedCount,
      failCount,
      incompleteCount,
      headline,
      nextAction,
    },
    checklist,
  };
}
