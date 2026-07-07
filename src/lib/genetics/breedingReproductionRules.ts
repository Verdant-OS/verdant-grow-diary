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

/**
 * Canonical breeding "ways", stored on pheno_crosses.cross_type.
 *
 * The first three (standard_f1 / feminized_cross / selfing_s1) are the original
 * B2 values and MUST keep their exact spelling — live rows already use them. The
 * rest complete the breeder's taxonomy (reviewed with James Loud Genetics):
 *
 *  filial / hybrid ladder — standard_f1 (F1) · filial (F2, F3… via `generation`)
 *                           · ibl (stabilised inbred line)
 *  selfing               — selfing_s1 (S1) · selfing_sn (S2, S3… via generation)
 *  feminized             — feminized_cross (Fem F1) · feminized_bx (fem backcross)
 *  backcross / stabilise — backcross (BX1, BX2… via generation, to a recurrent parent)
 *  population / line     — sib_cross · outcross · line_cross · open_pollination
 *  diagnostic / production — test_cross · reciprocal_cross · three_way_cross
 *
 * Feminization is NOT baked into the way (except the inherently-feminized ones):
 * an F2 or BX made with reversed-female pollen is feminized too. It is derived
 * from the pollen `Channel` — see feminizationFromChannel.
 */
export type CrossType =
  | "standard_f1"
  | "feminized_cross"
  | "selfing_s1"
  | "filial"
  | "ibl"
  | "selfing_sn"
  | "feminized_bx"
  | "backcross"
  | "sib_cross"
  | "outcross"
  | "line_cross"
  | "open_pollination"
  | "test_cross"
  | "reciprocal_cross"
  | "three_way_cross";

/**
 * Pollen "channel" — HOW the pollen for a cross was produced. The reversal
 * channels (colloidal_silver / sts / ga3 / rodelization) carry only female
 * genetics, so any seed they make is feminized (see feminizationFromChannel).
 * natural_male is a true male donor; open_pollination is uncontrolled population
 * pollen. Stored on pheno_crosses.channel.
 */
export type Channel =
  | "natural_male"
  | "colloidal_silver"
  | "sts"
  | "ga3"
  | "rodelization"
  | "open_pollination";

/** Reversal treatment methods a grower can record. */
export type ReversalMethod = "sts" | "colloidal_silver" | "ga3" | "other";

/** Whether the seeds from a cross are feminized or a regular mixed-sex batch. */
export type OffspringFeminization = "feminized" | "regular";

export const CROSS_TYPES: readonly CrossType[] = [
  "standard_f1",
  "feminized_cross",
  "selfing_s1",
  "filial",
  "ibl",
  "selfing_sn",
  "feminized_bx",
  "backcross",
  "sib_cross",
  "outcross",
  "line_cross",
  "open_pollination",
  "test_cross",
  "reciprocal_cross",
  "three_way_cross",
] as const;

export const CHANNELS: readonly Channel[] = [
  "natural_male",
  "colloidal_silver",
  "sts",
  "ga3",
  "rodelization",
  "open_pollination",
] as const;

/** Reversal (feminized-pollen) channels — a female made to shed pollen. */
const FEMINIZED_CHANNELS: readonly Channel[] = [
  "colloidal_silver",
  "sts",
  "ga3",
  "rodelization",
] as const;

export const REVERSAL_METHODS: readonly ReversalMethod[] = [
  "sts",
  "colloidal_silver",
  "ga3",
  "other",
] as const;

/** Short badge label for each cross type (generation is applied separately). */
const CROSS_TYPE_LABELS: Record<CrossType, string> = {
  standard_f1: "F1",
  feminized_cross: "Fem F1",
  selfing_s1: "S1",
  filial: "F2+",
  ibl: "IBL",
  selfing_sn: "S2+",
  feminized_bx: "Fem BX",
  backcross: "BX",
  sib_cross: "Sib",
  outcross: "Outcross",
  line_cross: "Line cross",
  open_pollination: "OP",
  test_cross: "Test cross",
  reciprocal_cross: "Reciprocal",
  three_way_cross: "3-way",
};

/** Longer, human-readable name for each cross type (menus / summaries). */
const CROSS_TYPE_NAMES: Record<CrossType, string> = {
  standard_f1: "Standard cross (F1)",
  feminized_cross: "Feminized cross",
  selfing_s1: "Selfing (S1)",
  filial: "Filial (F2+)",
  ibl: "Inbred line (IBL)",
  selfing_sn: "Selfing (S2+)",
  feminized_bx: "Feminized backcross",
  backcross: "Backcross (BX)",
  sib_cross: "Sibling cross",
  outcross: "Outcross",
  line_cross: "Line cross",
  open_pollination: "Open pollination",
  test_cross: "Test cross",
  reciprocal_cross: "Reciprocal cross",
  three_way_cross: "Three-way / double cross",
};

/** Cross types that inherently produce feminized seed regardless of channel. */
const INHERENTLY_FEMINIZED: readonly CrossType[] = [
  "selfing_s1",
  "selfing_sn",
  "feminized_cross",
  "feminized_bx",
] as const;

/** Cross types whose display carries a generation number (F#, S#, BX#). */
const GENERATION_PREFIX: Partial<Record<CrossType, string>> = {
  filial: "F",
  selfing_sn: "S",
  backcross: "BX",
  feminized_bx: "BX",
};

/** Cross types that must name a recurrent parent (the line being backcrossed to). */
const REQUIRES_RECURRENT_PARENT: readonly CrossType[] = ["backcross", "feminized_bx"] as const;

/** Human labels for reversal methods. */
const REVERSAL_METHOD_LABELS: Record<ReversalMethod, string> = {
  sts: "STS (silver thiosulfate)",
  colloidal_silver: "Colloidal silver",
  ga3: "Gibberellic acid (GA3)",
  other: "Other",
};

/** Human labels for the pollen channels. */
const CHANNEL_LABELS: Record<Channel, string> = {
  natural_male: "Natural male pollen",
  colloidal_silver: "Colloidal silver (reversal)",
  sts: "STS (reversal)",
  ga3: "Gibberellic acid / GA3 (reversal)",
  rodelization: "Rodelization (stress self)",
  open_pollination: "Open / wind pollination",
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

export function isChannel(v: unknown): v is Channel {
  return typeof v === "string" && (CHANNELS as readonly string[]).includes(v);
}

/** Human label for a pollen channel, safe for unknown/legacy values. */
export function channelLabel(channel: unknown): string {
  return isChannel(channel) ? CHANNEL_LABELS[channel] : "Pollen";
}

/** Longer human name for a cross type, safe for unknown/legacy values. */
export function crossTypeName(crossType: unknown): string {
  return isCrossType(crossType) ? CROSS_TYPE_NAMES[crossType] : "Cross";
}

/** A reversal channel carries only female genetics → feminized seed. */
export function isFeminizedChannel(channel: unknown): boolean {
  return isChannel(channel) && (FEMINIZED_CHANNELS as readonly string[]).includes(channel);
}

/** True when a cross type is always feminized (selfing / feminized crosses). */
export function isFeminizedCrossType(crossType: CrossType): boolean {
  return (INHERENTLY_FEMINIZED as readonly string[]).includes(crossType);
}

/** True when this cross type must name the recurrent parent it backcrosses to. */
export function requiresRecurrentParent(crossType: CrossType): boolean {
  return (REQUIRES_RECURRENT_PARENT as readonly string[]).includes(crossType);
}

/** True when this cross type's display/meaning depends on a generation number. */
export function requiresGeneration(crossType: CrossType): boolean {
  return crossType in GENERATION_PREFIX;
}

/**
 * Offspring feminization is DERIVED, never stored separately. It comes from the
 * pollen channel: a reversal channel (CS/STS/GA3/rodelization) makes feminized
 * seed; a natural male makes regular seed. Inherently-feminized ways (selfing /
 * feminized cross) are feminized even if the caller omits the channel.
 */
export function feminizationFromChannel(
  channel: Channel | null | undefined,
  crossType?: CrossType,
): OffspringFeminization {
  if (crossType && isFeminizedCrossType(crossType)) return "feminized";
  return isFeminizedChannel(channel) ? "feminized" : "regular";
}

/**
 * Display label with generation applied — "F1", "F3", "S2", "BX2", "Fem BX1",
 * or the plain badge for ways that don't carry a generation. A missing/invalid
 * generation falls back to the base badge (e.g. filial → "F2" at minimum).
 */
export function crossTypeDisplay(crossType: CrossType, generation?: number | null): string {
  const prefix = GENERATION_PREFIX[crossType];
  if (!prefix) return CROSS_TYPE_LABELS[crossType];
  const min = crossType === "backcross" || crossType === "feminized_bx" ? 1 : 2;
  const n =
    typeof generation === "number" && Number.isFinite(generation) ? Math.trunc(generation) : min;
  const gen = n >= min ? n : min;
  return crossType === "feminized_bx" ? `Fem ${prefix}${gen}` : `${prefix}${gen}`;
}

/** A fully-specified proposed cross, as chosen by the grower in the UI. */
export interface BreedingCrossInput {
  readonly crossType: CrossType;
  readonly channel: Channel;
  /** Pollen donor is the mother keeper itself (selfing). */
  readonly isSelf: boolean;
  /** Mother keeper has a reversal on record. */
  readonly femaleReversed: boolean;
  /** The distinct pollen-donor keeper has a reversal on record. */
  readonly pollenReversed: boolean;
  /** A recurrent parent has been named (required for backcrosses). */
  readonly hasRecurrentParent: boolean;
  /** F#/S#/BX# generation, when the way carries one. */
  readonly generation: number | null;
}

export type BreedingCrossValidation =
  | { ok: true; offspring: OffspringFeminization; label: string }
  | { ok: false; reason: string };

/**
 * Validate a fully-specified cross (way + channel + parents + generation) and
 * reject genetically impossible combinations. This complements classifyCross:
 * classifyCross AUTO-DETECTS one of the three basic ways from reversal state,
 * while this validates any of the full taxonomy the grower picks explicitly.
 *
 * NARROWING NOTE: strict:false — read the failure branch with `=== false`
 * (see CrossClassification's note); `!v.ok` will not narrow `reason`.
 */
export function validateBreedingCross(input: BreedingCrossInput): BreedingCrossValidation {
  const { crossType, channel } = input;

  const feminizedChannel = isFeminizedChannel(channel);
  const inherentlyFem = isFeminizedCrossType(crossType);

  // Selfing: the mother pollinates itself, so it must have been reversed and use
  // a feminized (reversal / rodelization) channel; a true male makes no sense.
  if (crossType === "selfing_s1" || crossType === "selfing_sn") {
    if (!input.isSelf)
      return { ok: false, reason: "A selfing must use the mother as its own pollen donor." };
    if (!input.femaleReversed)
      return {
        ok: false,
        reason: "Reverse this keeper first — a keeper must be reversed before it can self.",
      };
    if (!feminizedChannel)
      return {
        ok: false,
        reason: "Selfing needs a reversal channel (colloidal silver, STS, GA3, or rodelization).",
      };
    if (
      crossType === "selfing_sn" &&
      !(typeof input.generation === "number" && input.generation >= 2)
    )
      return {
        ok: false,
        reason: "An S2+ selfing needs a generation of 2 or more (use S1 for the first self).",
      };
  }

  // A feminized cross is reversed-female pollen onto a DIFFERENT female.
  if (crossType === "feminized_cross" || crossType === "feminized_bx") {
    if (input.isSelf)
      return {
        ok: false,
        reason: "A feminized cross needs a different female as the mother — use S1 to self.",
      };
    if (!feminizedChannel)
      return {
        ok: false,
        reason:
          "A feminized cross needs a reversal channel (the pollen must come from a reversed female).",
      };
    if (crossType === "feminized_bx" && !input.hasRecurrentParent)
      return {
        ok: false,
        reason: "A backcross needs a recurrent parent (the line you are crossing back to).",
      };
  }

  // Backcrosses (regular) need a recurrent parent + a real BX generation.
  if (crossType === "backcross") {
    if (!input.hasRecurrentParent)
      return {
        ok: false,
        reason: "A backcross needs a recurrent parent (the line you are crossing back to).",
      };
    if (!(typeof input.generation === "number" && input.generation >= 1))
      return { ok: false, reason: "A backcross needs a generation of 1 or more (BX1, BX2, …)." };
  }

  // Filial (F2+) needs a generation of 2 or more (F1 is standard_f1).
  if (crossType === "filial" && !(typeof input.generation === "number" && input.generation >= 2)) {
    return {
      ok: false,
      reason:
        "A filial cross needs a generation of 2 or more (F2, F3, …). Use F1 for the first cross.",
    };
  }

  // Non-feminized ways can't ride a reversal channel: reversed-female pollen
  // would make the seed feminized, contradicting the chosen way.
  if (!inherentlyFem && feminizedChannel && crossType !== "filial" && crossType !== "backcross") {
    return {
      ok: false,
      reason: `A ${crossTypeName(crossType).toLowerCase()} uses a natural male; a reversal channel would make it a feminized cross.`,
    };
  }

  return {
    ok: true,
    offspring: feminizationFromChannel(channel, crossType),
    label: crossTypeDisplay(crossType, input.generation),
  };
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
   * The pollen-donor keeper. `null` (or an id equal to femaleKeeperId) means
   * the grower is selfing — the reversed mother pollinates itself. A blank /
   * whitespace string is treated as "donor not chosen" and rejected, NOT as
   * selfing; pass `null` to self explicitly.
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
 * `strictNullChecks: false`. Under that config, narrowing this union with
 * `if (!result.ok)` is unreliable for reading a BRANCH-EXCLUSIVE field like
 * `reason` (it can leave `result` as the whole union → TS2339). Narrow with
 * the explicit comparison or the positive branch instead:
 *   if (result.ok === false) { …use result.reason… return; }
 *   // result is now the success branch → result.crossType, result.offspring…
 * (Result types that carry the SAME fields on both branches — e.g.
 * `SoilMoistureCalibrationResult` — don't hit this, because no field is
 * branch-exclusive. This union keeps `reason` exclusive to the failure branch,
 * so prefer `=== false`.)
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

  // Selfing is signalled EXPLICITLY: a `null` pollen donor, or a donor id equal
  // to the mother. A blank/whitespace donor STRING is an incomplete form (a
  // dropdown left unset), not an intent to self — reject it so a half-filled
  // cross can never be silently classified as an S1.
  const rawPollen = p.pollenKeeperId;
  if (rawPollen !== null && rawPollen.trim() === "") {
    return { ok: false, reason: "Choose the pollen donor, or record this as a self (S1)." };
  }
  const selfing = rawPollen === null || rawPollen.trim() === female;

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
