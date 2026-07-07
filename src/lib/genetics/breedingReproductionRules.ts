/**
 * Part B (B0) — breeding reproduction rules: reversal, selfing (S1), and
 * feminized crosses.
 *
 * PURE domain logic (no React, no Supabase, no I/O). This is the single place
 * that decides, from the parents of a proposed cross and their reversal state:
 *   - which CrossType it is (standard F1 / feminized cross / selfing S1),
 *   - whether the offspring are feminized,
 *   - the short lineage label the UI shows,
 * and validates the combination so downstream services/UI cannot record a
 * logically impossible cross.
 *
 * DOMAIN, in one paragraph: chemically reversing a FEMALE keeper (STS /
 * colloidal silver) makes it shed pollen. That pollen carries only female
 * genetics, so any seeds it makes are FEMINIZED (≈all female). Applying a
 * reversed keeper's pollen back onto ITSELF is SELFING → S1 feminized seeds
 * that preserve that keeper's phenotype. Applying it onto a DIFFERENT female is
 * a FEMINIZED CROSS → feminized F1. A normal cross uses a real male's pollen →
 * a regular (mixed-sex) F1.
 *
 * These rules are deliberately independent of storage: a keeper's "is reversed"
 * state is derived from append-only reversal records (see isKeeperReversed),
 * mirroring how herm state is derived from sex observations elsewhere.
 */

/** Canonical cross classifications, stored on pheno_crosses.cross_type (B2). */
export type CrossType = "standard_f1" | "feminized_cross" | "selfing_s1";

/** Reversal treatment methods a grower can record. */
export type ReversalMethod = "sts" | "colloidal_silver" | "ga3" | "other";

/** Whether the seeds from a cross are feminized or a regular mixed-sex batch. */
export type OffspringFeminization = "feminized" | "regular";

export const CROSS_TYPES: readonly CrossType[] = [
  "standard_f1",
  "feminized_cross",
  "selfing_s1",
] as const;

export const REVERSAL_METHODS: readonly ReversalMethod[] = [
  "sts",
  "colloidal_silver",
  "ga3",
  "other",
] as const;

/** Human labels for the cross types (UI badges / summaries). */
const CROSS_TYPE_LABELS: Record<CrossType, string> = {
  standard_f1: "F1",
  feminized_cross: "Fem F1",
  selfing_s1: "S1",
};

/** Human labels for reversal methods. */
const REVERSAL_METHOD_LABELS: Record<ReversalMethod, string> = {
  sts: "STS (silver thiosulfate)",
  colloidal_silver: "Colloidal silver",
  ga3: "Gibberellic acid (GA3)",
  other: "Other",
};

export function isCrossType(v: unknown): v is CrossType {
  return typeof v === "string" && (CROSS_TYPES as readonly string[]).includes(v);
}

export function isReversalMethod(v: unknown): v is ReversalMethod {
  return typeof v === "string" && (REVERSAL_METHODS as readonly string[]).includes(v);
}

/** Short lineage label for a cross type — "F1", "Fem F1", or "S1". */
export function lineageLabel(crossType: CrossType): string {
  return CROSS_TYPE_LABELS[crossType];
}

/** Human label for a reversal method, safe for unknown/legacy values. */
export function reversalMethodLabel(method: unknown): string {
  return isReversalMethod(method) ? REVERSAL_METHOD_LABELS[method] : "Reversal";
}

/**
 * Offspring feminization is DERIVED from the cross type, never stored
 * separately (so the two can never disagree). Feminized-pollen crosses —
 * selfing and feminized crosses — yield feminized seeds; a standard cross does
 * not.
 */
export function deriveOffspringFeminization(crossType: CrossType): OffspringFeminization {
  return crossType === "standard_f1" ? "regular" : "feminized";
}

/** Minimal shape of an append-only reversal record for state derivation. */
export interface ReversalRecordLike {
  readonly keeperId: string;
}

/**
 * A keeper is "reversed" iff at least one reversal record exists for it.
 * Mirrors the herm/sex derivation pattern (state from append-only log), so a
 * keeper row never has to carry a mutable boolean.
 */
export function isKeeperReversed(
  records: ReadonlyArray<ReversalRecordLike>,
  keeperId: string,
): boolean {
  if (!keeperId) return false;
  return records.some((r) => r.keeperId === keeperId);
}

/** Inputs describing a proposed cross and the reversal state of its parents. */
export interface CrossParticipants {
  /** The seed-bearing (mother) keeper. Required. */
  readonly femaleKeeperId: string;
  /**
   * The pollen-donor keeper. `null` (or equal to femaleKeeperId) means the
   * grower is selfing — the reversed mother pollinates itself.
   */
  readonly pollenKeeperId: string | null;
  /** Whether the mother keeper has been reversed. */
  readonly femaleReversed: boolean;
  /** Whether the (distinct) pollen-donor keeper has been reversed. */
  readonly pollenReversed: boolean;
}

/**
 * Result of classifying a proposed cross.
 *
 * NARROWING NOTE: this project compiles with `strict: false` /
 * `strictNullChecks: false`, under which TypeScript does NOT narrow a
 * boolean-discriminated union on `!result.ok` (the same is true of the
 * codebase's `SaveResult`). Consumers must narrow with the explicit
 * comparison or the positive branch:
 *   if (result.ok === false) { …use result.reason… return; }
 *   // result is now the success branch → result.crossType, result.offspring…
 * Writing `if (!result.ok)` will leave `result` as the full union.
 */
export type CrossClassification =
  | {
      ok: true;
      crossType: CrossType;
      offspring: OffspringFeminization;
      label: string;
      /** True when the pollen donor is the mother keeper itself (selfing). */
      isSelf: boolean;
    }
  | { ok: false; reason: string };

/**
 * Classify and validate a proposed cross.
 *
 * Decision table:
 *  - pollen donor is the mother (null or same id):
 *      → SELFING. Requires the mother to be reversed (you cannot self a plant
 *        that has not been reversed to make pollen). Offspring feminized.
 *  - pollen donor is a different keeper that IS reversed:
 *      → FEMINIZED CROSS (reversed-female pollen onto another female).
 *        Offspring feminized.
 *  - pollen donor is a different keeper that is NOT reversed:
 *      → STANDARD F1 (a real male's pollen). Offspring regular.
 */
export function classifyCross(p: CrossParticipants): CrossClassification {
  const female = (p.femaleKeeperId ?? "").trim();
  if (!female) return { ok: false, reason: "Choose the seed (mother) keeper." };

  const pollen = (p.pollenKeeperId ?? "").trim();
  const selfing = pollen === "" || pollen === female;

  if (selfing) {
    if (!p.femaleReversed) {
      return {
        ok: false,
        reason: "Reverse this keeper first — a keeper must be reversed before it can self (S1).",
      };
    }
    return {
      ok: true,
      crossType: "selfing_s1",
      offspring: deriveOffspringFeminization("selfing_s1"),
      label: lineageLabel("selfing_s1"),
      isSelf: true,
    };
  }

  const crossType: CrossType = p.pollenReversed ? "feminized_cross" : "standard_f1";
  return {
    ok: true,
    crossType,
    offspring: deriveOffspringFeminization(crossType),
    label: lineageLabel(crossType),
    isSelf: false,
  };
}
