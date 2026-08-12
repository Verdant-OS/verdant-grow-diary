# Verdant Skill Promotion Policy

## Two axes, kept apart

```
Manifest lifecycle      = what the registered skill DECLARES itself to be
Evaluation progression  = what evidence the harness has VERIFIED
```

These are different facts about different objects, and they do not share a
vocabulary.

Build 4's `SKILL_LIFECYCLE_STATES` is a field inside a strict, version-pinned
manifest schema. Widening it to carry `golden_cases_passed` would be both a
breaking contract change and a category error: a golden case passing is a
property of a **report**, not something a manifest can declare about itself.

`PROGRESSION_TO_MANIFEST_LIFECYCLE` therefore maps the gate states —
`schema_valid`, `static_safety_passed`, `golden_cases_passed`,
`expert_reviewed` — to **`null`**. They authorize no manifest transition at
all, which is the honest answer for evidence that is not yet a release
decision.

## Why Build 7 does not mutate promotion state

The permitted flow is:

```
evaluation state -> eligibility decision -> allowed manifest transition
```

and never:

```
evaluation state -> silently rewritten manifest lifecycle
```

If evaluation could rewrite a manifest's lifecycle, a green run would ship a
skill on its own, and the review trail would show a status with no decision
behind it.

The harness produces evidence and an eligibility decision. An explicit,
separate promotion operation remains the only thing that may change registry
state. `verdantSkillPromotionRules` performs no writes, reads no registry, and
a test asserts it imports neither Supabase nor the registry builders.

## Gates

| Gate                        | Meaning                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `schema_valid`              | Every case's output satisfied the run contract.                       |
| `static_safety_passed`      | No hard safety failure.                                               |
| `golden_cases_passed`       | A green report over a non-empty case set.                             |
| `green_evaluation`          | Overall status is `pass`.                                             |
| `no_hard_safety_failures`   | Zero safety-critical failures.                                        |
| `current_bindings`          | Manifest, policy and evidence digests match what is in force **now**. |
| `expert_review_attested`    | A human recorded a review.                                            |
| `internal_sandbox_attested` | A human recorded a sandbox soak.                                      |
| `rollback_target`           | A version to fall back to.                                            |

### Limited beta requires all of them

`limited_beta` is the first state a real grower can be exposed to, so it
requires schema validity, static safety, golden cases, a green evaluation,
zero hard safety failures, current bindings, expert review, an internal
sandbox soak, and a rollback target.

**No skill reaches limited beta without a green evaluation report.**

## Manual attestations are never fabricated

Expert review and sandbox soak are human acts. The harness can observe whether
someone recorded them; it never infers one, never defaults one, and never
creates one. An absent attestation blocks.

## Current bindings, not merely consistent ones

A report can be perfectly self-consistent and still describe a manifest that
has since been edited. Promotion compares the report's bindings against the
digests **in force at decision time**, so a stale-but-valid report cannot
carry a skill forward.

## Withdrawal needs no evidence

`paused`, `deprecated`, `withdrawn` and `superseded` are always permitted, with
no gates and no attestations. Requiring a green report before pausing a
misbehaving skill would be perverse.

## The self-test can never be promoted

A `harness_self_test` fixture in the case set, or a report whose target is
`harness-self-test`, blocks promotion outright. It proves the harness works; it
is never evidence about a skill.

## Rollback

Every artifact is version-scoped under
`artifacts/skills/<skill-id>/<skill-version>/`, and the decision records its
`rollbackTarget`. Build 7 adds no production runtime integration and no
persistence, so reverting the harness cannot affect Builds 1-6.
