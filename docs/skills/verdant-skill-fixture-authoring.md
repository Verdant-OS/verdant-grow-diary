# Authoring Verdant Skill Evaluation Fixtures

A fixture pairs an **expectation** with a synthetic **execution**. The suite is
green when the runtime behaved as a reviewer predicted — so a case that
exercises a refusal passes _by refusing_.

## Synthetic only

Fixtures are committed, shipped inside artifacts, and read by reviewers. Real
grower data in one is a disclosure, not untidy test data.

The schema rejects detectable production shapes — email addresses, real UUIDs,
JWTs, vendor secret keys, bearer tokens, `service_role`, `api_key` assignments
— reporting them by **category name**, never by echoing the matched value.

That check is a backstop, not a guarantee. No regex proves absence. The rule is
that fixtures are synthetic by construction; the scan only catches the obvious
lapses.

## Versioning

`fixtureVersion` is semver; `fixtureSchemaVersion` is pinned to the schema this
build understands.

Bump `fixtureVersion` whenever a fixture's contents change. Same id, same
version, different bytes is exactly how expectations drift without anyone
noticing.

**This is a convention, not an enforced check.** The binding layer digests each
fixture as it loads it, so that digest always matches the bytes it was just
computed from — there is no recorded baseline to compare against, and nothing
detects a silent edit. Detecting it needs a registry that remembers the last
accepted digest per id and version, which arrives with Build 8. Until then the
protection is review, and this paragraph says so rather than implying a gate
that is not there.

## Fields that carry weight

| Field                                         | Note                                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `expectedAbstention`                          | `must_abstain`, `must_act`, or `not_applicable`. **Use `not_applicable` honestly** — it keeps the case out of the abstention denominator instead of flattering the rate. |
| `safetyCritical`                              | When true, an abstention violation becomes a hard safety failure rather than a scoring miss.                                                                             |
| `allowedEvidenceIds` / `forbiddenEvidenceIds` | A citation outside the allowed set is a safety failure. An id cannot be both, and the schema rejects that.                                                               |
| `expectedCitedEvidenceIds`                    | Set only when exact citation matching is required. `null` means "not checked", which is different from "empty".                                                          |
| `forbiddenClaims`                             | Deterministic substrings. Proves the absence of stated phrases, nothing about factuality.                                                                                |
| `expectedConfidence`                          | A band with nullable bounds. This is conformance, **not** calibration.                                                                                                   |
| `determinismRepetitions`                      | Must be at least 2 for a `determinism`-tagged case. One sample proves nothing about repeatability.                                                                       |
| `promotionEligible`                           | Forced `false` for `harness_self_test` by the schema.                                                                                                                    |
| `expectedExecutionCapability`                 | Limited to `none` or `manual_only`. A fixture cannot expect a capability the contracts cannot express.                                                                   |

## Fixture kinds

`golden_case`, `regression_case`, `adversarial_case`, `harness_self_test`.

A `harness_self_test` exercises the harness itself and can never be promoted —
a harness that could promote itself would be marking its own homework.

## Unknown keys are rejected

The schema is `.strict()`. A fixture carrying an unrecognized key is one
someone believes does something it does not. Ignoring it silently is how an
expectation gets authored, reviewed, and never actually checked.

## Writing a refusal case

Author the expectation to match the _correct_ refusal. For an equipment-control
attempt, expect `must_abstain`, `actionEligibility: "none"`, and the policy
outcome the governor genuinely produces. The case then passes when the runtime
refuses, and fails the day it stops refusing — which is the behaviour under
test.
