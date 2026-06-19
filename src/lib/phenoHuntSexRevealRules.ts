/**
 * Pheno Hunt — sex-reveal safety rules.
 *
 * Pure, deterministic classifier for cannabis sex-reveal photo checks.
 * Never calls AI/model APIs. Never writes alerts, action queue rows, or
 * triggers automation/device control. Never recommends destroying or
 * culling a plant from one weak photo.
 *
 * Verdant's core rule: do not confirm plant sex from a single weak photo
 * unless the image shows unmistakable, multi-node features.
 *
 * Consumers (UI / AI Doctor prompt assembly) feed structured observation
 * signals in — they do NOT pass raw image bytes here. Image-to-signal
 * extraction is a separate, future slice.
 */

export type SexRevealAssessment =
  | "confirmed_male"
  | "confirmed_female"
  | "possible_herm"
  | "likely_male"
  | "likely_female"
  | "unclear";

export type SexRevealConfidence = "low" | "medium" | "high";

export type SexRevealImageQuality = "sharp" | "blurry" | "low_detail";

/**
 * Structured observation signals derived from one or more sex-reveal
 * photos. All fields are caller-supplied and treated as untrusted.
 *
 * Signal definitions:
 *   - pistilNodeCount: number of distinct nodes with clearly visible
 *     pistils / white hairs.
 *   - pollenSacNodeCount: number of distinct nodes with clustered
 *     ball-like pollen sacs (not pistils).
 *   - bananaStructures: true when nanner-shaped structures are visible
 *     among bud sites (herm trait).
 *   - earlyRoundedNodeOnly: true when the only visible feature is a
 *     rounded preflower, with no pistils confirmed.
 *   - imageQuality: caller's honest read of photo clarity.
 *   - nodesVisible: total number of upper nodes clearly visible.
 *   - reproductiveStructureVisible: true when any preflower /
 *     reproductive structure can be identified at all.
 */
export interface SexRevealSignals {
  pistilNodeCount: number;
  pollenSacNodeCount: number;
  bananaStructures: boolean;
  earlyRoundedNodeOnly: boolean;
  imageQuality: SexRevealImageQuality;
  nodesVisible: number;
  reproductiveStructureVisible: boolean;
}

export interface SexRevealResult {
  assessment: SexRevealAssessment;
  confidence: SexRevealConfidence;
  evidence: string[];
  missing_information: string[];
  immediate_action: string;
  what_not_to_do: string[];
  follow_up: string;
  review_recommended: boolean;
}

// ---------------------------------------------------------------------------
// Reusable copy constants. UI / prompt assembly imports these instead of
// inlining strings.
// ---------------------------------------------------------------------------

export const SEX_REVEAL_COPY = {
  likely_male:
    "Likely male preflower — monitor or isolate if pollen risk matters, " +
    "and recheck multiple nodes in 24–48 hours.",
  unclear:
    "Sex unclear from this photo. Capture sharper close-ups of at least " +
    "2–3 upper nodes and recheck in 24–48 hours.",
  possible_herm:
    "Possible hermaphrodite traits detected. Confirm with multiple " +
    "node/bud-site photos before taking irreversible action.",
  confirmed_male:
    "Confirmed male. Isolate from any flowering females if pollen risk " +
    "matters. Grower decides next steps.",
  confirmed_female:
    "Confirmed female. Continue normal care and keep observing for any " +
    "later herm traits.",
  likely_female:
    "Likely female preflower — recheck multiple upper nodes in 24–48 " +
    "hours to confirm.",
} as const;

export const DO_NOT_CULL_FROM_ONE_PHOTO =
  "Do not cull or destroy this plant based on one unclear photo.";

export const NEVER_IRREVERSIBLE_FROM_WEAK_EVIDENCE =
  "Do not take irreversible action (culling, destroying, chopping) from " +
  "weak or single-node evidence.";

const SHARED_WHAT_NOT_TO_DO_UNCERTAIN: readonly string[] = [
  DO_NOT_CULL_FROM_ONE_PHOTO,
  NEVER_IRREVERSIBLE_FROM_WEAK_EVIDENCE,
  "Do not pollinate other plants by moving suspected-male material around.",
];

// ---------------------------------------------------------------------------
// Reusable instruction block. This is exported so AI Doctor prompt
// assembly (a later slice) can attach it verbatim — without scattering
// the same copy across UI files. NOT wired to any model call here.
// ---------------------------------------------------------------------------

export const SEX_REVEAL_PROMPT_INSTRUCTION = `
You are evaluating a cannabis sex-reveal photo for the Pheno Hunt
workflow. Follow these rules strictly:

- Never confirm plant sex from a single weak, early, or blurry photo.
- Never label "confirmed_male" unless multiple visible pollen sacs or
  clustered ball-like sacs appear at multiple nodes AND no pistils are
  visible.
- Never label "confirmed_female" unless clear pistils / white hairs are
  visible at multiple nodes.
- If pistils AND pollen sacs (or banana-shaped structures) are both
  visible, classify as "possible_herm" and ask for confirmation photos.
- If the only feature is a rounded preflower with no pistils, classify
  as "likely_male" — not confirmed_male.
- If pistils are visible at only one node with no other evidence,
  classify as "likely_female" — not confirmed_female.
- Early, blurry, single-node, low-detail, or feature-absent photos
  must return "unclear".
- Never recommend culling, destroying, or chopping a plant from one
  unclear photo or from weak evidence.
- Always include what is missing and a follow-up step.
`.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampNonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function normalize(sig: SexRevealSignals): SexRevealSignals {
  return {
    pistilNodeCount: clampNonNeg(sig.pistilNodeCount),
    pollenSacNodeCount: clampNonNeg(sig.pollenSacNodeCount),
    bananaStructures: Boolean(sig.bananaStructures),
    earlyRoundedNodeOnly: Boolean(sig.earlyRoundedNodeOnly),
    imageQuality: sig.imageQuality ?? "low_detail",
    nodesVisible: clampNonNeg(sig.nodesVisible),
    reproductiveStructureVisible: Boolean(sig.reproductiveStructureVisible),
  };
}

function isPoorImage(sig: SexRevealSignals): boolean {
  return (
    sig.imageQuality === "blurry" ||
    sig.imageQuality === "low_detail" ||
    sig.nodesVisible < 2 ||
    !sig.reproductiveStructureVisible
  );
}

// ---------------------------------------------------------------------------
// Public classifier
// ---------------------------------------------------------------------------

export function classifySexReveal(
  rawSignals: SexRevealSignals,
): SexRevealResult {
  const sig = normalize(rawSignals);
  const evidence: string[] = [];
  const missing: string[] = [];

  if (sig.pistilNodeCount > 0) {
    evidence.push(
      `Pistils visible at ${sig.pistilNodeCount} node(s).`,
    );
  }
  if (sig.pollenSacNodeCount > 0) {
    evidence.push(
      `Pollen sacs / rounded clusters visible at ${sig.pollenSacNodeCount} node(s).`,
    );
  }
  if (sig.bananaStructures) {
    evidence.push("Banana-shaped (nanner) structures visible.");
  }
  if (sig.earlyRoundedNodeOnly) {
    evidence.push("Only a rounded early preflower visible — no pistils.");
  }
  evidence.push(`Image quality: ${sig.imageQuality}.`);
  evidence.push(`Nodes clearly visible: ${sig.nodesVisible}.`);

  if (sig.nodesVisible < 2) {
    missing.push("Sharper close-ups of at least 2–3 upper nodes.");
  }
  if (sig.imageQuality !== "sharp") {
    missing.push("A sharper, well-lit close-up.");
  }
  if (!sig.reproductiveStructureVisible) {
    missing.push("Any visible preflower / reproductive structure.");
  }

  // ----- Herm trait wins over single-sex confirmation -------------------
  const hasHermSignal =
    sig.pistilNodeCount > 0 &&
    (sig.pollenSacNodeCount > 0 || sig.bananaStructures);

  if (hasHermSignal) {
    return {
      assessment: "possible_herm",
      confidence: isPoorImage(sig) ? "low" : "medium",
      evidence,
      missing_information: [
        ...missing,
        "Confirmation photos of multiple nodes and bud sites.",
      ],
      immediate_action: SEX_REVEAL_COPY.possible_herm,
      what_not_to_do: [
        ...SHARED_WHAT_NOT_TO_DO_UNCERTAIN,
        "Do not chop or destroy the plant from this single observation.",
      ],
      follow_up:
        "Recheck multiple nodes and bud sites within 24–48 hours; " +
        "document with sharper photos before any irreversible action.",
      review_recommended: true,
    };
  }

  // ----- Confirmed male: multi-node pollen sacs, no pistils -------------
  if (
    sig.pollenSacNodeCount >= 2 &&
    sig.pistilNodeCount === 0 &&
    !isPoorImage(sig)
  ) {
    return {
      assessment: "confirmed_male",
      confidence: "high",
      evidence,
      missing_information: missing,
      immediate_action: SEX_REVEAL_COPY.confirmed_male,
      what_not_to_do: [
        "Do not place near flowering females unless pollination is the goal.",
        "Do not assume herm status without banana structures or pistils.",
      ],
      follow_up:
        "Keep isolated or remove from the flowering tent per grower decision.",
      review_recommended: false,
    };
  }

  // ----- Confirmed female: multi-node pistils, no sacs ------------------
  if (
    sig.pistilNodeCount >= 2 &&
    sig.pollenSacNodeCount === 0 &&
    !sig.bananaStructures &&
    !isPoorImage(sig)
  ) {
    return {
      assessment: "confirmed_female",
      confidence: "high",
      evidence,
      missing_information: missing,
      immediate_action: SEX_REVEAL_COPY.confirmed_female,
      what_not_to_do: [
        "Do not assume herm status without banana structures or sacs.",
      ],
      follow_up:
        "Continue normal care; keep observing upper nodes and bud sites " +
        "for any later herm traits.",
      review_recommended: false,
    };
  }

  // ----- Poor image → unclear (before any "likely" classification) ------
  if (isPoorImage(sig)) {
    return {
      assessment: "unclear",
      confidence: "low",
      evidence,
      missing_information: missing.length
        ? missing
        : ["Sharper photos of multiple upper nodes."],
      immediate_action: SEX_REVEAL_COPY.unclear,
      what_not_to_do: [...SHARED_WHAT_NOT_TO_DO_UNCERTAIN],
      follow_up:
        "Capture sharper close-ups of 2–3 upper nodes and recheck in " +
        "24–48 hours.",
      review_recommended: true,
    };
  }

  // ----- Likely male: rounded preflower, no pistils ---------------------
  if (
    sig.earlyRoundedNodeOnly &&
    sig.pistilNodeCount === 0 &&
    sig.pollenSacNodeCount < 2
  ) {
    return {
      assessment: "likely_male",
      confidence: sig.pollenSacNodeCount === 1 ? "medium" : "low",
      evidence,
      missing_information: [
        ...missing,
        "Confirmation of pollen sacs across multiple nodes.",
      ],
      immediate_action: SEX_REVEAL_COPY.likely_male,
      what_not_to_do: [...SHARED_WHAT_NOT_TO_DO_UNCERTAIN],
      follow_up:
        "Recheck 2–3 upper nodes within 24–48 hours; isolate only if " +
        "pollen risk matters.",
      review_recommended: true,
    };
  }

  // ----- Likely female: pistils at one node, no sacs --------------------
  if (
    sig.pistilNodeCount === 1 &&
    sig.pollenSacNodeCount === 0 &&
    !sig.bananaStructures
  ) {
    return {
      assessment: "likely_female",
      confidence: "low",
      evidence,
      missing_information: [
        ...missing,
        "Pistils confirmed at additional upper nodes.",
      ],
      immediate_action: SEX_REVEAL_COPY.likely_female,
      what_not_to_do: [...SHARED_WHAT_NOT_TO_DO_UNCERTAIN],
      follow_up:
        "Recheck 2–3 upper nodes within 24–48 hours to confirm female.",
      review_recommended: true,
    };
  }

  // ----- Default: unclear -----------------------------------------------
  return {
    assessment: "unclear",
    confidence: "low",
    evidence,
    missing_information: missing.length
      ? missing
      : ["Sharper photos of multiple upper nodes."],
    immediate_action: SEX_REVEAL_COPY.unclear,
    what_not_to_do: [...SHARED_WHAT_NOT_TO_DO_UNCERTAIN],
    follow_up:
      "Capture sharper close-ups of 2–3 upper nodes and recheck in " +
      "24–48 hours.",
    review_recommended: true,
  };
}
