/**
 * verdantSkillEvaluationBindings — proves what an evaluation actually judged.
 *
 * Build 7 of Verdant Skill Runtime v1. Pure: no I/O, no clock, no model call,
 * no network — and deliberately NO cryptography. This module owns the types,
 * the canonical envelope, the required-binding policy and the fail-closed
 * verifier. The hash itself is injected.
 *
 * THE GOVERNING RULE. No evaluation status, score, promotion decision, or
 * human-facing report is trustworthy until every required binding verifies.
 *
 * This exists because the failure mode of an evaluation harness is not a
 * wrong number — it is an attractive report that is not about the thing it
 * claims to describe. A green report bound to last week's manifest is worse
 * than no report, because it is believed. Build 6's review found exactly this
 * three times running, in a different coordinate each time: a run not bound to
 * its context version, an applicability verdict not bound to its manifest, a
 * confidence ceiling not bound to the evidence a proposal cited. Each looked
 * obviously related to its neighbour and was never actually checked.
 *
 * So nothing here infers that two objects belong together because their ids or
 * labels match. Identity is asserted by digest over canonical bytes.
 *
 * WHY THE HASH IS INJECTED RATHER THAN IMPORTED.
 * Integrity verification requires a cryptographic digest — SHA-256 at least.
 * A non-cryptographic hash (FNV and friends) is fine for a cache key and
 * unfit for a release gate, so none is accepted here. But `node:crypto` must
 * not reach client-importable code: this module sits under `src/lib`, which
 * the app bundle can pull in. Rather than a conditional runtime import — which
 * hides the hazard instead of removing it — the boundary is explicit. Shared
 * code owns the envelope; the Node-only harness owns the hashing and passes
 * a `DigestFn` in. A caller with no digest function simply cannot produce a
 * binding, which is the correct failure.
 *
 * WHY THE ENVELOPE IS FRAMED.
 * Digests are computed over a typed envelope, never over bare payload bytes
 * and never over concatenated strings. `contract + manifest + corpus` is
 * ambiguous — different splits of the same characters collide, and a manifest
 * digest could stand in for a corpus digest. Framing `artifact_type` INSIDE
 * the hashed bytes makes the same payload under a different type a different
 * digest, so a binding cannot be substituted across domains.
 */

import { serializeSkillContract } from "@/lib/verdantSkillSchemas";

/** Envelope shape version. Bumped when the framed fields change. */
export const BINDING_ENVELOPE_VERSION = 1 as const;

/**
 * Identifies the canonical serializer whose output is framed. A digest is
 * only meaningful relative to the bytes some specific serializer produced.
 */
export const CANONICAL_SERIALIZER_VERSION = "verdant-skill-contract/1" as const;

/** Bumped when the binding record shape changes. */
export const SKILL_EVALUATION_BINDING_VERSION = "1.0.0" as const;

/** Only cryptographic digests are accepted. Unknown labels are rejected. */
export const DIGEST_ALGORITHMS = ["sha256"] as const;
export type DigestAlgorithm = (typeof DIGEST_ALGORITHMS)[number];

/** Expected hex length per algorithm, so a malformed digest fails closed. */
const DIGEST_HEX_LENGTH: Readonly<Record<DigestAlgorithm, number>> = Object.freeze({
  sha256: 64,
});

const HEX_RE = /^[0-9a-f]+$/;

/** Evaluator versions whose reports this build is willing to read. */
export const SUPPORTED_EVALUATOR_VERSIONS: readonly string[] = Object.freeze(["1.0.0"]);

/** Serializer versions this build understands without migration. */
export const SUPPORTED_SERIALIZER_VERSIONS: readonly string[] = Object.freeze([
  CANONICAL_SERIALIZER_VERSION,
]);

// ---------------------------------------------------------------------------
// Domain separation
// ---------------------------------------------------------------------------

/**
 * What a digest is OF. Framed into the hashed bytes so a digest of one kind
 * can never verify as another, even when the payloads are byte-identical.
 */
export const BINDING_ARTIFACT_TYPES = [
  "skill_contract",
  "skill_manifest",
  "plant_context",
  "applicability_result",
  "evidence_corpus",
  "evidence_selection",
  "policy_decision",
  "model_draft",
  "golden_case_set",
  "golden_case_fixture",
  "expectation_set",
  "execution_config",
  "evaluation_report",
] as const;
export type BindingArtifactType = (typeof BINDING_ARTIFACT_TYPES)[number];

/**
 * The exact bytes that get hashed. Snake_case because this is a wire shape
 * that appears verbatim inside artifacts, not an internal type.
 */
export interface DigestEnvelope {
  binding_version: number;
  artifact_type: BindingArtifactType;
  serializer_version: string;
  canonical_payload: string;
}

/** A digest plus everything needed to re-derive and check it. */
export interface BoundDigest {
  artifactType: BindingArtifactType;
  algorithm: DigestAlgorithm;
  bindingVersion: number;
  serializerVersion: string;
  /** Lowercase hex. */
  value: string;
}

/**
 * Injected hash. Takes the canonical envelope string, returns lowercase hex.
 * Supplied by the Node-only harness; never imported into shared code.
 */
export type DigestFn = (canonicalEnvelopeBytes: string) => string;

/** Frame a value for hashing. Pure — safe in any runtime. */
export function buildDigestEnvelope(
  artifactType: BindingArtifactType,
  value: unknown,
): DigestEnvelope {
  return {
    binding_version: BINDING_ENVELOPE_VERSION,
    artifact_type: artifactType,
    serializer_version: CANONICAL_SERIALIZER_VERSION,
    canonical_payload: serializeSkillContract(value),
  };
}

/**
 * The exact string a `DigestFn` receives. Serialized through the same
 * canonical serializer, so envelope key order cannot change the digest.
 */
export function canonicalEnvelopeBytes(envelope: DigestEnvelope): string {
  return serializeSkillContract(envelope);
}

/** Frame, hash, and label in one step. */
export function computeBoundDigest(
  artifactType: BindingArtifactType,
  value: unknown,
  digest: DigestFn,
  algorithm: DigestAlgorithm = "sha256",
): BoundDigest {
  const envelope = buildDigestEnvelope(artifactType, value);
  return {
    artifactType,
    algorithm,
    bindingVersion: BINDING_ENVELOPE_VERSION,
    serializerVersion: CANONICAL_SERIALIZER_VERSION,
    value: digest(canonicalEnvelopeBytes(envelope)),
  };
}

// ---------------------------------------------------------------------------
// Rejection vocabulary
// ---------------------------------------------------------------------------

/**
 * Why a binding does not verify. Declared order is emission order, so the
 * same set of problems always reports identically regardless of check order.
 */
export const BINDING_REJECTION_REASONS = [
  "missing_binding",
  "unknown_digest_algorithm",
  "unsupported_binding_version",
  "unsupported_serializer_version",
  "unsupported_evaluator_version",
  "malformed_digest",
  "artifact_type_mismatch",
  "digest_mismatch",
  "skill_id_mismatch",
  "skill_version_mismatch",
  "applicability_bound_to_other_manifest",
  "applicability_bound_to_other_context",
  "evidence_selection_does_not_cover_citations",
] as const;
export type BindingRejectionReason = (typeof BINDING_REJECTION_REASONS)[number];

export interface BindingVerification {
  valid: boolean;
  reasons: BindingRejectionReason[];
  /** Harness-authored. Never fixture, model, or grower text. */
  details: string[];
}

function compareTokens(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Verify one bound digest against the value it claims to describe.
 *
 * Fail-closed at every step: an unknown algorithm, an unknown envelope
 * version, a serializer we do not understand, a malformed hex string, a
 * mismatched artifact type, or a recomputation that differs are all
 * rejections. Nothing here degrades to "probably fine".
 */
export function verifyBoundDigest(
  bound: BoundDigest | null | undefined,
  expectedArtifactType: BindingArtifactType,
  actualValue: unknown,
  digest: DigestFn,
): BindingVerification {
  const found = new Set<BindingRejectionReason>();
  const details: string[] = [];
  const reject = (reason: BindingRejectionReason, detail: string): void => {
    found.add(reason);
    details.push(detail);
  };
  const finish = (): BindingVerification => ({
    valid: found.size === 0,
    reasons: BINDING_REJECTION_REASONS.filter((r) => found.has(r)),
    details: [...details].sort(compareTokens),
  });

  if (bound === null || bound === undefined) {
    reject("missing_binding", `No ${expectedArtifactType} binding was supplied.`);
    return finish();
  }
  if (!(DIGEST_ALGORITHMS as readonly string[]).includes(bound.algorithm)) {
    // Never attempt a hash we do not recognize, and never fall back to one
    // we do — a relabelled digest must not be silently reinterpreted.
    reject("unknown_digest_algorithm", `Digest algorithm ${bound.algorithm} is not accepted.`);
    return finish();
  }
  if (bound.bindingVersion !== BINDING_ENVELOPE_VERSION) {
    reject(
      "unsupported_binding_version",
      `Binding envelope version ${bound.bindingVersion} is not understood.`,
    );
  }
  if (!SUPPORTED_SERIALIZER_VERSIONS.includes(bound.serializerVersion)) {
    reject(
      "unsupported_serializer_version",
      `Serializer ${bound.serializerVersion} is not understood; migrate explicitly.`,
    );
  }
  if (bound.artifactType !== expectedArtifactType) {
    reject(
      "artifact_type_mismatch",
      `Binding is a ${bound.artifactType} digest, not a ${expectedArtifactType} digest.`,
    );
  }
  const expectedLength = DIGEST_HEX_LENGTH[bound.algorithm as DigestAlgorithm];
  if (
    typeof bound.value !== "string" ||
    bound.value.length !== expectedLength ||
    !HEX_RE.test(bound.value)
  ) {
    reject("malformed_digest", `Digest is not ${expectedLength} lowercase hex characters.`);
  }
  // Only recompute once the envelope framing is trustworthy; recomputing
  // against an unknown frame would produce a meaningless comparison.
  if (found.size === 0) {
    const recomputed = computeBoundDigest(
      expectedArtifactType,
      actualValue,
      digest,
      bound.algorithm,
    );
    if (recomputed.value !== bound.value) {
      reject("digest_mismatch", `The ${expectedArtifactType} binding does not match what was evaluated.`);
    }
  }
  return finish();
}

// ---------------------------------------------------------------------------
// Binding record
// ---------------------------------------------------------------------------

export interface SkillBinding {
  skillId: string;
  skillVersion: string;
}

/**
 * An applicability verdict carries the manifest and context it was derived
 * FROM, so a verdict cannot be borrowed from a permissive skill or from an
 * older snapshot of the same plant.
 */
export interface ApplicabilityProvenance {
  result: BoundDigest;
  derivedFromManifest: BoundDigest;
  derivedFromContext: BoundDigest;
}

export interface EvidenceProvenance {
  registryVersion: string;
  corpus: BoundDigest;
  /** Sorted membership, not ranking. */
  selectedEvidenceIds: string[];
  selection: BoundDigest;
}

export interface RuntimeProvenance {
  skillRuntimeVersion: string;
  evaluatorVersion: string;
  /** Rubric / scoring policy the report was scored under. */
  scoringPolicyVersion: string;
  executionConfig: BoundDigest;
}

export interface SkillEvaluationBindings {
  bindingVersion: string;
  skill: SkillBinding;
  skillContract: BoundDigest;
  manifest: BoundDigest;
  context: BoundDigest;
  applicability: ApplicabilityProvenance;
  evidence: EvidenceProvenance;
  policy: BoundDigest;
  policyVersion: string;
  draft: BoundDigest;
  draftAdapterId: string;
  draftAdapterVersion: string;
  fixture: BoundDigest;
  fixtureId: string;
  fixtureVersion: string;
  goldenCaseSet: BoundDigest;
  expectation: BoundDigest;
  expectationSetVersion: string;
  runtime: RuntimeProvenance;
}

/**
 * Every binding a report must carry. A report missing any of these is
 * INVALID — not low-confidence, not provisional. Absence of proof is not
 * weak proof.
 */
export const REQUIRED_BINDING_ARTIFACTS: readonly BindingArtifactType[] = Object.freeze([
  "skill_contract",
  "skill_manifest",
  "plant_context",
  "applicability_result",
  "evidence_corpus",
  "evidence_selection",
  "policy_decision",
  "model_draft",
  "golden_case_fixture",
  "golden_case_set",
  "expectation_set",
  "execution_config",
]);

/** The live objects a binding record is checked against. */
export interface BindingVerificationInput {
  bindings: SkillEvaluationBindings;
  digest: DigestFn;
  actual: {
    skillId: string;
    skillVersion: string;
    skillContract: unknown;
    manifest: unknown;
    context: unknown;
    applicability: unknown;
    evidenceCorpus: unknown;
    selectedEvidenceIds: readonly string[];
    citedEvidenceIds: readonly string[];
    policy: unknown;
    draft: unknown;
    fixture: unknown;
    goldenCaseSet: unknown;
    expectation: unknown;
    executionConfig: unknown;
    evaluatorVersion: string;
  };
}

/**
 * Verify a whole binding record against the objects actually used.
 *
 * Collects EVERY rejection rather than stopping at the first: an operator
 * fixing one binding needs to see the rest, and a partial answer invites the
 * assumption that the remainder is sound.
 */
export function verifyEvaluationBindings(input: BindingVerificationInput): BindingVerification {
  const found = new Set<BindingRejectionReason>();
  const details: string[] = [];
  const b = input.bindings;
  const a = input.actual;

  const absorb = (v: BindingVerification): void => {
    for (const r of v.reasons) found.add(r);
    for (const d of v.details) details.push(d);
  };
  const reject = (reason: BindingRejectionReason, detail: string): void => {
    found.add(reason);
    details.push(detail);
  };

  if (b === null || b === undefined) {
    reject("missing_binding", "No binding record was supplied.");
    return { valid: false, reasons: [...found], details };
  }
  if (b.bindingVersion !== SKILL_EVALUATION_BINDING_VERSION) {
    reject(
      "unsupported_binding_version",
      `Binding record version ${b.bindingVersion} is not understood.`,
    );
  }
  if (!SUPPORTED_EVALUATOR_VERSIONS.includes(b.runtime?.evaluatorVersion)) {
    reject(
      "unsupported_evaluator_version",
      `Evaluator version ${b.runtime?.evaluatorVersion} is not supported.`,
    );
  }
  if (b.runtime?.evaluatorVersion !== a.evaluatorVersion) {
    reject(
      "unsupported_evaluator_version",
      "Report was scored by a different evaluator than the one running.",
    );
  }

  if (b.skill?.skillId !== a.skillId) reject("skill_id_mismatch", "Bound skill id differs.");
  if (b.skill?.skillVersion !== a.skillVersion) {
    reject("skill_version_mismatch", "Bound skill version differs.");
  }

  absorb(verifyBoundDigest(b.skillContract, "skill_contract", a.skillContract, input.digest));
  absorb(verifyBoundDigest(b.manifest, "skill_manifest", a.manifest, input.digest));
  absorb(verifyBoundDigest(b.context, "plant_context", a.context, input.digest));
  absorb(
    verifyBoundDigest(b.applicability?.result, "applicability_result", a.applicability, input.digest),
  );
  absorb(verifyBoundDigest(b.evidence?.corpus, "evidence_corpus", a.evidenceCorpus, input.digest));
  absorb(
    verifyBoundDigest(
      b.evidence?.selection,
      "evidence_selection",
      [...a.selectedEvidenceIds].sort(compareTokens),
      input.digest,
    ),
  );
  absorb(verifyBoundDigest(b.policy, "policy_decision", a.policy, input.digest));
  absorb(verifyBoundDigest(b.draft, "model_draft", a.draft, input.digest));
  absorb(verifyBoundDigest(b.fixture, "golden_case_fixture", a.fixture, input.digest));
  absorb(verifyBoundDigest(b.goldenCaseSet, "golden_case_set", a.goldenCaseSet, input.digest));
  absorb(verifyBoundDigest(b.expectation, "expectation_set", a.expectation, input.digest));
  absorb(
    verifyBoundDigest(b.runtime?.executionConfig, "execution_config", a.executionConfig, input.digest),
  );

  // The provenance checks this build exists for: a verdict must have been
  // derived from THIS manifest and THIS context, not merely resemble them.
  const manifestDigest = computeBoundDigest("skill_manifest", a.manifest, input.digest).value;
  const contextDigest = computeBoundDigest("plant_context", a.context, input.digest).value;
  if (b.applicability?.derivedFromManifest?.value !== manifestDigest) {
    reject(
      "applicability_bound_to_other_manifest",
      "Applicability was derived from a different manifest than the one evaluated.",
    );
  }
  if (b.applicability?.derivedFromContext?.value !== contextDigest) {
    reject(
      "applicability_bound_to_other_context",
      "Applicability was derived from a different context than the one evaluated.",
    );
  }

  // A citation outside the selection rests on evidence retrieval never approved.
  const selected = new Set(a.selectedEvidenceIds);
  const uncovered = [...a.citedEvidenceIds].filter((id) => !selected.has(id)).sort(compareTokens);
  if (uncovered.length > 0) {
    reject(
      "evidence_selection_does_not_cover_citations",
      `Cited evidence outside the selected set: ${uncovered.join(", ")}.`,
    );
  }

  return {
    valid: found.size === 0,
    reasons: BINDING_REJECTION_REASONS.filter((r) => found.has(r)),
    details: [...details].sort(compareTokens),
  };
}
