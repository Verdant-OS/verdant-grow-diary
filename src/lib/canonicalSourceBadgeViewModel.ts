/**
 * canonicalSourceBadgeViewModel — pure helper that maps a raw source
 * string to a canonical badge view model.
 *
 * Allowed canonical sources: live | manual | csv | demo | stale | invalid.
 * Anything else (including "ecowitt") renders as "Unknown source" with a
 * caution tone — never as healthy/canonical.
 *
 * Pure. No I/O.
 */

export const CANONICAL_BADGE_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;
export type CanonicalBadgeSource = (typeof CANONICAL_BADGE_SOURCES)[number];

export type CanonicalBadgeTone =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "unknown";

export interface CanonicalSourceBadgeViewModel {
  /** Canonical source label, or "Unknown source" when not canonical. */
  label: string;
  /** Tone for styling. "unknown" + degraded states are never healthy. */
  tone: CanonicalBadgeTone;
  /** True when the value isn't one of the allowed canonical sources. */
  isUnknown: boolean;
  /** True when the badge represents a non-healthy state. */
  isDegraded: boolean;
  /** Original normalized (lowercased+trimmed) source for data-* attrs. */
  normalizedSource: string;
  /** Optional provider label (e.g. "EcoWitt"). Capped + sanitized. */
  providerLabel: string | null;
}

const SOURCE_LABEL: Record<CanonicalBadgeSource, string> = {
  live: "Connected source (unverified)",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
};

import { deriveProviderLabel } from "@/constants/sensorProviderLabels";

const UNKNOWN_LABEL = "Unknown source" as const;

function normalizeProvider(p: string | null | undefined): string | null {
  return deriveProviderLabel(p);
}

export interface BuildCanonicalSourceBadgeInput {
  source: string | null | undefined;
  provider?: string | null;
}

export function buildCanonicalSourceBadge(
  input: BuildCanonicalSourceBadgeInput,
): CanonicalSourceBadgeViewModel {
  const normalized = typeof input.source === "string" ? input.source.trim().toLowerCase() : "";
  const isCanonical = (CANONICAL_BADGE_SOURCES as readonly string[]).includes(normalized);
  if (isCanonical) {
    const src = normalized as CanonicalBadgeSource;
    // This generic badge carries provenance only—no quality or freshness.
    // It must not render a green Live claim from source text alone.
    const provenanceOnlyLive = src === "live";
    const degraded = provenanceOnlyLive || src === "demo" || src === "stale" || src === "invalid";
    return {
      label: SOURCE_LABEL[src],
      tone: provenanceOnlyLive ? "unknown" : src,
      isUnknown: false,
      isDegraded: degraded,
      normalizedSource: src,
      providerLabel: normalizeProvider(input.provider),
    };
  }
  return {
    label: UNKNOWN_LABEL,
    tone: "unknown",
    isUnknown: true,
    isDegraded: true,
    normalizedSource: normalized || "unknown",
    providerLabel: normalizeProvider(input.provider),
  };
}

export function canonicalBadgeToneClass(tone: CanonicalBadgeTone): string {
  switch (tone) {
    case "live":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "manual":
      return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "csv":
      return "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300";
    case "demo":
      return "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    case "stale":
      return "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    case "invalid":
      return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
    case "unknown":
    default:
      return "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
}
