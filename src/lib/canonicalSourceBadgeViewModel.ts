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
export type CanonicalBadgeSource = typeof CANONICAL_BADGE_SOURCES[number];

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
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
};

import { deriveProviderLabel } from "@/constants/sensorProviderLabels";


const UNKNOWN_LABEL = "Unknown source" as const;
const PROVIDER_MAX = 32;

function normalizeProvider(p: string | null | undefined): string | null {
  if (typeof p !== "string") return null;
  const t = p.trim();
  if (!t) return null;
  const key = t.toLowerCase().replace(/-/g, "_");
  if (PROVIDER_LABEL[key]) return PROVIDER_LABEL[key];
  const safe = key.replace(/[^a-z0-9_ ]+/g, "").replace(/_/g, " ").trim();
  if (!safe) return null;
  const titled = safe
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return titled.length > PROVIDER_MAX ? `${titled.slice(0, PROVIDER_MAX - 1)}…` : titled;
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
    const degraded = src === "demo" || src === "stale" || src === "invalid";
    return {
      label: SOURCE_LABEL[src],
      tone: src,
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
