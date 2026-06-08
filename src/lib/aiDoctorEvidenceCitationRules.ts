/**
 * aiDoctorEvidenceCitationRules — pure mapping from a recommendation line
 * to a short, source-honest evidence citation.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O.
 *  - Local/test Environment Check evidence NEVER labeled as "Live".
 *  - Derived VPD must be labeled "Derived VPD context", not raw telemetry.
 *  - Rejected / not_checked / stale / invalid metrics → weak/not healthy.
 *  - If no direct evidence supports a recommendation → "Needs more evidence".
 *  - Visible copy must not echo tokens, user_id, service_role, bridge
 *    tokens, auth headers, or raw internal IDs.
 */

export type CitationKind =
  | "env_metric"
  | "env_metric_derived"
  | "env_metric_weak"
  | "missing_metric"
  | "diary_photo_missing"
  | "none";

export interface EvidenceCitation {
  /** Short readable label, e.g. "Env Check: humidity_pct". */
  label: string;
  kind: CitationKind;
  /** Whether the cited evidence is supportive (true) or weak/missing (false). */
  healthy: boolean;
  /** Stable anchor (slug) to scroll to inside the Evidence used panel. */
  targetId: string;
  /** ARIA label for screen readers. */
  ariaLabel: string;
}

export interface CitationAvailableMetric {
  /** Required metric key, e.g. "humidity_pct". */
  key: string;
  /** "Accepted" | "Rejected" | "Not checked" | "Unknown". */
  statusLabel: string;
  /** True when this metric came from a derived source (e.g. VPD). */
  derived: boolean;
  /** Optional last value (display only). */
  value?: number | string | null;
  /** Optional rejection / status reason for weak metrics. */
  reason?: string | null;
}

export interface CitationContext {
  /** Required metrics that are present on the latest accepted Env Check. */
  availableMetrics: readonly CitationAvailableMetric[];
  /** Required metrics that are missing (needed checklist items). */
  missingMetrics: readonly string[];
  hasRecentDiary: boolean;
  hasRecentPhotos: boolean;
  /** Optional captured_at for the latest Environment Check. */
  envCheckCapturedAt?: string | null;
}

const METRIC_KEYWORDS: Array<{ key: string; re: RegExp }> = [
  { key: "humidity_pct", re: /\b(humidity|rh|relative\s*humidity)\b/i },
  { key: "temp_f", re: /\b(temp|temperature|heat|cool)\b/i },
  { key: "vpd_kpa", re: /\bvpd\b/i },
  { key: "co2_ppm", re: /\bco2\b/i },
  {
    key: "soil_moisture_pct",
    re: /\b(soil\s*moisture|irrigation|water(?:ing)?|runoff|dry\s*back)\b/i,
  },
];

const DIARY_PHOTO_RE =
  /\b(photo|photos|picture|image|leaf|canopy|posture|visual|diary|log|note|journal|observe)\b/i;

const NO_EVIDENCE_LABEL = "Needs more evidence";

function safeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function findFirstMetric(text: string): string | null {
  for (const { key, re } of METRIC_KEYWORDS) {
    if (re.test(text)) return key;
  }
  return null;
}

/**
 * Resolve a single recommendation line into a cautious evidence citation.
 * Returns at most one citation per recommendation to keep the UI scannable.
 */
export function resolveEvidenceCitation(
  recommendation: string,
  ctx: CitationContext,
): EvidenceCitation {
  const text = typeof recommendation === "string" ? recommendation : "";
  const metricKey = findFirstMetric(text);

  if (metricKey) {
    const missing = ctx.missingMetrics.includes(metricKey);
    if (missing) {
      return {
        label: `Missing: ${metricKey}`,
        kind: "missing_metric",
        healthy: false,
        targetId: `evidence-missing-${safeSlug(metricKey)}`,
        ariaLabel: `Missing Environment Check metric ${metricKey}. Needs more data.`,
      };
    }
    const avail = ctx.availableMetrics.find((m) => m.key === metricKey);
    if (avail) {
      if (avail.derived && metricKey === "vpd_kpa") {
        return {
          label: "Derived VPD context",
          kind: "env_metric_derived",
          healthy: false,
          targetId: `evidence-envcheck-${safeSlug(metricKey)}`,
          ariaLabel:
            "Derived VPD context from local Environment Check, not raw telemetry.",
        };
      }
      if (avail.statusLabel === "Accepted") {
        return {
          label: `Env Check: ${metricKey}`,
          kind: "env_metric",
          healthy: true,
          targetId: `evidence-envcheck-${safeSlug(metricKey)}`,
          ariaLabel: `Environment Check evidence for ${metricKey} (local Test/Local validation, not live telemetry).`,
        };
      }
      // Rejected / Not checked / Unknown → weak
      return {
        label: `Env Check (weak): ${metricKey}`,
        kind: "env_metric_weak",
        healthy: false,
        targetId: `evidence-envcheck-${safeSlug(metricKey)}`,
        ariaLabel: `Environment Check metric ${metricKey} is ${avail.statusLabel.toLowerCase()} — not healthy evidence.`,
      };
    }
    // Mentioned but neither available nor on the missing checklist.
    return {
      label: `Missing: ${metricKey}`,
      kind: "missing_metric",
      healthy: false,
      targetId: `evidence-missing-${safeSlug(metricKey)}`,
      ariaLabel: `Missing Environment Check metric ${metricKey}. Needs more data.`,
    };
  }

  if (DIARY_PHOTO_RE.test(text)) {
    if (!ctx.hasRecentDiary && !ctx.hasRecentPhotos) {
      return {
        label: "Diary/Photos missing",
        kind: "diary_photo_missing",
        healthy: false,
        targetId: "evidence-missing-diary-photos",
        ariaLabel:
          "No recent diary or photo evidence is available. Needs more data.",
      };
    }
  }

  return {
    label: NO_EVIDENCE_LABEL,
    kind: "none",
    healthy: false,
    targetId: "evidence-missing-general",
    ariaLabel: "No direct evidence supports this recommendation yet.",
  };
}

export interface CitedRecommendation {
  text: string;
  citation: EvidenceCitation;
}

export function citeRecommendations(
  recs: readonly string[],
  ctx: CitationContext,
): CitedRecommendation[] {
  if (!Array.isArray(recs)) return [];
  return recs.map((r) => ({
    text: typeof r === "string" ? r : "",
    citation: resolveEvidenceCitation(typeof r === "string" ? r : "", ctx),
  }));
}

export const NO_EVIDENCE_CITATION_LABEL = NO_EVIDENCE_LABEL;

// ---------------------------------------------------------------------------
// Citation detail (used by the inline-citation modal)
// ---------------------------------------------------------------------------

export interface CitationDetail {
  citation: EvidenceCitation;
  /** Human-readable label for the citation kind. */
  kindLabel: string;
  /** Source label — never "Live" for local Environment Check evidence. */
  sourceLabel: string;
  metricKey: string | null;
  value: string | null;
  statusLabel: string | null;
  reason: string | null;
  capturedAt: string | null;
  sourceHonestyNote: string;
}

const KIND_LABELS: Record<CitationKind, string> = {
  env_metric: "Accepted Environment Check metric",
  env_metric_derived: "Derived VPD context",
  env_metric_weak: "Weak Environment Check metric",
  missing_metric: "Missing Environment Check metric",
  diary_photo_missing: "Diary / photo evidence missing",
  none: "Needs more evidence",
};

const SOURCE_HONESTY_BY_KIND: Record<CitationKind, string> = {
  env_metric:
    "Local Test/Local validation evidence — not live telemetry.",
  env_metric_derived:
    "Derived VPD context only — not a raw sensor reading.",
  env_metric_weak:
    "Local Test/Local validation evidence — not healthy and not live.",
  missing_metric:
    "Metric is not present in the latest Environment Check.",
  diary_photo_missing:
    "No recent diary or photo evidence is available.",
  none:
    "No direct evidence supports this recommendation yet.",
};

function findMetricKeyFromCitation(c: EvidenceCitation): string | null {
  // targetId shape: evidence-envcheck-<slug> or evidence-missing-<slug>
  const m = /^evidence-(?:envcheck|missing)-(.+)$/.exec(c.targetId);
  if (!m) return null;
  return m[1].replace(/-/g, "_");
}

export function buildCitationDetail(
  citation: EvidenceCitation,
  ctx: CitationContext,
): CitationDetail {
  const metricKey = findMetricKeyFromCitation(citation);
  let value: string | null = null;
  let statusLabel: string | null = null;
  let reason: string | null = null;
  let sourceLabel = "—";

  if (metricKey) {
    const avail = ctx.availableMetrics.find((m) => m.key === metricKey);
    if (avail) {
      statusLabel = avail.statusLabel;
      if (avail.value != null && avail.value !== "") value = String(avail.value);
      if (avail.reason) reason = avail.reason;
    } else if (ctx.missingMetrics.includes(metricKey)) {
      statusLabel = "Missing";
    }
  }

  if (
    citation.kind === "env_metric" ||
    citation.kind === "env_metric_derived" ||
    citation.kind === "env_metric_weak"
  ) {
    sourceLabel = "Test/Local validation";
  } else if (citation.kind === "missing_metric") {
    sourceLabel = "Not captured";
  } else if (citation.kind === "diary_photo_missing") {
    sourceLabel = "Not captured";
  }

  return {
    citation,
    kindLabel: KIND_LABELS[citation.kind],
    sourceLabel,
    metricKey,
    value,
    statusLabel,
    reason,
    capturedAt: ctx.envCheckCapturedAt ?? null,
    sourceHonestyNote: SOURCE_HONESTY_BY_KIND[citation.kind],
  };
}
