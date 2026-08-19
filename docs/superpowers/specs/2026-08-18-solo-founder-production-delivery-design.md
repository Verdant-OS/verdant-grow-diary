# Solo-Founder Production Delivery Design

**Date:** 2026-08-18

**Status:** Approved design

**Branch:** `codex/solo-founder-production-delivery`

**Base:** `3f2bfe2dbc139158c4ade35f7124f4e814803163`

**Production project:** `knkwiiywfkbqznbxwqfh`

## Executive summary

Verdant currently documents a two-person production-migration ceremony that the
project cannot satisfy: the repository has one human operator, who is also its
founder. This design replaces that unavailable social control for two urgent
repair workflows with an explicit, machine-verifiable solo-founder control.

The founder may dispatch and review their own protected run, but a run may reach
the database only when all of the following are true:

1. the dispatcher, triggering actor, and environment approver are the committed
   founder GitHub identity;
2. the founder entered an exact, non-default authorization statement;
3. GitHub reports the production environment's expected one-reviewer,
   self-review-enabled, no-admin-bypass configuration;
4. GitHub reports one unambiguous approval of the current run for the exact
   production environment by that founder;
5. APPLY is a fresh workflow dispatch made at least 15 minutes and no more than
   24 hours after its authenticated PREFLIGHT completed;
6. APPLY pins the exact reviewed PREFLIGHT run, attempt, and artifact digest;
7. all existing branch, SHA, project, TLS, state-digest, concurrency, and
   postflight checks still pass.

This is self-review, not independent review. The evidence proves identity,
intent, provenance, elapsed review time, and final state; it does not claim that
a second person reviewed the change.

## Scope

The first solo-founder delivery version applies only to:

- Signup Acquisition forward repair
- Quick Log manual-delegate forward repair

The change includes their GitHub workflows, operational runners, PREFLIGHT
artifact verifiers, focused tests, and operator runbooks. A dedicated
`verdant-production-solo-founder` GitHub environment isolates this authorization
model from the four other production writers. A small shared authorization
verifier may be added under `scripts/lib` or `scripts` so both workflows enforce
the same contract.

Explicitly excluded:

- SQL or migration-body changes
- application or UI changes
- schema, RLS, auth, or edge-function changes
- automatic production dispatch
- a fresh Verdant account or browser E2E run
- generalized two-dispatch conversion of the other four production writers
- changing the protection rules on the existing `verdant-production` environment
- an external signing service, GitHub App, or KMS approval service
- a new shared PostgreSQL advisory-lock protocol across all six writers

The existing shared workflow mutex remains unchanged:

```yaml
concurrency:
  group: verdant-production-migration-writer
  cancel-in-progress: false
  queue: max
```

## Ground truth and motivation

At design time, the existing shared environment is not suitable as the target
for this narrow change:

- `verdant-production` has the canonical branch policy but no required reviewer;
- Prevent self-review is not configured;
- administrator bypass is allowed;
- `cheekhimself` is the repository's only human collaborator and has GitHub user
  ID `72639960`;
- neither target repair workflow has a historical workflow run or PREFLIGHT
  artifact that needs backward compatibility;
- the Quick Log flow already pins the prior run attempt and artifact digest;
- the Signup flow pins a prior run ID but not the reviewed attempt and digest;
- both verifiers accept an APPLY created immediately after PREFLIGHT completion;
- neither flow currently authenticates the dispatcher, rerun initiator, or
  environment approver.

Because `verdant-production` is referenced by all six migration writers,
changing its self-review policy would change authorization semantics for four
workflows outside this slice. The selected design therefore leaves it untouched
and introduces a separate environment only for the two hardened workflows.

GitHub supports a required reviewer who is also the dispatcher when Prevent
self-review is disabled. GitHub also exposes read-only endpoints for the
environment contract and a workflow run's review history. Both endpoints require
only Actions read permission, which these protected workflows can grant without
write authority:

- <https://docs.github.com/en/rest/deployments/environments#get-an-environment>
- <https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run>

## Considered approaches

### A. Environment self-approval only

Configure the founder as the reviewer and disable Prevent self-review, with no
additional workflow changes.

This is simple but insufficient. It does not bind the prior receipt to a fixed
review interval, does not prevent administrator bypass from silently replacing
approval, and does not close Signup's run-attempt substitution gap.

### B. Founder-bound two-dispatch delivery

Keep GitHub environment approval, then authenticate the founder, environment
configuration, review record, review interval, and prior artifact in code before
database access.

This is the selected approach. It is materially stronger than the live
configuration while remaining understandable and operable by one founder.

### C. External signed approval service

Require a GitHub App or KMS-backed service to issue a signed approval receipt.

This is stronger against account compromise but adds infrastructure and a second
trust system that is disproportionate for the present solo project.

## Governing constants

These values are committed, versioned operational policy—not workflow inputs:

| Constant                             | Value                                                     |
| ------------------------------------ | --------------------------------------------------------- |
| Delivery mode                        | `solo_founder_self_review_v1`                             |
| Founder GitHub user ID               | `72639960`                                                |
| Founder login at implementation time | `cheekhimself`                                            |
| Production environment               | `verdant-production-solo-founder`                         |
| Canonical deployment branch          | `verdant-grow-diary`                                      |
| Minimum review interval              | 900 seconds                                               |
| Maximum review interval              | 86,400 seconds                                            |
| Exact acknowledgement                | `I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN` |

The numeric GitHub user ID is authoritative. The login is recorded for readable
evidence and must remain consistent within one PREFLIGHT/APPLY cycle. A username
change therefore requires a code update or, at minimum, a fresh PREFLIGHT rather
than silently reusing an old receipt.

The caller cannot choose the founder ID, environment, minimum delay, maximum age,
or delivery mode.

## Environment contract

Before either target workflow may be used,
`verdant-production-solo-founder` must be explicitly created and configured as
follows:

1. exactly one required-reviewer rule;
2. exactly one reviewer, a GitHub User with ID `72639960`;
3. Prevent self-review OFF;
4. Allow administrators to bypass protection rules OFF;
5. a custom branch policy is restricted to
   `verdant-grow-diary`;
6. both production database secrets are available in the environment scope:
   `SUPABASE_DB_URL` and `SUPABASE_DB_CA_CERT_B64`.

Only the Signup Acquisition and Quick Log manual-delegate workflows switch to
this environment. The existing `verdant-production` environment and the other
four writer workflows remain byte-for-byte outside this authorization change.
All six workflows continue to share the same workflow concurrency group, so
isolating the reviewer policy does not permit overlapping sanctioned writers.

The new environment must be configured before either workflow is dispatched.
Relying on GitHub to auto-create an unprotected environment is forbidden. The
runtime verifier makes an absent or default-created environment fail before any
database access.

Each target workflow must query the environment through GitHub's read-only API
after the environment gate opens and before any database command. It must also
query the deployment branch-policy collection with `per_page=100` and require an
unpaginated, non-overflowing response containing exactly one policy of type
`branch` named `verdant-grow-diary`. The environment response alone proves only
that custom policies are enabled; it does not prove the allowed pattern.

Missing fields, extra reviewers, a team reviewer, Prevent self-review ON,
administrator bypass, pagination ambiguity, overflow, or an unexpected branch
policy fails closed.

The environment's missing or unproven CA secret remains a hard dispatch blocker
until it is verified or added. This implementation must not weaken the existing
TLS `verify-full` guard.

## Dispatch contract

Both PREFLIGHT and APPLY add one required, no-default string input:

```text
solo_founder_acknowledgement
```

Its value must equal the governing acknowledgement byte-for-byte. Whitespace,
case changes, omission, and any alternate phrase fail before environment access
or database access.

Both operations must also require:

- workflow event `workflow_dispatch`;
- current workflow run attempt exactly `1`;
- current run `actor.id` exactly `72639960`;
- current run `triggering_actor.id` exactly `72639960`;
- actor and triggering-actor login values equal within the run;
- the existing exact branch, expected-head SHA, project-reference, and operation
  contracts.

Rerunning a protected workflow is not allowed because GitHub's approval history
is run-scoped rather than attempt-scoped. Recovery requires a fresh dispatch and
a fresh environment approval. PREFLIGHT artifact consumers continue to pin the
specific prior attempt.

## Approval-history contract

After the GitHub environment gate opens, a shared verifier calls:

```text
GET /repos/{owner}/{repo}/actions/runs/{current_run_id}/approvals
```

The response must contain exactly one unambiguous review relevant to this
workflow run, with:

- `state` exactly `approved`;
- exactly one reviewed environment;
- environment name exactly `verdant-production-solo-founder`;
- approving `user.id` exactly `72639960`;
- approving user login equal to the current run actor login.

An empty history, rejection followed by approval, duplicate approval, approval
for another environment, approval by another user, malformed response, API
failure, or administrator-bypass path fails closed. This check runs before any
database command or secret-derived connection is used.

## PREFLIGHT evidence contract

Each immutable PREFLIGHT receipt and audit record adds self-contained,
non-secret authorization evidence:

- `delivery_mode: "solo_founder_self_review_v1"`;
- founder GitHub user ID;
- founder login;
- production solo-founder environment name;
- acknowledgement verified flag;
- environment contract verified flag;
- environment approval verified flag;
- minimum review seconds `900`;
- maximum review seconds `86400`.

The exact receipt member list remains closed. Missing fields, extra fields,
wrong values, type mismatches, or tampering fail receipt validation.

No GitHub token, database URL, CA contents, authorization header, approval
comment, secret value, or raw API response is written to evidence or logs.

## APPLY provenance and review window

APPLY authenticates both the prior PREFLIGHT and the current protected run.

For both target flows, APPLY must explicitly pin:

- prior PREFLIGHT run ID;
- prior PREFLIGHT run attempt;
- lowercase SHA-256 digest of the exact reviewed artifact archive;
- the same expected 40-character deployment SHA;
- the same production project reference;
- the workflow's existing exact APPLY confirmation phrase;
- the exact solo-founder acknowledgement.

Signup is upgraded to accept and verify the prior run attempt and artifact digest
instead of selecting a later rerun or artifact implicitly.

The fixed review-window calculation uses authenticated GitHub API timestamps:

```text
review_age = current_apply_run.created_at - prior_preflight_run.updated_at
```

The verifier accepts only:

```text
900 seconds <= review_age <= 86,400 seconds
```

Using APPLY `created_at` is intentional. An APPLY dispatched immediately after
PREFLIGHT must fail even if it sits in concurrency or environment queues for 15
minutes. Waiting in a queue is not a substitute for making the APPLY decision
after the cooling interval.

Missing or invalid timestamps, a negative interval, 899.999 seconds, or more
than 24 hours fails closed. Exactly 15 minutes and exactly 24 hours are accepted.
An expired interval requires a fresh PREFLIGHT.

## Database boundary

Solo-founder authorization is an additional prerequisite, not a replacement for
the existing database safeguards. The runners retain:

- exact migration filename, version, byte size, and SHA-256 binding;
- production project-ref binding;
- TLS root pin and `sslmode=verify-full`;
- no URL rewriting or SSL downgrade;
- read-only PREFLIGHT transaction;
- exact schema/catalog state classification;
- branch-head re-resolution immediately before APPLY;
- live state-digest revalidation immediately before the write;
- atomic migration and ledger semantics;
- exact postflight verification;
- immutable sanitized evidence;
- shared six-writer workflow serialization;
- the Quick Log lane's existing active-writer API check.

No device control, application automation, or user-account write is introduced.

## Failure and recovery behavior

All authorization failures use fixed, secret-safe reason codes. Raw GitHub API
bodies and approval comments are never printed.

Examples include:

- `solo_founder_acknowledgement_invalid`
- `solo_founder_actor_invalid`
- `solo_founder_run_attempt_invalid`
- `solo_founder_environment_contract_invalid`
- `solo_founder_approval_invalid`
- `preflight_review_window_too_early`
- `preflight_review_window_expired`
- `preflight_attempt_mismatch`
- `preflight_artifact_digest_mismatch`

Any failure before a database write is recoverable only through the appropriate
fresh dispatch. A failed or ambiguous APPLY must not be rerun in place.

Existing post-write recovery semantics remain authoritative. This design must
not relabel a partial or uncertain database outcome as safe.

## File-level implementation plan

Expected new shared files:

- `scripts/lib/solo-founder-production-authorization.mjs`
- `scripts/verify-solo-founder-production-authorization.mjs`
- `src/test/solo-founder-production-authorization.test.ts`

Expected Signup changes:

- `.github/workflows/apply-signup-acquisition-forward-repair.yml`
- `scripts/apply-signup-acquisition-forward-repair.mjs`
- `scripts/verify-signup-acquisition-preflight-artifact.mjs`
- `docs/signup-attribution-outage-operator-runbook.md`
- `src/test/apply-signup-acquisition-forward-repair.test.ts`
- `src/test/verify-signup-acquisition-preflight-artifact.test.ts`

Expected Quick Log changes:

- `.github/workflows/apply-quicklog-manual-delegate-forward-repair.yml`
- `scripts/apply-quicklog-manual-delegate-forward-repair.mjs`
- `scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs`
- `docs/quicklog-manual-delegate-forward-repair-operator-runbook.md`
- `src/test/apply-quicklog-manual-delegate-forward-repair.test.ts`
- `src/test/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.test.ts`

The exact file list may shrink if existing helpers can safely absorb the shared
logic. It must not expand into migration SQL or application code.

## Test-first acceptance contract

Implementation starts with strict RED tests that prove the current code accepts
unsafe solo-founder cases. GREEN must cover at least:

1. exact founder actor, triggering actor, environment reviewer, and approver;
2. wrong or missing actor ID;
3. actor and triggering-actor mismatch;
4. wrong, missing, team, or extra environment reviewer;
5. Prevent self-review enabled;
6. administrator bypass enabled;
7. empty, duplicate, rejected, wrong-environment, or wrong-user approval history;
8. missing, duplicate, wrong-type, wrong-name, paginated, or overflowing branch
   policy data;
9. protected run attempt greater than one;
10. missing, altered, or whitespace-padded acknowledgement;
11. 14:59.999 review age rejected;
12. exactly 15:00 accepted;
13. exactly 24:00:00 accepted;
14. more than 24 hours rejected;
15. immediate APPLY still rejected after later queue delay;
16. Signup attempt substitution rejected;
17. Signup artifact-digest substitution rejected;
18. tampered receipt mode, actor, environment, or window rejected;
19. raw API values, tokens, comments, URLs, and secrets absent from output;
20. all pre-existing branch, SHA, state, TLS, concurrency, and recovery tests
    remain green;
21. runbooks state plainly that this is founder self-review, not independent
    human review.

Validation must report exact counts for:

```text
Targeted tests:
Full focused delivery suite:
Type-check:
Node syntax:
ESLint:
Prettier:
git diff --check:
Runtime/API simulations:
Skipped:
Introduced failures:
Pre-existing failures:
```

No production PREFLIGHT or APPLY is part of implementation validation.

## Rollout sequence after merge

1. Publish and verify the exact clean build receipt.
2. Create `verdant-production-solo-founder` with the founder as its sole required
   reviewer, Prevent self-review OFF, and administrator bypass OFF. Leave the
   existing `verdant-production` environment unchanged.
3. Configure the canonical branch policy and both environment-scoped secrets on
   the new environment.
4. Confirm all six production writers are idle.
5. Dispatch Signup PREFLIGHT with the exact acknowledgement.
6. Approve the environment gate as the founder.
7. Review the immutable SAFE_TO_APPLY receipt.
8. Wait until at least 15 minutes after PREFLIGHT completion.
9. Dispatch Signup APPLY with the exact run ID, attempt, artifact digest, SHA,
   project ref, acknowledgement, and APPLY phrase; approve it as founder.
10. Repeat the authenticated two-dispatch process for Quick Log.
11. Verify protected APPLY/postflight receipts and live production catalog state.

A fresh Verdant account or browser E2E is outside this implementation and
rollout. It requires a separate explicit authorization after both production
repairs are independently verified.

If either PREFLIGHT reports already applied and independently verified, stop that
lane without APPLY. Any blocked, malformed, expired, or uncertain result requires
repair or a fresh PREFLIGHT; it is never overridden manually.

## Deferred work

- Upgrade the remaining four production writers to the same authenticated
  two-dispatch contract.
- Consider a common PostgreSQL advisory lock taken by every production writer
  if out-of-band database writers become a realistic threat.
- Consider external signed approval only if Verdant gains multiple operators or
  materially higher production risk.

## Safety verdict

This design is suitable for a one-human project because it replaces an
impossible second-person requirement with explicit, auditable controls while
retaining every existing database safety fence. It is not equivalent to
independent review, and neither the implementation nor its runbooks may claim
otherwise.
