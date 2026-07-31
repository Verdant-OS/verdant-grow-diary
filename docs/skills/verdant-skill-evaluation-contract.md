# Verdant Skill Evaluation Contract

Build 7 of the Verdant Skill Runtime. What the evaluation harness proves, what
it does not, and how to read its output.

## The governing rule

> No evaluation status, score, promotion decision, or human-facing report is
> trustworthy until every required binding verifies.

The failure mode of an evaluation harness is not a wrong number. It is an
attractive report that is not about the thing it claims to describe. A green
report bound to last week's manifest is worse than no report, because it is
believed.

## Architecture

| Module                                        | Runtime   | Owns                                                                          |
| --------------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| `src/lib/verdantSkillEvaluationBindings.ts`   | any       | Envelope, required-binding policy, fail-closed verifier. **No cryptography.** |
| `scripts/lib/verdantSkillEvaluationDigest.ts` | Node only | SHA-256, injected as a `DigestFn`.                                            |
| `src/lib/verdantSkillEvaluationTypes.ts`      | any       | Vocabularies, case-result shape, evaluation progression.                      |
| `src/lib/verdantSkillEvaluationSchemas.ts`    | any       | Fixture validation.                                                           |
| `src/lib/verdantSkillEvaluator.ts`            | any       | Judges one case.                                                              |
| `src/lib/verdantSkillEvaluationMetrics.ts`    | any       | Aggregate rates.                                                              |
| `src/lib/verdantSkillEvaluationReport.ts`     | any       | Report value, Markdown, self-digest, disclosure scan.                         |
| `src/lib/verdantSkillPromotionRules.ts`       | any       | Eligibility decision. Never mutates state.                                    |
| `scripts/run-verdant-skill-evals.ts`          | Node only | CLI and artifact writes.                                                      |

### Why the hash is injected

Integrity verification needs a cryptographic digest. `node:crypto` must not
reach client-importable code, and a conditional runtime import would hide that
hazard rather than remove it. The boundary is therefore physical: shared code
builds the envelope, the Node-only harness supplies the hash.

**A caller without a `DigestFn` cannot construct a binding at all** — unbound
evaluation is unrepresentable, not merely discouraged. A source-scan test
asserts `src/` imports `node:crypto` nowhere.

Non-cryptographic hashes (FNV and relatives) are not accepted for verification
anywhere. They are fine for a cache key and unfit for a release gate.

## Binding requirements

Digests are computed over a typed envelope, never over bare payload bytes and
never over concatenated strings:

```json
{
  "binding_version": 1,
  "artifact_type": "skill_manifest",
  "serializer_version": "verdant-skill-contract/1",
  "canonical_payload": "..."
}
```

Framing `artifact_type` inside the hashed bytes means the same payload under a
different type produces a different digest, so a manifest digest can never
verify as a corpus digest. Concatenation such as `contract + manifest + corpus`
is rejected as a design: different splits of the same characters collide.

Required artifacts: `skill_contract`, `skill_manifest`, `plant_context`,
`applicability_result`, `evidence_corpus`, `evidence_selection`,
`policy_decision`, `model_draft`, `golden_case_fixture`, `golden_case_set`,
`expectation_set`, `execution_config`.

Applicability additionally carries the manifest and context it was **derived
from**, so a verdict cannot be borrowed from a permissive skill or an older
snapshot of the same plant.

### Fail-closed rejections

Unknown digest algorithm, unknown envelope version, unsupported serializer
version, unsupported evaluator version, malformed digest, artifact-type
mismatch, digest mismatch, missing binding, skill id or version mismatch,
applicability bound to another manifest or context, and citation outside the
selected evidence set.

Nothing degrades to "probably fine", and a relabelled algorithm is never
silently reinterpreted under a different one.

## Failure classes

`none`, `fixture_invalid`, `binding_invalid`, `output_schema_invalid`,
`expectation_mismatch`, `determinism_failure`, `safety_policy_failure`,
`evaluator_error`.

A case whose bindings do not verify is `binding_invalid`, and its expectation
fields stay at unevaluated defaults. Judging a run you cannot identify
produces a number that looks like a measurement and is not one.

## Hard safety failures

`device_control_emitted`, `execution_capability_exceeded`,
`permission_elevation`, `unhealthy_telemetry_supported_conclusion`,
`expected_abstention_but_acted`, `high_impact_action_on_insufficient_context`,
`evidence_cited_outside_selection`, `confidence_from_uncited_evidence`,
`applicability_bound_to_other_manifest`, `policy_bound_to_other_version`,
`output_contract_invalid_in_safety_case`,
`determinism_failure_in_required_case`, `secret_like_value_present`.

A wrong summary is a quality problem; an equipment instruction is a safety
one. Both block promotion; only these produce exit code 3.

## Metrics

Every rate carries `status`, `numerator`, `denominator` and `value`. A rate
with no applicable cases reports `not_measured` with a **null** value, never
100%. "We abstained correctly in all zero opportunities" is not a safety
property, and a dashboard rendering it green is worse than one rendering
nothing.

Confidence checks are **conformance** to a fixture-authored band, never
calibration. Calibration means agreement with real-world outcome frequencies
over a population, which fixtures cannot measure.

## Limitations

Stated inside every artifact, not only here:

- Model behaviour comes from deterministic fixtures. No provider is called.
- Confidence conformance is not calibration.
- Unsupported-claim detection is deterministic substring matching over
  fixture-authored strings. It proves the absence of stated phrases, not
  semantic factuality.
- Fixtures are synthetic. Results describe runtime behaviour on constructed
  input, not field performance.
- A rate reported as `not_measured` is not a score of any kind.

## Artifacts

```
artifacts/skills/<skill-id>/<skill-version>/evaluation.json
artifacts/skills/<skill-id>/<skill-version>/evaluation.md
artifacts/skills/<skill-id>/<skill-version>/promotion-decision.json
artifacts/skills/<skill-id>/<skill-version>/promotion-decision.md
```

Written atomically — temp file then rename. A half-written `evaluation.json`
that still parses is worse than none, because CI would upload it and a reader
would trust it.

Artifacts carry ids, digests, verdicts and counts. They never carry the
compiled plant context, model prose, or grower data; the redaction is
structural, those fields are simply not copied in.

The report carries a digest **of itself**, so a stored artifact can be
re-verified later without trusting its filename or the directory it was found
in.

## Exit codes

| Code | Meaning                                                         |
| ---- | --------------------------------------------------------------- |
| 0    | Evaluation passed                                               |
| 1    | Ordinary evaluation failure (expectations unmet)                |
| 2    | Usage, fixture-schema, binding, or I/O error                    |
| 3    | Hard safety failure                                             |
| 4    | Blocked — promotion refused for a missing attestation or target |

2 is separate from 1 because "the harness could not run" and "the skill
failed" are different facts, and collapsing them lets a broken invocation read
as a clean refusal. 3 is separate from 1 because an equipment instruction is
not a scoring miss.
