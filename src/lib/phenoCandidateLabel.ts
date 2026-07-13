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
