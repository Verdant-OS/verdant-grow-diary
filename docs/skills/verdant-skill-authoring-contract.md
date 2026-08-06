# Verdant Skill Authoring Contract — Runtime v1

**Status:** Normative for Verdant Skill Runtime v1.

Verdant skills are trusted, first-party, deterministic engine definitions. A
skill receives an already-authorized, bounded context value, evaluates whether
that context is sufficient, and returns a typed advisory result. A skill is not
a script, plug-in, model prompt, database service, or automation hook.

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe requirements
for a v1 skill.

## V1 scope

Runtime v1 provides:

- a typed manifest for stable skill identity and versioning;
- a closed registry of statically imported first-party definitions;
- explicit input, applicability, policy, execution, output, and outcome
  boundaries;
- pure execution over caller-supplied context;
- injected time for deterministic results;
- versioned, in-memory run envelopes; and
- focused unit tests plus data-only golden fixtures.

Runtime v1 does not provide:

- marketplace or skill-management UI;
- arbitrary third-party code;
- dynamic module loading, downloaded code, `eval`, or user-authored scripts;
- database persistence for skill runs or a schema migration;
- network, Supabase, file-system, browser-storage, or environment access from a
  skill;
- live model or AI-provider calls;
- hardware or device control;
- webhook, alert, or command execution;
- Action Queue inserts, updates, status transitions, or direct writes; or
- a path around Verdant authentication, RLS, entitlement, or approval
  boundaries.

The v1 runtime returns a versioned run envelope to its caller. Persisting that
envelope is outside this contract. No new table is required merely to prove the
engine contract.

## Module responsibilities

| Concern         | Runtime v1 module                           | Responsibility                                                                            |
| --------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Manifest        | `src/lib/verdantSkillManifest.ts`           | Declare and validate stable, serializable skill metadata.                                 |
| Applicability   | `src/lib/verdantSkillApplicabilityRules.ts` | Represent a deterministic yes/no decision, reason codes, and missing context.             |
| Registry        | `src/lib/verdantSkillRegistry.ts`           | Resolve only statically registered first-party definitions by exact identity and version. |
| Runtime         | `src/lib/verdantSkillRuntime.ts`            | Enforce the run order and return a typed outcome envelope.                                |
| Policy          | `src/lib/verdantSkillPolicyRules.ts`        | Fail closed when a definition requests an unknown or forbidden capability.                |
| Outcome         | `src/lib/verdantSkillOutcomeRules.ts`       | Normalize successful and non-successful run results without inventing evidence.           |
| Reference skill | `src/lib/plantEventReviewSkill.ts`          | Demonstrate a conservative, evidence-aware, read-only skill.                              |

These layers have one-way dependencies. Domain skills MAY depend on shared
manifest, applicability, policy, and outcome types. Shared runtime modules MUST
NOT import a domain skill. The registry is the composition root that imports
approved definitions.

## Trusted definition contract

A skill definition consists of four parts:

1. an immutable manifest;
2. a pure applicability evaluator; and
3. a pure executor that returns a handler result; and
4. a pure output validator that reconstructs the declared fixed-key output.

Definitions MUST be authored in this repository, reviewed under the promotion
policy, and imported statically by the closed registry. A manifest is metadata;
it cannot grant trust to its own implementation. Adding a manifest to a payload
or fixture MUST NOT make code executable or make a skill registered.

The definition MUST NOT expose callbacks supplied by a user, module paths,
URLs, source text, bytecode, prompts to execute, or other code-loading
instructions.

## Manifest contract

Every manifest MUST declare:

- the exact `verdant-skill-manifest.v1` manifest schema;
- a stable machine identifier;
- an exact semantic version;
- a concise human-readable name and purpose;
- explicit input and output contract kinds ending in `.v1`;
- explicit-only activation;
- no side effects;
- the fixed v1 capability;
- every fixed v1 policy tag; and
- the versioned golden fixture-set identifier.

Manifest values MUST be static, plain, serializable data. `schemaVersion` MUST
be exactly `verdant-skill-manifest.v1`. The stable identifier MUST use
lowercase ASCII letters, numbers, or hyphens and MUST NOT be reused for a
different skill. The exact manifest keys are `schemaVersion`, `id`, `version`,
`title`, `description`, `inputKind`, `outputKind`, `activation`, `sideEffects`,
`capabilities`, `policyTags`, and `fixtureSet`; extra keys are invalid. A run
MUST resolve an exact skill identifier and version; production execution MUST
NOT depend on a floating `latest` version.

For v1, `activation` MUST be `explicit`, `sideEffects` MUST be `none`, and
`capabilities` MUST be exactly `["read_supplied_context"]`. The policy tags MUST
be exactly:

- `advisory_only`;
- `engine_only`;
- `no_action_queue_write`;
- `no_alert_write`;
- `no_arbitrary_code`;
- `no_device_control`;
- `no_hardware_control`;
- `no_model`;
- `no_network`; and
- `no_persistence`.

The capability declaration is an upper bound, not permission by itself.
Runtime policy validates it against the fixed v1 allowlist. An unknown,
missing, extra, or reordered capability or policy tag fails closed. Reading
supplied context does not authorize I/O.

The v1 boundary is explicit at both ends:
`verdant-skill-manifest.v1` identifies the accepted manifest schema and
`verdant-skill-run-receipt.v1` identifies the emitted receipt schema.
`inputKind` and `outputKind` version the domain contracts separately.
Ownership belongs in repository review and CODEOWNERS metadata rather than
mutable runtime manifest data.

Promotion state is decided by repository review and registry composition. A
manifest MUST NOT be able to mark its own implementation as trusted or
promoted.

## Input contract

A skill input MUST be a bounded, typed, JSON-compatible value. It MAY include
authorized plant, grow, tent, diary, photo-metadata, or sensor context when the
calling surface is already permitted to read that context.

The runtime request is an exact fixed-key object containing `runId`,
`executionAt`, `skillId`, `version`, and `input`. Missing or extra request keys
fail closed before registry resolution.

The caller owns authorization and data collection. The runtime and skill MUST:

- treat every supplied field as untrusted until validated;
- reject or explicitly ignore unknown, malformed, or out-of-range values;
- preserve source and observation timestamps when supplied;
- keep `manual`, `csv`, `demo`, `stale`, `invalid`, and unknown provenance
  distinct;
- never upgrade missing or uncertain provenance to `live`;
- never classify invalid, stale, demo, or unknown telemetry as healthy;
- never infer missing identifiers, readings, or observations;
- use explicit, documented size limits for arrays and text; and
- avoid accepting secrets, access tokens, signed URLs, raw provider errors, or
  unrestricted raw payloads.

Functions, class instances, promises, streams, database clients, and service
objects are not valid skill input. A skill MUST NOT fetch additional context.

The shared v1 inspector enforces these ceilings before a domain skill runs:

| Boundary                   | V1 maximum |
| -------------------------- | ---------- |
| Nested depth               | 8          |
| Total inspected nodes      | 500        |
| Items in one array         | 100        |
| Keys in one object         | 80         |
| One string                 | 4,000      |
| All strings in one input   | 50,000     |
| Applicability reason codes | 40         |

Cycles, symbol keys, accessors, non-plain prototypes, non-finite numbers, and
sensitive key names fail closed. A domain skill MAY impose smaller limits but
MUST NOT expand these runtime ceilings.

## Injected execution context

Time is an input. The runtime MUST receive a valid run timestamp from its
caller and pass that timestamp to applicability and execution. The timestamp
MUST be a canonical UTC ISO instant whose text round-trips unchanged through
`Date.toISOString()`. A skill MUST NOT read `Date.now()`, construct an implicit
current time, read a system clock, or substitute a current time when the
supplied value is missing or invalid.

The runtime MUST NOT generate random identifiers. The caller MUST supply a
bounded `runId` for correlation. It is 1–128 characters, begins with an ASCII
letter or number, and then permits only ASCII letters, numbers, `.`, `_`, `:`,
or `-`. The domain skill result MUST not depend on it. A receipt contains
`runId: null` only when the request failed before a valid value could be
preserved.

For the same registered definition, exact version, normalized input, injected
timestamp, and caller-supplied `runId`, applicability, output, reason codes,
and receipt MUST be deeply equal.

Deterministic implementations also require:

- stable sorting with explicit tie-breakers;
- no `Math.random`, locale-dependent ordering, or process-dependent behavior;
- explicit boundary semantics for time windows and numeric ranges;
- centralized rounding and unit conversion rules; and
- sorted, de-duplicated reason and limitation lists.

## Applicability contract

Applicability answers only whether the declared skill can responsibly evaluate
the supplied context. It MUST NOT execute the skill, fetch data, write data, or
silently fill gaps.

An applicability decision MUST use one of these fixed shapes:

- `applicable`, with immutable normalized input and stable reason codes;
- `not_applicable`, with stable reason codes that identify missing or
  unsupported context; or
- `invalid`, with stable issue codes for malformed or unsafe input.

Reason and issue codes MUST be sorted and de-duplicated. Applicability results
do not carry free-form guidance.

Missing structurally required context, invalid timestamps, or unsafe or
ambiguous required scope MUST produce a not-applicable result. Not applicable
is an expected outcome, not an exception and not a low-confidence success.

A skill whose declared purpose is evidence-gap review MAY remain applicable
when optional evidence is absent, an event type is bounded but not recognized,
or optional sensor evidence does not match the event scope. In that case it
MUST return `insufficient_evidence` with fixed limitation codes and data-to-log
codes; it MUST NOT turn the gap into diagnosis, treatment advice, completed
guidance, or higher confidence. The manifest, fixture set, and promotion
evidence must make this distinction explicit.

Applicability MUST be tested independently from execution. A domain executor
MUST NOT receive control when applicability is false.

## Policy contract

Policy is a runtime safety boundary. It validates the resolved, trusted
definition and its declared effects before domain execution.

V1 policy MAY allow only:

- reading the supplied in-memory context; and
- returning a typed, read-only advisory result.

V1 policy MUST deny:

- database reads or writes from the skill;
- network or provider calls;
- arbitrary or third-party code execution;
- file-system, browser-storage, environment, or secret access;
- live model calls;
- hardware, relay, irrigation, dosing, lighting, HVAC, or other device
  commands;
- webhook or background-job dispatch;
- alert mutation;
- Action Queue creation, mutation, approval, execution, or status changes; and
- any unrecognized capability or effect.

Policy denial is a typed, reason-coded outcome. It MUST happen before the skill
executor runs. Skills MUST NOT catch, weaken, or override a policy decision.

## Output contract

A successful skill output MUST be plain, typed, serializable data defined by
that skill's output contract. It SHOULD distinguish:

- observations supported by supplied evidence;
- limitations and missing information;
- confidence or evidence strength when the domain requires it; and
- conservative next information to log or review.

Output MUST NOT:

- claim certainty or causation from weak context;
- fabricate a reading, observation, source, timestamp, or plant association;
- present demo, stale, invalid, or unknown data as live or healthy;
- contain executable payloads, device commands, SQL, webhooks, or code;
- mutate the input;
- claim that an Action Queue item, alert, diary entry, or other row was
  created; or
- hide a write or external side effect behind advisory language.

A skill MAY return cautious text that helps a grower decide what to inspect or
log next. Verdant suggests; the grower decides and acts.

## Outcome and run-envelope contract

Every invocation returns a normalized, immutable
`verdant-skill-run-receipt.v1` receipt. At minimum, the receipt preserves:

- exact skill identifier and version;
- receipt schema;
- the caller-supplied `runId`, or `null` only for an invalid request;
- the injected run timestamp;
- normalized outcome status;
- stable reason codes; and
- validated output only after successful execution.

The fixed v1 status literals are:

- `unknown_skill`: no exact `id@version` entry exists in the closed registry;
- `invalid_manifest`: the registered definition's manifest did not satisfy the
  exact v1 contract;
- `not_applicable`: supplied context was invalid, insufficient, or outside the
  skill's declared scope;
- `policy_blocked`: a pre-execution declaration or post-execution result
  crossed a v1 policy fence;
- `completed`: the handler returned `completed` and the post-policy and
  fixed-key output validators accepted its outcome;
- `insufficient_evidence`: the handler ran but responsibly reported that the
  normalized evidence could not support a completed review; and
- `skill_error`: the trusted assessment, handler result, execution, or output
  contract failed safely.

A non-completed outcome MUST NOT carry a result that could be mistaken for
successful advice. `insufficient_evidence` MAY carry only the validated,
cautious domain outcome allowed by its output contract.

The receipt is privacy-minimal. It MUST NOT copy the raw or normalized input,
thrown error, stack trace, provider detail, or other operational metadata.

Expected validation and applicability failures SHOULD be represented as typed
outcomes rather than thrown exceptions. Unexpected exceptions MUST be caught at
the runtime boundary and reduced to a stable, non-sensitive failure code. A run
envelope MUST NOT expose stack traces, environment details, provider errors, or
secrets.

## Runtime order

The runtime MUST enforce this order:

1. validate the run request and injected timestamp;
2. resolve an exact definition from the closed registry;
3. validate manifest identity, version, and contract compatibility;
4. evaluate pre-execution v1 policy;
5. inspect the bounded raw input;
6. evaluate applicability and reconstruct fixed-key normalized input;
7. execute the trusted pure definition only when allowed and applicable;
8. validate the handler-result shape;
9. evaluate post-execution policy against the raw outcome;
10. reconstruct and validate the fixed-key domain output; and
11. inspect the validated output against the bounded data rules; and
12. return the frozen, versioned receipt.

No later step may run after an earlier blocking decision. Tests MUST prove that
the executor is not called for invalid, unregistered, policy-denied, or
not-applicable runs.

## Closed registry contract

The v1 registry is a source-controlled allowlist. It MUST:

- statically import trusted first-party definitions;
- resolve by exact identifier and version;
- reject duplicate identifier-version pairs;
- reject incompatible manifest schema versions;
- expose immutable views of registered definitions; and
- exclude draft, retired, malformed, or policy-incompatible definitions from
  production resolution.

It MUST NOT accept registrations from request payloads, JSON fixtures, remote
URLs, package names, database rows, local storage, feature flags, or dynamic
imports. Golden fixtures are test data and can never add registry entries.

## Versioning and compatibility

Skill versions use semantic versioning:

- **major**: incompatible input/output changes, changed applicability meaning,
  removed reason codes, or materially different safety semantics;
- **minor**: backward-compatible optional fields, additive reason codes, or a
  new conservative branch that preserves the prior contract; and
- **patch**: a compatible defect, wording, ordering, or validation correction.

Every promoted version is immutable. Any change that can alter a run envelope
requires a new skill version and refreshed golden evidence, including a patch.
Do not edit a promoted version in place.

Manifest and receipt schema compatibility are separate from the skill version.
A manifest whose `schemaVersion` is unsupported MUST fail closed. Newer runtime
code MAY continue to resolve an older promoted skill version only when
`verdant-skill-manifest.v1` remains supported, its receipt semantics remain
compatible, and its regression fixtures remain green.

## Golden fixture contract

Golden fixtures are data, never code. Each case MUST identify:

- a stable case identifier;
- exact skill identifier and version;
- injected run timestamp;
- complete supplied input; and
- the expected normalized outcome or validated output.

At minimum, a skill's golden set MUST cover:

- representative applicable input;
- missing required context;
- malformed or invalid context;
- source/provenance uncertainty when relevant;
- boundary timestamps or numeric limits;
- shuffled equivalent input to prove stable ordering;
- repeated identical execution to prove determinism; and
- an adversarial case that proves the skill cannot cross a v1 safety fence.

Fixture changes require review. A failing fixture is evidence of a regression
or intentional version change; it MUST NOT be overwritten solely to make a
test green. Fixtures MUST NOT contain personal data, credentials, tokens,
signed URLs, or production raw payloads.

## Required tests

Every skill MUST add focused tests for:

1. manifest validity and version compatibility;
2. registry resolution and duplicate rejection;
3. applicable and not-applicable decisions;
4. null, malformed, boundary, and oversized inputs;
5. policy allow and fail-closed deny paths;
6. proof that blocked executors are never called;
7. successful output validation;
8. safe handling of execution and output-validation failures;
9. deterministic repeated execution and stable ordering;
10. golden cases; and
11. relevant Verdant safety invariants.

Test reports MUST state exact pass/fail counts. Focused tests do not substitute
for type-checking and the relevant repository safety gates.

## Author review checklist

Before requesting promotion, the author MUST verify:

- [ ] The skill solves one bounded grower problem.
- [ ] The manifest has `schemaVersion: "verdant-skill-manifest.v1"`, a stable
      identifier, and an exact skill version.
- [ ] Repository review and CODEOWNERS metadata name the responsible owner.
- [ ] Input and output are typed, bounded, serializable, and null-safe.
- [ ] The caller supplies all context; the skill performs no I/O.
- [ ] Time is injected and invalid time fails closed.
- [ ] Applicability explains missing or invalid context without guessing.
- [ ] Policy capabilities are read-only and fully allowlisted.
- [ ] Sorting, tie-breakers, rounding, and unit rules are deterministic.
- [ ] Weak evidence produces cautious limitations, not certainty.
- [ ] Unknown or bad telemetry is never presented as healthy.
- [ ] No database, schema, RLS, Edge Function, model, hardware, alert, or
      Action Queue write was added.
- [ ] Golden fixtures cover success, insufficiency, invalidity, ordering,
      determinism, and safety.
- [ ] Focused tests, type-check, lint, and relevant safety scans report their
      exact results.
- [ ] The version, owner, rollback, and retirement path are documented.

## V1 non-goals

Runtime v1 intentionally does not answer how skills are installed, sold,
downloaded, scheduled, persisted, invoked by a live model, connected to
hardware, or allowed to mutate Verdant. Those require separate threat models,
data contracts, authorization rules, runtime isolation, and explicit approval
after v1 contracts and evaluations are green.
