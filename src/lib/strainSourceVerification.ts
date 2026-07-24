/**
 * Automated Source Verification V0 — pure structural layer.
 *
 * Verifies that every source in the Strain Reference Library constants is
 * well-formed and that every claim / tendency evidence key resolves.
 *
 * Safety:
 * - Never mutates confidence, verificationStatus, or claim values.
 * - Never performs network I/O (network checks live in the CLI script).
 * - Never auto-elevates a source or cultivar to "verified".
 * - Report is evidence for human reviewers and pre-release metrics only.
 */

import type {
  CultivarSource,
  VerdantCultivarProfile,
} from "@/constants/strainReferenceLibrary";

export type SourceUrlClass =
  | "pubmed"
  | "scholarly"
  | "breeder"
  | "community_profile"
  | "generic_https"
  | "invalid";

export type SourceIssueSeverity = "error" | "warning";

export interface StructuralSourceIssue {
  sourceKey: string | null;
  code: string;
  message: string;
  severity: SourceIssueSeverity;
}

export interface StructuralVerificationResult {
  ok: boolean;
  checkedAt: string;
  sourceCount: number;
  uniqueSourceKeys: number;
  claimLinkCount: number;
  unresolvedSourceKeys: string[];
  issues: StructuralSourceIssue[];
  byClassification: Record<SourceUrlClass, number>;
}

const ALLOWED_SOURCE_TYPES = new Set([
  "breeder",
  "laboratory",
  "horticultural_reference",
  "grower_report",
  "community",
  "verdant_editorial",
] as const);

function hostnameMatches(hostname: string, trustedDomain: string): boolean {
  const normalizedHost = hostname.toLowerCase().replace(/\.$/, "");
  const normalizedDomain = trustedDomain.toLowerCase().replace(/\.$/, "");
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

export function classifySourceUrl(url: string): SourceUrlClass {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return "invalid";
    const host = parsed.hostname.toLowerCase();

    if (hostnameMatches(host, "pubmed.ncbi.nlm.nih.gov")) return "pubmed";

    if (
      hostnameMatches(host, "nature.com") ||
      hostnameMatches(host, "academic.oup.com") ||
      hostnameMatches(host, "doi.org") ||
      hostnameMatches(host, "genomebiology.biomedcentral.com") ||
      hostnameMatches(host, "oup.com")
    ) {
      return "scholarly";
    }

    if (hostnameMatches(host, "mephistogenetics.com")) return "breeder";
    if (hostnameMatches(host, "leafly.com")) return "community_profile";
    return "generic_https";
  } catch {
    return "invalid";
  }
}

function isValidIsoDate(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

/**
 * Offline structural validation of sources + claim linkages.
 * Safe to run in every CI job; produces a deterministic result apart from the
 * explicit checkedAt evidence timestamp.
 */
export function validateCultivarSourcesStructural(
  sources: readonly CultivarSource[],
  cultivars: readonly VerdantCultivarProfile[],
): StructuralVerificationResult {
  const issues: StructuralSourceIssue[] = [];
  const keySet = new Set<string>();
  const byClassification: Record<SourceUrlClass, number> = {
    pubmed: 0,
    scholarly: 0,
    breeder: 0,
    community_profile: 0,
    generic_https: 0,
    invalid: 0,
  };

  for (const source of sources) {
    if (!source.key || source.key.trim().length === 0) {
      issues.push({
        sourceKey: source.key ?? null,
        code: "missing_key",
        message: "Source is missing a non-empty key",
        severity: "error",
      });
      continue;
    }

    if (keySet.has(source.key)) {
      issues.push({
        sourceKey: source.key,
        code: "duplicate_key",
        message: `Duplicate source key: ${source.key}`,
        severity: "error",
      });
    }
    keySet.add(source.key);

    if (!source.title?.trim()) {
      issues.push({
        sourceKey: source.key,
        code: "missing_title",
        message: "title is required",
        severity: "error",
      });
    }
    if (!source.publisher?.trim()) {
      issues.push({
        sourceKey: source.key,
        code: "missing_publisher",
        message: "publisher is required",
        severity: "error",
      });
    }
    if (!source.url?.trim()) {
      issues.push({
        sourceKey: source.key,
        code: "missing_url",
        message: "url is required",
        severity: "error",
      });
    } else if (!source.url.startsWith("https://")) {
      issues.push({
        sourceKey: source.key,
        code: "url_not_https",
        message: `url must start with https:// (got ${source.url.slice(0, 32)}…)`,
        severity: "error",
      });
    }

    const classification = classifySourceUrl(source.url || "");
    byClassification[classification] += 1;
    if (classification === "invalid") {
      issues.push({
        sourceKey: source.key,
        code: "url_invalid",
        message: `URL could not be classified as a valid https source: ${source.url}`,
        severity: "error",
      });
    }

    if (!ALLOWED_SOURCE_TYPES.has(source.sourceType as never)) {
      issues.push({
        sourceKey: source.key,
        code: "invalid_source_type",
        message: `sourceType "${source.sourceType}" is not in the allowed set`,
        severity: "error",
      });
    }

    if (!source.licenseNotes?.trim()) {
      issues.push({
        sourceKey: source.key,
        code: "missing_license_notes",
        message: "licenseNotes is required (citation / usage boundary)",
        severity: "error",
      });
    }

    if (!isValidIsoDate(source.retrievedAt)) {
      issues.push({
        sourceKey: source.key,
        code: "invalid_retrieved_at",
        message: `retrievedAt must be a valid ISO timestamp (got "${source.retrievedAt}")`,
        severity: "error",
      });
    }
  }

  // Claim / profile linkage. Guide tendency evidence keys intentionally refer
  // to claim/evidence identifiers and are not assumed to be source keys.
  const unresolved = new Set<string>();
  let claimLinkCount = 0;

  for (const cultivar of cultivars) {
    for (const key of cultivar.sourceKeys) {
      claimLinkCount += 1;
      if (!keySet.has(key)) unresolved.add(key);
    }
    for (const claim of cultivar.terpeneClaims) {
      claimLinkCount += 1;
      if (!keySet.has(claim.sourceKey)) unresolved.add(claim.sourceKey);
    }
    for (const claim of cultivar.cannabinoidClaims) {
      claimLinkCount += 1;
      if (!keySet.has(claim.sourceKey)) unresolved.add(claim.sourceKey);
    }
  }

  for (const key of unresolved) {
    issues.push({
      sourceKey: key,
      code: "unresolved_source_key",
      message: `sourceKey "${key}" is referenced by a profile or claim but is not present in CULTIVAR_SOURCES`,
      severity: "error",
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;

  return {
    ok: errorCount === 0,
    checkedAt: new Date().toISOString(),
    sourceCount: sources.length,
    uniqueSourceKeys: keySet.size,
    claimLinkCount,
    unresolvedSourceKeys: [...unresolved].sort(),
    issues,
    byClassification,
  };
}
