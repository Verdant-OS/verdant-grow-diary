import { isUuid } from "@/lib/isUuid";

/** Untrusted tent-shaped input from an already owner-scoped read. */
export interface OperatorWateringTentCandidate {
  id?: unknown;
  name?: unknown;
  growId?: unknown;
}

export interface OperatorWateringTentScopeInput {
  activeGrowId?: unknown;
  tents?: readonly (OperatorWateringTentCandidate | null | undefined)[] | null;
  requestedTentId?: unknown;
}

export interface OperatorWateringTentOption {
  id: string;
  name: string;
}

export type OperatorWateringTentScopeStatus = "no_tents" | "selection_required" | "ready";

export interface OperatorWateringTentScopeResult {
  status: OperatorWateringTentScopeStatus;
  options: readonly OperatorWateringTentOption[];
  selectedTent: OperatorWateringTentOption | null;
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isUuid(normalized) ? normalized : null;
}

function normalizeTentName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const withoutControls = Array.from(value.normalize("NFKC"), (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? " " : character;
  }).join("");
  const normalized = withoutControls.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareTentOptions(
  left: OperatorWateringTentOption,
  right: OperatorWateringTentOption,
): number {
  const foldedNameOrder = compareText(left.name.toLowerCase(), right.name.toLowerCase());
  if (foldedNameOrder !== 0) return foldedNameOrder;

  const exactNameOrder = compareText(left.name, right.name);
  if (exactNameOrder !== 0) return exactNameOrder;

  return compareText(left.id, right.id);
}

/**
 * Resolve one explicit watering tent scope without React, I/O, or persistence.
 *
 * A sole valid tent is safe to select automatically. Multiple tents require a
 * requested UUID that exactly matches an admitted option. Candidate grow ids
 * may be absent on an already scoped projection, but an explicit malformed or
 * cross-grow link is rejected.
 */
export function buildOperatorWateringTentScope(
  input: OperatorWateringTentScopeInput | null | undefined,
): OperatorWateringTentScopeResult {
  const activeGrowId = normalizeUuid(input?.activeGrowId);
  if (!activeGrowId) {
    return { status: "no_tents", options: [], selectedTent: null };
  }

  const tents = Array.isArray(input?.tents) ? input.tents : [];
  const normalizedCandidates: OperatorWateringTentOption[] = [];
  for (const candidate of tents) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;

    const id = normalizeUuid(candidate.id);
    const name = normalizeTentName(candidate.name);
    if (!id || !name) continue;

    if (candidate.growId !== null && candidate.growId !== undefined) {
      const candidateGrowId = normalizeUuid(candidate.growId);
      if (!candidateGrowId || candidateGrowId !== activeGrowId) continue;
    }

    normalizedCandidates.push({ id, name });
  }

  normalizedCandidates.sort(compareTentOptions);

  const options: OperatorWateringTentOption[] = [];
  const seenIds = new Set<string>();
  for (const candidate of normalizedCandidates) {
    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    options.push(candidate);
  }

  if (options.length === 0) {
    return { status: "no_tents", options, selectedTent: null };
  }

  if (options.length === 1) {
    return { status: "ready", options, selectedTent: options[0] };
  }

  const requestedTentId = normalizeUuid(input?.requestedTentId);
  const selectedTent = requestedTentId
    ? (options.find((option) => option.id === requestedTentId) ?? null)
    : null;

  return selectedTent
    ? { status: "ready", options, selectedTent }
    : { status: "selection_required", options, selectedTent: null };
}
