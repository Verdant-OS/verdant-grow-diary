# Verdant Skill Promotion Policy — Runtime v1

**Status:** Required release policy for every Verdant Skill Runtime v1
definition and version.

Promotion is a source-control and review decision. A manifest cannot promote
itself, a fixture cannot register a skill, and a passing happy-path test is not
enough. Only a trusted first-party definition that satisfies the authoring
contract and all applicable gates may enter the closed production registry.

## Promotion stages

| Stage              | Meaning                                                                                                                 | Production registry                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `draft`            | Contract or implementation is still changing. Local unit tests may be incomplete.                                       | Excluded.                              |
| `evaluation-ready` | Manifest, implementation, tests, and golden fixtures are complete enough for independent review.                        | Excluded.                              |
| `promoted`         | A specific immutable version passed every required contract, regression, safety, and ownership gate.                    | Included by an explicit source change. |
| `retired`          | A previously promoted version must not be selected for new runs. Its history and evaluation evidence remain reviewable. | Excluded from new resolution.          |

Stage is repository release metadata and review state; it is not a
user-controlled runtime permission. Runtime v1 does not require a database
column or migration for promotion state.

Allowed transitions are:

```text
draft -> evaluation-ready -> promoted -> retired
           |                  |
           +----> draft <-----+
```

An evaluation failure returns the candidate to `draft`. A promoted version is
immutable; corrections are made under a new version and start at `draft`.
Retirement is not undone in place. If the behavior must return, promote a new
version after a fresh evaluation.

## Stage requirements

### Draft

A draft MUST have:

- a named Verdant owner;
- a bounded grower problem and non-goals;
- the proposed `verdant-skill-manifest.v1` manifest contract;
- a proposed stable identifier and semantic version;
- proposed input, output, applicability, and safety contracts; and
- no entry in the production registry.

Draft code MAY be exercised directly in focused tests. It MUST NOT be resolved
as a production skill, presented as available in UI, or used to justify schema,
model, device, or automation work.

### Evaluation-ready

Before entering evaluation, a candidate MUST have:

- a valid immutable manifest;
- a typed first-party definition;
- pure applicability and execution functions;
- a fail-closed policy declaration;
- normalized outcomes;
- injected time and deterministic ordering;
- a data-only golden fixture set;
- all focused tests required by the authoring contract;
- documented limitations and missing-evidence behavior;
- an accountable owner and backup reviewer; and
- a proposed rollback and retirement procedure.

The candidate remains outside the production registry while these artifacts
are reviewed.

### Promoted

A specific version may be promoted only after every required gate below passes
on the exact commit proposed for registry inclusion. Promotion requires an
explicit reviewed source change that adds the exact identifier-version pair to
the closed registry.

There is no partial promotion. A skipped, flaky, unknown, or unavailable
required gate is not a pass. Re-running an unchanged flaky job can help
classify infrastructure noise, but a rerun alone is not evidence that a
deterministic regression was fixed.

### Retired

Retirement MUST:

- remove the exact version from new production resolution;
- preserve its source history, manifest, golden fixtures, and evaluation
  evidence;
- document the reason, replacement version if any, and effective commit;
- avoid rewriting historical run envelopes; and
- include a focused test proving new resolution fails closed.

Runtime v1 does not persist skill runs. If a caller stores a returned run
envelope using an already-approved existing data path, the exact skill identity
and version must remain intact; retirement must not relabel it as a newer
version.

## Required promotion gates

### 1. Identity and manifest gate

Evidence MUST show:

- exact `schemaVersion: "verdant-skill-manifest.v1"`;
- stable identifier format;
- exact semantic version;
- v1-compatible `verdant-skill-run-receipt.v1` execution contract;
- declared `.v1` input and output kinds;
- `activation: "explicit"` and `sideEffects: "none"`;
- the exact `read_supplied_context` capability and fixed v1 policy tags;
- named ownership;
- no duplicate identifier-version pair; and
- no floating `latest` dependency.

The registry must reject malformed, duplicate, incompatible, or unregistered
definitions.

### 2. Input and applicability gate

Tests MUST cover:

- representative applicable input;
- null and malformed input;
- missing required context;
- unsupported scope or event type;
- invalid and future timestamps where relevant;
- numeric and array boundaries;
- unknown fields and provenance; and
- a proof that not-applicable input never reaches the executor.

Missing evidence must remain missing. The candidate cannot earn promotion by
converting an insufficiency into low-confidence advice.

An explicitly declared evidence-gap review skill MAY execute with optional
evidence missing only to return a validated `insufficient_evidence` outcome
that inventories limitations and names safe data to log next. Promotion
evidence MUST prove that this path does not produce diagnosis, treatment,
completed guidance, or increased confidence, and that missing structurally
required identity, time, or scope still prevents execution.

### 3. Policy and side-effect gate

Static and runtime-focused evidence MUST prove the candidate:

- reads only caller-supplied in-memory context;
- returns only typed advisory data;
- performs no database, network, file-system, browser-storage, environment, or
  secret access;
- loads no arbitrary or third-party code;
- makes no live model call;
- issues no hardware or device command;
- dispatches no webhook, background task, or alert mutation;
- performs no Action Queue insert, update, approval, execution, or status
  transition; and
- fails closed for every unknown capability or effect.

The test suite MUST use a spy or equivalent assertion to prove the executor is
not called after policy denial. A comment asserting that a skill is read-only
is not sufficient evidence.

No waiver can override a v1 hard safety fence.

### 4. Determinism gate

For identical definition version, normalized input, injected timestamp, and
caller-supplied `runId`, tests MUST prove deeply equal:

- applicability;
- reason-code order;
- output;
- limitations and missing-information order; and
- final run envelope.

Tests MUST include shuffled equivalent inputs when ordering is relevant. No
system clock, randomness, locale-dependent ordering, runtime-generated run
identifier, or environment-dependent branch may influence the result. The
domain output MUST not depend on the correlation-only `runId`.

### 5. Golden evaluation gate

Golden cases MUST be data-only, reviewed, and committed with the candidate.
They MUST include at least:

- a representative successful case;
- an insufficient-evidence case;
- an invalid-input case;
- a provenance or trust-boundary case when sensor or imported data is used;
- a boundary case;
- an ordering/determinism case; and
- an adversarial safety case.

The evaluator MUST run the candidate through the same public runtime path used
by normal callers. Directly invoking an internal helper is useful unit
coverage, but it does not satisfy this gate.

Expected fixture output may change only when reviewers can identify the
intentional contract or behavior change and the candidate version is updated
accordingly. Do not accept regenerated snapshots without semantic review.

### 6. Domain-safety gate

A grow-domain reviewer MUST verify that the output:

- distinguishes evidence from inference;
- names missing context;
- avoids certainty from one event, photo, or reading;
- does not infer plant causation from tent-wide data;
- keeps manual, CSV, demo, stale, invalid, and unknown sources distinct;
- never labels bad or unknown telemetry healthy;
- avoids aggressive nutrient, irrigation, or equipment changes from weak
  evidence; and
- recommends conservative observation or logging when context is incomplete.

The reference Plant Event Review skill must help the grower review what was
recorded and what to log next. It must not diagnose beyond the supplied
evidence or claim that any row was written.

### 7. Regression gate

The exact candidate commit MUST pass:

- manifest tests;
- applicability tests;
- runtime tests;
- policy tests;
- domain-skill tests;
- all golden cases;
- TypeScript type-checking;
- lint for touched source and tests;
- repository documentation safety checks; and
- any existing focused safety scanner implicated by the skill's input or
  output.

The reviewer MUST compare failures with the base branch and report:

```text
Targeted tests:
Full suite:
Type-check:
Runtime harness:
Skipped:
Introduced failures:
Pre-existing failures:
```

A targeted green slice is required but does not authorize describing an
unexecuted full suite as green. Any introduced failure blocks promotion.
Pre-existing failures must be named, shown not to involve the candidate, and
handled under the repository's normal merge policy.

### 8. Human review and ownership gate

Promotion requires:

- implementation review by a Verdant maintainer other than the author;
- domain-safety review for grow guidance;
- explicit confirmation that every v1 hard fence remains intact;
- a primary owner and backup owner;
- a rollback commit or exact registry-removal procedure;
- a version-change classification; and
- release notes that state limitations without claiming future functionality.

High test counts do not replace accountable review.

## Evaluation evidence record

The pull request or release evidence for a promoted version MUST identify:

- skill identifier and exact version;
- `verdant-skill-manifest.v1` manifest schema;
- `verdant-skill-run-receipt.v1` receipt schema;
- source commit;
- golden fixture path and case count;
- commands run with exact pass/fail counts;
- reviewer names or repository identities;
- known limitations;
- rollback action;
- promotion date; and
- any deferred work.

Evidence MUST NOT contain credentials, private sensor payloads, personal data,
signed URLs, or production secrets.

## Change and version policy

Every behavior-affecting change creates a new candidate version:

- use a **major** version for incompatible input/output, applicability, or
  safety semantics;
- use a **minor** version for backward-compatible additive fields or
  conservative branches; and
- use a **patch** version for compatible defects, wording, validation, or
  ordering corrections.

Patch changes still require focused regression tests and refreshed golden
evidence when output changes. A promoted definition is never edited in place.

Manifest and receipt schemas are versioned separately from a skill. Runtime v1
accepts only `verdant-skill-manifest.v1` and emits only
`verdant-skill-run-receipt.v1`; an unsupported manifest schema blocks
resolution. Supporting a future manifest or receipt schema must not silently
upgrade an existing skill run.

## Rollback policy

Rollback is registry-first:

1. remove or disable resolution of the exact faulty identifier-version pair in
   source;
2. verify that new requests fail closed or resolve only an explicitly selected
   previously promoted version;
3. preserve the faulty version's manifest, fixtures, and commit history for
   audit;
4. run registry, runtime, policy, and affected golden tests; and
5. document the rollback reason and replacement plan.

Rollback MUST NOT:

- mutate a returned historical envelope;
- alias a faulty version to different code;
- make an implicit downgrade through `latest`;
- weaken policy to keep a skill available; or
- add a database, model, device, or Action Queue side path.

If safe resolution cannot be proven, the skill remains unavailable. Safe
unavailability is preferable to uncertain advice.

## V1 hard exclusions

Promotion under this policy cannot authorize:

- marketplace UI or install flows;
- arbitrary third-party packages, downloaded definitions, or dynamic code;
- a skill-run schema migration or new persistence path;
- hardware or device control;
- direct Action Queue writes or status changes;
- background automation;
- live model integration; or
- bypasses around authentication, RLS, entitlements, or grower approval.

Those are separate future phases. Each would require an explicit product
decision, threat model, architecture contract, authorization design, focused
runtime tests, and a new promotion policy. They remain out of scope even when
all v1 engine evaluations are green.
