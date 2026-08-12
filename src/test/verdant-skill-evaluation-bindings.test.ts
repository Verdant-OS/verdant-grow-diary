/**
 * Evaluation binding integrity (Build 7, commit 1).
 *
 * The acceptance bar for this commit is NOT the happy path. It is the
 * cross-binding and mutation cases: a report that verifies while describing
 * something other than what it judged is the failure this whole layer exists
 * to make impossible.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  BINDING_ARTIFACT_TYPES,
  BINDING_ENVELOPE_VERSION,
  BINDING_REJECTION_REASONS,
  CANONICAL_SERIALIZER_VERSION,
  REQUIRED_BINDING_ARTIFACTS,
  SKILL_EVALUATION_BINDING_VERSION,
  buildDigestEnvelope,
  canonicalEnvelopeBytes,
  computeBoundDigest,
  verifyBoundDigest,
  verifyEvaluationBindings,
  type BindingVerificationInput,
  type BoundDigest,
  type SkillEvaluationBindings,
} from "@/lib/verdantSkillEvaluationBindings";
import { sha256Digest, digestFnFor } from "../../scripts/lib/verdantSkillEvaluationDigest";

const ROOT = resolve(__dirname, "../..");
const D = sha256Digest;

// ---------------------------------------------------------------------------
// A minimal but complete binding record, plus the objects it binds.
// ---------------------------------------------------------------------------

const SKILL_CONTRACT = { contractVersion: "1.0.0", shape: "skill-run-result" };
const MANIFEST = { id: "harness-self-test", version: "1.0.0", riskClass: "low" };
const CONTEXT = { contextVersion: "ctx-1", plantId: "plant-a", stage: "flower" };
const APPLICABILITY = { verdict: "applicable", skillId: "harness-self-test" };
const CORPUS = { registryVersion: "1.0.0", records: ["ev-1", "ev-2"] };
const SELECTED = ["ev-1", "ev-2"];
const POLICY = { decisionVersion: "1.0.0", outcomes: ["observation_only"] };
const DRAFT = { adapter: "fixture", text: "Take a runoff reading." };
const FIXTURE = { fixtureId: "hst-001", fixtureVersion: "1.0.0", kind: "harness_self_test" };
const CASE_SET = { fixtureIds: ["hst-001", "hst-002"] };
const EXPECTATION = { expectedPolicyOutcome: "observation_only" };
const EXEC_CONFIG = { repeat: 2, now: "2026-08-01T00:00:00.000Z" };

function bindings(overrides: Partial<SkillEvaluationBindings> = {}): SkillEvaluationBindings {
  return {
    bindingVersion: SKILL_EVALUATION_BINDING_VERSION,
    skill: { skillId: "harness-self-test", skillVersion: "1.0.0" },
    skillContract: computeBoundDigest("skill_contract", SKILL_CONTRACT, D),
    manifest: computeBoundDigest("skill_manifest", MANIFEST, D),
    context: computeBoundDigest("plant_context", CONTEXT, D),
    applicability: {
      result: computeBoundDigest("applicability_result", APPLICABILITY, D),
      derivedFromManifest: computeBoundDigest("skill_manifest", MANIFEST, D),
      derivedFromContext: computeBoundDigest("plant_context", CONTEXT, D),
    },
    evidence: {
      registryVersion: "1.0.0",
      corpus: computeBoundDigest("evidence_corpus", CORPUS, D),
      selectedEvidenceIds: [...SELECTED],
      selection: computeBoundDigest("evidence_selection", [...SELECTED].sort(), D),
    },
    policy: computeBoundDigest("policy_decision", POLICY, D),
    policyVersion: "1.0.0",
    draft: computeBoundDigest("model_draft", DRAFT, D),
    draftAdapterId: "fixture",
    draftAdapterVersion: "1.0.0",
    fixture: computeBoundDigest("golden_case_fixture", FIXTURE, D),
    fixtureId: "hst-001",
    fixtureVersion: "1.0.0",
    goldenCaseSet: computeBoundDigest("golden_case_set", CASE_SET, D),
    expectation: computeBoundDigest("expectation_set", EXPECTATION, D),
    expectationSetVersion: "1.0.0",
    runtime: {
      skillRuntimeVersion: "1.0.0",
      evaluatorVersion: "1.0.0",
      scoringPolicyVersion: "1.0.0",
      executionConfig: computeBoundDigest("execution_config", EXEC_CONFIG, D),
    },
    ...overrides,
  };
}

function actual(
  overrides: Partial<BindingVerificationInput["actual"]> = {},
): BindingVerificationInput["actual"] {
  return {
    skillId: "harness-self-test",
    skillVersion: "1.0.0",
    skillContract: SKILL_CONTRACT,
    manifest: MANIFEST,
    context: CONTEXT,
    applicability: APPLICABILITY,
    evidenceCorpus: CORPUS,
    selectedEvidenceIds: SELECTED,
    citedEvidenceIds: ["ev-1"],
    policy: POLICY,
    draft: DRAFT,
    fixture: FIXTURE,
    goldenCaseSet: CASE_SET,
    expectation: EXPECTATION,
    executionConfig: EXEC_CONFIG,
    evaluatorVersion: "1.0.0",
    ...overrides,
  };
}

function verify(
  b: SkillEvaluationBindings = bindings(),
  a: BindingVerificationInput["actual"] = actual(),
) {
  return verifyEvaluationBindings({ bindings: b, digest: D, actual: a });
}

// ---------------------------------------------------------------------------

describe("digest envelope — framing and domain separation", () => {
  it("produces a cryptographic digest of the stated shape", () => {
    const d = computeBoundDigest("skill_manifest", MANIFEST, D);
    expect(d.algorithm).toBe("sha256");
    expect(d.value).toMatch(/^[0-9a-f]{64}$/);
    expect(d.bindingVersion).toBe(BINDING_ENVELOPE_VERSION);
    expect(d.serializerVersion).toBe(CANONICAL_SERIALIZER_VERSION);
  });

  it("keeps identical payloads distinct across artifact types", () => {
    // The whole point of framing: a manifest digest must never be usable as
    // a corpus digest, even when the bytes underneath are the same.
    const asManifest = computeBoundDigest("skill_manifest", MANIFEST, D);
    const asCorpus = computeBoundDigest("evidence_corpus", MANIFEST, D);
    expect(asManifest.value).not.toBe(asCorpus.value);
  });

  it("keeps inputs distinct that naive concatenation would collide", () => {
    // "ab"+"c" vs "a"+"bc" — identical under string concatenation, distinct
    // under a typed envelope.
    const left = computeBoundDigest("skill_contract", { a: "ab", b: "c" }, D);
    const right = computeBoundDigest("skill_contract", { a: "a", b: "bc" }, D);
    expect(left.value).not.toBe(right.value);
  });

  it("is unchanged by key order but changed by array order", () => {
    const a = computeBoundDigest("skill_contract", { x: 1, y: 2 }, D);
    const b = computeBoundDigest("skill_contract", { y: 2, x: 1 }, D);
    expect(a.value).toBe(b.value);
    // A reordered evidence selection is a different selection.
    const first = computeBoundDigest("evidence_selection", ["ev-1", "ev-2"], D);
    const second = computeBoundDigest("evidence_selection", ["ev-2", "ev-1"], D);
    expect(first.value).not.toBe(second.value);
  });

  it("changes on a one-byte mutation of the payload", () => {
    const before = computeBoundDigest("plant_context", CONTEXT, D);
    const after = computeBoundDigest("plant_context", { ...CONTEXT, plantId: "plant-b" }, D);
    expect(after.value).not.toBe(before.value);
  });

  it("frames the artifact type inside the hashed bytes", () => {
    const envelope = buildDigestEnvelope("policy_decision", POLICY);
    const bytes = canonicalEnvelopeBytes(envelope);
    expect(bytes).toContain("policy_decision");
    expect(bytes).toContain(CANONICAL_SERIALIZER_VERSION);
  });

  it("refuses an unsupported algorithm rather than falling back", () => {
    expect(() => digestFnFor("md5" as never)).toThrow();
  });
});

describe("bound digest — fail-closed verification", () => {
  const good = (): BoundDigest => computeBoundDigest("skill_manifest", MANIFEST, D);

  it("accepts a correct binding", () => {
    expect(verifyBoundDigest(good(), "skill_manifest", MANIFEST, D).valid).toBe(true);
  });

  it("rejects a missing binding", () => {
    const v = verifyBoundDigest(null, "skill_manifest", MANIFEST, D);
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("missing_binding");
  });

  it("rejects an unknown digest algorithm without hashing", () => {
    const v = verifyBoundDigest(
      { ...good(), algorithm: "fnv1a" as never },
      "skill_manifest",
      MANIFEST,
      D,
    );
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("unknown_digest_algorithm");
  });

  it("rejects a relabelled algorithm whose digest was not recomputed", () => {
    // Editing one string must not downgrade the boundary.
    const v = verifyBoundDigest(
      { ...good(), algorithm: "sha512" as never },
      "skill_manifest",
      MANIFEST,
      D,
    );
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("unknown_digest_algorithm");
  });

  it("rejects an unknown envelope version", () => {
    const v = verifyBoundDigest({ ...good(), bindingVersion: 99 }, "skill_manifest", MANIFEST, D);
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("unsupported_binding_version");
  });

  it("rejects an unknown serializer rather than reinterpreting it", () => {
    const v = verifyBoundDigest(
      { ...good(), serializerVersion: "some-other/9" },
      "skill_manifest",
      MANIFEST,
      D,
    );
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("unsupported_serializer_version");
  });

  it("rejects a malformed digest", () => {
    for (const value of ["", "zz", "ABCDEF", "0".repeat(63), "0".repeat(65)]) {
      const v = verifyBoundDigest({ ...good(), value }, "skill_manifest", MANIFEST, D);
      expect(v.valid, value).toBe(false);
      expect(v.reasons).toContain("malformed_digest");
    }
  });

  it("rejects a digest of the wrong artifact type", () => {
    const corpusDigest = computeBoundDigest("evidence_corpus", MANIFEST, D);
    const v = verifyBoundDigest(corpusDigest, "skill_manifest", MANIFEST, D);
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("artifact_type_mismatch");
  });

  it("rejects a digest that does not match the value", () => {
    const v = verifyBoundDigest(good(), "skill_manifest", { ...MANIFEST, version: "2.0.0" }, D);
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("digest_mismatch");
  });
});

describe("binding record — cross-binding adversarial cases", () => {
  it("verifies a complete, correct record", () => {
    const v = verify();
    expect(v.reasons).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it("rejects a contract from skill A paired with a report from skill B", () => {
    const v = verify(bindings(), actual({ skillId: "some-other-skill" }));
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("skill_id_mismatch");
  });

  it("rejects a swapped manifest while the contract is unchanged", () => {
    const v = verify(bindings(), actual({ manifest: { ...MANIFEST, riskClass: "high" } }));
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("digest_mismatch");
  });

  it("rejects a swapped evidence corpus between otherwise identical runs", () => {
    const v = verify(bindings(), actual({ evidenceCorpus: { ...CORPUS, records: ["ev-9"] } }));
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("digest_mismatch");
  });

  it("rejects a golden-case set changed after the report was generated", () => {
    const v = verify(bindings(), actual({ goldenCaseSet: { fixtureIds: ["hst-001"] } }));
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("digest_mismatch");
  });

  it("rejects an evaluator version changed without rerunning", () => {
    const v = verify(bindings(), actual({ evaluatorVersion: "2.0.0" }));
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("unsupported_evaluator_version");
  });

  it("rejects an applicability verdict derived from another manifest", () => {
    const b = bindings();
    b.applicability.derivedFromManifest = computeBoundDigest(
      "skill_manifest",
      { ...MANIFEST, id: "permissive-skill" },
      D,
    );
    const v = verify(b);
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("applicability_bound_to_other_manifest");
  });

  it("rejects an applicability verdict derived from another context", () => {
    const b = bindings();
    b.applicability.derivedFromContext = computeBoundDigest(
      "plant_context",
      { ...CONTEXT, contextVersion: "ctx-0" },
      D,
    );
    const v = verify(b);
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("applicability_bound_to_other_context");
  });

  it("rejects a fixture edited without a version bump", () => {
    const v = verify(bindings(), actual({ fixture: { ...FIXTURE, kind: "golden_case" } }));
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("digest_mismatch");
  });

  it("rejects a citation outside the selected evidence set", () => {
    const v = verify(bindings(), actual({ citedEvidenceIds: ["ev-1", "ev-99"] }));
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("evidence_selection_does_not_cover_citations");
  });

  it("rejects a missing binding even when everything else passes", () => {
    // The case that matters most: clean content, incomplete proof.
    const b = bindings();
    (b as unknown as Record<string, unknown>).policy = null;
    const v = verify(b);
    expect(v.valid).toBe(false);
    expect(v.reasons).toContain("missing_binding");
  });

  it("collects every rejection rather than stopping at the first", () => {
    const v = verify(
      bindings(),
      actual({ skillId: "other", manifest: { ...MANIFEST, version: "9.9.9" } }),
    );
    expect(v.reasons.length).toBeGreaterThan(1);
    expect(v.reasons).toContain("skill_id_mismatch");
    expect(v.reasons).toContain("digest_mismatch");
  });

  it("re-verifies an untouched record identically", () => {
    const b = bindings();
    const a = actual();
    const first = verify(b, a);
    const second = verify(b, a);
    expect(second).toEqual(first);
  });

  it("orders rejection reasons deterministically", () => {
    const v = verify(bindings(), actual({ skillId: "other", skillVersion: "9.9.9" }));
    expect(v.reasons).toEqual(BINDING_REJECTION_REASONS.filter((r) => v.reasons.includes(r)));
    expect(v.details).toEqual([...v.details].sort());
  });
});

describe("binding policy — required coverage", () => {
  it("requires every provenance artifact the governing rule names", () => {
    for (const required of [
      "skill_contract",
      "skill_manifest",
      "evidence_corpus",
      "golden_case_set",
      "expectation_set",
      "execution_config",
    ] as const) {
      expect(REQUIRED_BINDING_ARTIFACTS).toContain(required);
    }
    for (const t of REQUIRED_BINDING_ARTIFACTS) {
      expect(BINDING_ARTIFACT_TYPES).toContain(t);
    }
  });
});

describe("browser boundary", () => {
  it("keeps node:crypto out of client-importable code", () => {
    // The separation is physical, not conditional. If this fails, the bundle
    // hazard is back regardless of how the import is guarded.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "test" || entry === "__tests__") continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        if (/\.test\.(ts|tsx)$/.test(entry)) continue;
        const source = readFileSync(full, "utf8");
        // Matched as an IMPORT, so the comment in the bindings module that
        // explains why node:crypto is absent does not trip its own rule.
        const importsCrypto = /(?:import[^;]*from\s*|require\s*\(\s*)["'](?:node:)?crypto["']/.test(
          source,
        );
        if (importsCrypto) offenders.push(full.slice(ROOT.length + 1));
      }
    };
    walk(join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("keeps the shared binding module free of any hashing implementation", () => {
    const source = readFileSync(resolve(ROOT, "src/lib/verdantSkillEvaluationBindings.ts"), "utf8");
    // Call and import forms, not the words — the module documents at length
    // why it does not hash, and must not fail for saying so.
    expect(source).not.toContain("createHash(");
    expect(/(?:import[^;]*from\s*|require\s*\(\s*)["'](?:node:)?crypto["']/.test(source)).toBe(
      false,
    );
    // No non-cryptographic hash may creep back in as a shortcut.
    expect(source).not.toContain("Math.imul(");
    expect(source).not.toContain("fnv1a");
  });
});
