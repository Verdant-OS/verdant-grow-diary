# Spec — Bind dispatched production proofs to an expected SHA

**Author:** Claude (specification only; no workflow, test or script is edited by this document)
**Date:** 2026-10-13
**Measured at:** `verdant-grow-diary` `5b16f3243` (every `path:line` below is at that SHA)
**Origin:** the follow-up named in `docs/specs/release-topology-specification.md` §2.9, proposed
on draft PR `#2055` (CodeRabbit finding on `#1944`, posted on head `d765bfb4`)
**Status:** SPEC — ready for an assigned holder. Workflow and test files are scorer-locked
(§7); implementation needs Matthew's scorer unlock and an assigned holder.

Every claim is labeled per the Sentinel evidence discipline: `established fact`,
`source claim`, `practical observation`, `inference`, `uncertainty`, `missing evidence`.

---

## 1. Problem

The go-live checklist (`docs/release/go-live-checklist-after-402.md`, steps 1, 3 and 4)
dispatches four production proofs with `gh workflow run … --ref verdant-grow-diary`. Each
job then measures whatever commit the branch pointed at when it was dispatched, not the
SHA the owner chose and recorded in step 0.1(a):

- The three read-only proofs check out `${{ github.sha }}` and pin
  `E2E_EXPECTED_SHA="$(git rev-parse HEAD)"` (`established fact`:
  `.github/workflows/actions-readonly-proof.yml:86-93`,
  `.github/workflows/settings-account-consent-proof.yml:86-93`,
  `.github/workflows/signed-in-readonly-performance.yml:85-92`).
- The `quicklog-smoke` job does the same (`established fact`:
  `.github/workflows/quicklog-smoke.yml:555-561`).
- None of those four jobs reads a SHA input. `quicklog-smoke.yml` declares `expected_sha`
  (`:65-69`), but only its `one_tent_proof` job uses it (`established fact`).

If the branch advances between the owner's choice and a dispatch, the run waits for and
measures a different build, and its PASS is not evidence for the chosen build
(`inference`). `#2055` closes this with a manual check (branch tip before dispatch,
`headSha` after). This spec replaces that manual check with one the workflow enforces.

## 2. Precedent to copy

The `one_tent_proof` job already does this correctly, before any secret is available
(`established fact`: `.github/workflows/quicklog-smoke.yml:149-181`). It:

1. requires `inputs.expected_sha` to match `^[0-9a-f]{40}$`;
2. requires it to equal `github.sha`;
3. requires `github.actor` to be `cheekhimself`;
4. requires `github.triggering_actor` to be `cheekhimself`;
5. requires `github.run_attempt` to be `1`, so a re-run never counts as the proof;
6. requires `github.ref` to be `refs/heads/verdant-grow-diary`;
7. checks out `inputs.expected_sha` and requires `git rev-parse HEAD` to equal it.

Checks 1-6 are one step, "Verify immutable dispatch identity" (`:150-166`).
`src/test/one-tent-authenticated-proof-workflow.test.ts:216-251` pins that order and the
SHA, actor, triggering-actor and first-attempt assertions (checks 1-5); the ref assertion
(check 6) is pinned separately at `:175` (`established fact`, re-read at `5b16f3243`:
`expect(job).toContain(` with `"$GITHUB_REF" = "${BRANCH_REF}"`). The change below
applies checks 1-6 to the four jobs the checklist dispatches.
Check 7 is replaced by §3.3: once check 2 passes, checking out `github.sha` is checking out
the expected SHA.

The four jobs already require checks 3-6 in their job-level `if:` (`established fact`:
`actions-readonly-proof.yml:59`, `settings-account-consent-proof.yml:59`,
`signed-in-readonly-performance.yml:58`, and `quicklog-smoke.yml`'s `quicklog_smoke` job,
which waives the actor checks only for `schedule`). A failed `if:` skips the job, and a
skipped proof is not a PASS. The step in §3.2 repeats them anyway, as the precedent does,
so the gate before any secret doesn't depend on a separate `if:` that a later edit could
widen.

## 3. The change

### 3.1 Inputs

| Workflow                             | Change                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions-readonly-proof.yml`         | Add `workflow_dispatch.inputs.expected_sha` (`type: string`, `required: true`, no default)                                                                                                                            |
| `settings-account-consent-proof.yml` | Same                                                                                                                                                                                                                  |
| `signed-in-readonly-performance.yml` | Same                                                                                                                                                                                                                  |
| `quicklog-smoke.yml`                 | Keep the existing input and its `required: false` (the `one_tent_proof` contract test pins that, `:221-222`). Reword its description so it covers both modes: required for any dispatch, enforced by the step in §3.2 |

`required: true` is a UI and API hint only. The step in §3.2 is the actual gate, because
an empty value must still fail closed. (`uncertainty`: whether `gh workflow run` or the
REST dispatch rejects a missing required string input was not measured. The design
doesn't depend on it.)

### 3.2 One verification step per job, before any secret

Add a step named exactly **`Verify dispatch SHA`**:

- **Where:** in each of the four jobs, before the first step whose `env` carries a
  secret. The only step allowed before it is a credential-free checkout (§3.4). The first
  secret-bearing step is "Verify production fixture configuration" in the three
  read-only proofs and "Verify required configuration" in `quicklog-smoke`.
- **Env:** `EVENT_NAME: ${{ github.event_name }}`, `INPUT_SHA: ${{ inputs.expected_sha }}`,
  `GITHUB_CONTEXT_SHA: ${{ github.sha }}`, `GITHUB_ACTOR: ${{ github.actor }}`,
  `GITHUB_TRIGGERING_ACTOR: ${{ github.triggering_actor }}`,
  `GITHUB_RUN_ATTEMPT: ${{ github.run_attempt }}`, `GITHUB_REF: ${{ github.ref }}`. No
  secrets.

Rules:

| Event                | `INPUT_SHA`                                         | Result                                                                              |
| -------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `workflow_dispatch`  | 40 lowercase hex, equal to `github.sha`             | PASS                                                                                |
| `workflow_dispatch`  | empty                                               | FAIL: `BLOCKED: expected_sha is required for a dispatched proof`                    |
| `workflow_dispatch`  | not `^[0-9a-f]{40}$` (uppercase, short, whitespace) | FAIL: `BLOCKED: expected_sha must be 40 lowercase hex`                              |
| `workflow_dispatch`  | valid but different from `github.sha`               | FAIL: `BLOCKED: verdant-grow-diary advanced past expected_sha; re-select the build` |
| `push` or `schedule` | any (inputs are not set on these events)            | PASS, no check. The job keeps today's `github.sha` behaviour                        |
| anything else        | any (empty, misspelled or a future event name)      | FAIL: `BLOCKED: unrecognized event <name>`                                          |

On `workflow_dispatch`, the step also fails closed unless `GITHUB_ACTOR` and
`GITHUB_TRIGGERING_ACTOR` are both `cheekhimself`, `GITHUB_RUN_ATTEMPT` is `1` and
`GITHUB_REF` is `refs/heads/verdant-grow-diary` (precedent checks 3-6), each with its own
`BLOCKED:` reason. These run before the SHA rows above, so a re-run or another actor's
dispatch is refused even when its SHA matches. On `push` and `schedule` the job-level `if:`
keeps deciding, unchanged.

The event name decides which rule applies; the input's value never does. Only
`workflow_dispatch`, `push` and `schedule` are recognized; every other value, including an
empty one, fails closed, so widening a job's triggers later can't open the gate by default.
A push run must not become a FAIL because an input is unexpectedly set, and a dispatch must
never fall back to `github.sha`.

### 3.3 Leave the existing pin as it is

Keep the checkout at `${{ github.sha }}` and the existing pin step, including its
`[ "$expected_sha" = "$GITHUB_SHA" ]` assertion. After §3.2 passes on a dispatch,
`github.sha` is the expected SHA, so `E2E_EXPECTED_SHA` already equals the receipt SHA
and `scripts/wait-for-deployed-sha.mjs` waits for exactly that build (`inference`, from
`:86-96` in each read-only proof).

Rejected: checking out `inputs.expected_sha` when it differs from the tip. The workflow
file and its gates would come from the tip while the proof source came from an older
commit. That is a mixed tree no gate has reviewed. Failing closed and re-selecting the
build is simpler and honest.

### 3.4 Where the logic lives

Write the rules as a pure function in a new `scripts/lib/dispatchShaRules.mjs`:
`resolveDispatchSha({ eventName, inputSha, githubSha, actor, triggeringActor, runAttempt, ref }) → { status: "PASS" | "BLOCKED", reason }`.
A thin `scripts/verify-dispatch-sha.mjs` reads the env, prints the reason and exits 1 on
`BLOCKED`. All four jobs call the script, so the rule is written once and unit-testable,
not copied as inline bash four times.

That script must run before `bun install` (the jobs install dependencies after the pin),
so it uses only Node built-ins, like `wait-for-deployed-sha.mjs` (`established fact`: that
script imports only `node:url`). Each job needs a checkout before the step can run. Use a
first, no-credentials checkout of `github.sha`, or move the existing "Checkout proof
source" step above the secret step. Either is fine as long as no secret is in scope before
§3.2 passes.

Both new script files are scorer paths (`established fact`: `isScorerPath` in
`scripts/lib/scorerLockRules.mjs` returns `true` for each), so they ship locked like the
tests that judge them.

### 3.5 Checklist and topology spec follow-through (same PR)

- `docs/release/go-live-checklist-after-402.md`, steps 1, 3 and 4: add
  `-f expected_sha=<receipt SHA>` to each `gh workflow run`. Keep the post-run
  `gh run view --json headSha` read and record it in the receipt. Drop the pre-dispatch
  `git ls-remote` check, because the workflow now enforces it. Keep "Stop if a run's
  `headSha` isn't the receipt SHA".
- `docs/specs/release-topology-specification.md` §2.9: change "A required `expected_sha`
  input … is a separate follow-up" to name the merged PR that adds it.
- Both edits land after `#2055` merges, because that PR introduces the text they change.

## 4. Out of scope

- Any change to `wait-for-deployed-sha.mjs`, the job `if:` gates, timeouts, concurrency,
  fixture checks, Playwright specs or the `one_tent_proof` job.
- Checking out a SHA other than the dispatch tip (rejected in §3.3).
- Running any proof against production. Dispatching is an owner step.
- Publish, promote, rollback, SQL apply or any production write.

## 5. Acceptance tests (RED before GREEN)

All of these assert resolved values: they parse the YAML or import the module, never
regex the source (`AGENTS.md`, contract-test rule).

**A. Unit tests: `src/test/dispatch-sha-rules.test.ts` (new)**

1. Each row of §3.2 returns the stated status and reason.
2. On `workflow_dispatch`, another `actor`, another `triggeringActor`, a `runAttempt` other
   than `1` and a `ref` other than `refs/heads/verdant-grow-diary` each return `BLOCKED`,
   even with a valid matching SHA.
3. `workflow_dispatch` never falls back to `githubSha`, whatever the input.
4. `push` and `schedule` pass whatever the input is. An empty event name, a misspelling
   (`Push`, `workflow-dispatch`) and an unlisted event (`pull_request`, `repository_dispatch`)
   each return `BLOCKED`.
5. The function is deterministic and has no I/O.

**A2. Runner tests: `src/test/verify-dispatch-sha-runner.test.ts` (new)**

Spawn `scripts/verify-dispatch-sha.mjs` with `process.execPath` as the executable (not a
bare `node`, which needs `PATH` and fails with `ENOENT` once the environment is restricted)
and only the §3.2 env names set (no other environment inherited that could mask a misread
name):

1. A PASS case exits `0`.
2. Each `BLOCKED` case from A.1, A.2 and A.4 exits non-zero and prints its `BLOCKED:`
   reason, including an unrecognized `EVENT_NAME`.
3. An env name the runner doesn't read (for example `EXPECTED_SHA` instead of `INPUT_SHA`)
   leaves the input empty, so a dispatch exits non-zero. This proves the runner reads the
   §3.2 names, not near-misses.

**B. Workflow contract tests: extend the existing suites**

Extend `src/test/actions-production-readonly-proof.test.ts`,
`src/test/settings-account-production-proof.test.ts`, the performance and quicklog block
in `src/test/signed-in-readonly-proof.test.ts:507-556` and
`src/test/one-tent-authenticated-proof-workflow.test.ts`:

1. Each of the three read-only proofs declares `inputs.expected_sha` with
   `type: string, required: true`. The `quicklog-smoke` input stays `required: false`.
2. In each of the four jobs, `Verify dispatch SHA` exists. Its `env` carries no
   `secrets.*` and is exactly the seven-key mapping of §3.2: `EVENT_NAME` equal to
   `${{ github.event_name }}`, plus `inputs.expected_sha`, `github.sha`, `github.actor`,
   `github.triggering_actor`, `github.run_attempt` and `github.ref` under their §3.2
   names. Assert the resolved `env.EVENT_NAME` string itself, not only that the key
   exists: the event name is what selects the rule (§3.2), so a step that hard-codes
   `EVENT_NAME: push` passes every other assertion and lets a dispatch skip the SHA
   check. Its `run` is exactly `node scripts/verify-dispatch-sha.mjs`, with no
   `continue-on-error` and no `if:`. Its index is lower than every step whose `env`
   references a secret. At least one step before it is a checkout of `${{ github.sha }}`
   with `persist-credentials: false` (the runner must exist on disk), and every step
   before it is such a checkout.
3. The existing pin assertions still hold: checkout `ref` is `${{ github.sha }}`, and the
   pin compares against `GITHUB_SHA` and writes `E2E_EXPECTED_SHA`.
4. The existing `if:` gate matrices (`signed-in-readonly-proof.test.ts:540-556` and the
   equivalents) are unchanged.
5. Mutation evidence for the event binding, in each of the four workflows: with the
   step's `EVENT_NAME` line deleted, and separately with it hard-coded to `push`, the
   workflow's contract suite must FAIL on the B.2 assertion. Record both failing counts
   per workflow in the PR body next to the RED counts in §5.C, then restore and show
   0 failures.

**C. RED proof**

Run suites A, A2 and B against the base without the change and record the failing count in
the PR body, as `CLAUDE.md` requires. Running them with the change restored must show
0 failures.

**D. Validation commands**

```bash
bunx vitest run src/test/dispatch-sha-rules.test.ts src/test/verify-dispatch-sha-runner.test.ts \
  src/test/actions-production-readonly-proof.test.ts \
  src/test/settings-account-production-proof.test.ts src/test/signed-in-readonly-proof.test.ts \
  src/test/one-tent-authenticated-proof-workflow.test.ts --reporter=dot
bun run typecheck
node scripts/scorer-lock.mjs --report --strict --base origin/verdant-grow-diary   # lists the unlocked scorers for the PR body
```

Plus 35/35 required checks at the exact head.

**E. Not provable in CI.** That a real dispatch with a stale `expected_sha` fails closed
can be shown only by an owner dispatch. Report it `NOT_MEASURED` until a dated receipt
exists. Never claim it from green CI.

## 6. Safety verdict

- No secret becomes available earlier than today. The new step runs with none, and it can
  only add a stop.
- Push runs keep today's behaviour, so the post-merge probes are unchanged.
- The `one_tent_proof` contract is untouched.
- This adds no write path, no production access and no new credential.

Verdict: **safe to implement**, as a tightening that only removes false-PASS paths.

## 7. File-level plan and routing

| File                                                                                          | Change                                                     | Scorer-locked                                           |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| `scripts/lib/dispatchShaRules.mjs`                                                            | new pure rules                                             | yes (`established fact`: `isScorerPath` returns `true`) |
| `scripts/verify-dispatch-sha.mjs`                                                             | new thin runner                                            | yes (`established fact`: `isScorerPath` returns `true`) |
| `.github/workflows/actions-readonly-proof.yml`                                                | input + first step                                         | yes (`established fact`: `isScorerPath` returns `true`) |
| `.github/workflows/settings-account-consent-proof.yml`                                        | same                                                       | yes                                                     |
| `.github/workflows/signed-in-readonly-performance.yml`                                        | same                                                       | yes                                                     |
| `.github/workflows/quicklog-smoke.yml`                                                        | input description + first step in the `quicklog-smoke` job | yes                                                     |
| `src/test/dispatch-sha-rules.test.ts`                                                         | new                                                        | yes                                                     |
| `src/test/verify-dispatch-sha-runner.test.ts`                                                 | new (§5 A2)                                                | yes (`established fact`: `isScorerPath` returns `true`) |
| the four existing test files in §5.B                                                          | extend                                                     | yes                                                     |
| `docs/release/go-live-checklist-after-402.md`, `docs/specs/release-topology-specification.md` | §3.5                                                       | no                                                      |

- **Holder:** assigned by Matthew. These are CI/workflow files, so Codex is the default
  holder. Claude does not implement this here.
- **Scorer unlock:** Matthew, via `node scripts/scorer-lock.mjs --unlock …`, naming every
  renegotiated check in the PR body.
- **Independent acceptance of this specification (#2057):** Graft, PASS at the exact head
  (Matthew's one-time exception for #2055 and #2057, 2026-10-13). Merge by Chemdawg after
  35/35.
- **Independent acceptance of the implementation PR:** a separate reviewer eligible for
  `.github/workflows` and scorer-locked test files under `docs/agents/OWNERSHIP.md` §2 and
  `AGENTS.md`: Blue Dream, Critical Mass or Durban Poison, or Codex only if Codex neither
  implemented nor repaired it. Graft's #2057 exception does not extend to that PR unless
  Matthew grants a separate explicit exception.

## 8. Known unknowns

| Item                                                                          | Status                                                                                                                                          |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Whether GitHub rejects an empty `required: true` string input on API dispatch | `uncertainty`; the design does not depend on it (§3.1)                                                                                          |
| Whether `inputs.*` is empty or null on `push`/`schedule`                      | `source claim` (GitHub docs: inputs exist only for `workflow_dispatch`/`workflow_call`); §3.2 branches on the event name, so either value works |
| Behaviour on a real stale dispatch                                            | `NOT_MEASURED` until an owner dispatch (§5.E)                                                                                                   |
