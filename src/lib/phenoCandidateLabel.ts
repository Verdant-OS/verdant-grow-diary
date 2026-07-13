/**
 * Pure, deterministic label formatter for Pheno Hunt candidates.
 *
 * Isolated helper — no Supabase imports, no generated types, no React, no I/O,
 * no time, no randomness, no reference to any database column. Safe to import
 * anywhere. Does not mutate its input.
 */

export type PhenoCandidateLabelInput = {
  candidateNumber: number | null | undefined;
  candidateLabel: string | null;
  plantName: string | null;
  plantId: string;
};

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidCandidateNumber(value: number | null | undefined): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0
  );
}

export function formatPhenoCandidateLabel(input: PhenoCandidateLabelInput): string {
  const label = trimOrNull(input.candidateLabel);
  const name = trimOrNull(input.plantName);
  const id = trimOrNull(input.plantId);

  if (isValidCandidateNumber(input.candidateNumber)) {
    const text = label ?? name;
    return text ? `#${input.candidateNumber} · ${text}` : `#${input.candidateNumber}`;
  }

  if (label) return label;
  if (name) return name;
  if (id) return `#${id.slice(0, 8)}`;
  return "#unknown";
}

function categoryRank(input: PhenoCandidateLabelInput): 0 | 1 | 2 {
  if (isValidCandidateNumber(input.candidateNumber)) return 0;
  if (trimOrNull(input.candidateLabel) || trimOrNull(input.plantName)) return 1;
  return 2;
}

function cmpStr(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function cmpNullableLower(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return cmpStr(a.toLowerCase(), b.toLowerCase());
}

/**
 * Pure, deterministic comparator for Pheno Hunt candidates.
 *
 * Ordering:
 *   1. Valid-numbered candidates first (ascending by number).
 *   2. Then unnumbered candidates that have a label or plant name
 *      (alphabetical, case-insensitive; label text takes precedence over name).
 *   3. Then id-only / #unknown fallbacks (by trimmed plant id).
 *
 * All string comparisons use plain code-point ordering on lowercased/trimmed
 * values — no locale, randomness, time, or environment state. Inputs are
 * never mutated. Returns 0 only when every relevant normalized key is equal.
 */
export function comparePhenoCandidatesByNumberThenLabel(
  a: PhenoCandidateLabelInput,
  b: PhenoCandidateLabelInput,
): number {
  const ra = categoryRank(a);
  const rb = categoryRank(b);
  if (ra !== rb) return ra - rb;

  const aLabel = trimOrNull(a.candidateLabel);
  const bLabel = trimOrNull(b.candidateLabel);
  const aName = trimOrNull(a.plantName);
  const bName = trimOrNull(b.plantName);
  const aId = trimOrNull(a.plantId) ?? "";
  const bId = trimOrNull(b.plantId) ?? "";

  if (ra === 0) {
    const an = a.candidateNumber as number;
    const bn = b.candidateNumber as number;
    if (an !== bn) return an < bn ? -1 : 1;
    const byLabel = cmpNullableLower(aLabel, bLabel);
    if (byLabel !== 0) return byLabel;
    const byName = cmpNullableLower(aName, bName);
    if (byName !== 0) return byName;
    return cmpStr(aId, bId);
  }

  if (ra === 1) {
    const aText = (aLabel ?? aName) as string;
    const bText = (bLabel ?? bName) as string;
    const byText = cmpStr(aText.toLowerCase(), bText.toLowerCase());
    if (byText !== 0) return byText;
    const byLabel = cmpNullableLower(aLabel, bLabel);
    if (byLabel !== 0) return byLabel;
    const byName = cmpNullableLower(aName, bName);
    if (byName !== 0) return byName;
    return cmpStr(aId, bId);
  }

  // ra === 2 — id-only / #unknown fallbacks
  return cmpStr(aId, bId);
}

