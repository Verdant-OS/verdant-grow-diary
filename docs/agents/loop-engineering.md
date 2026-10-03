# Loop engineering at Verdant — eligibility, the locked scorer, and habits

**Status:** specification plus one tooling slice, docs-only apart from `scripts/scorer-lock.mjs`,
`scripts/lib/scorerLockRules.mjs` and the project hook in `.claude/settings.json`.
**Author:** Claude (Knowledge Library / Product Specification Architect), 2026-10-02.
**Independent reviewer:** Critical Mass (no `.tsx` outside `src/test/`, not a P1, not a publish
gate), per the routing in `AGENTS.md`. Claude cannot give this slice its own PASS.
**Measured against:** deploy tip `80176bad5` (`#1864`), read locally 2026-10-02.
**Carries no `Sentinel-Version`.** It is not one of the twelve governance files.

This page does not change who merges, who reviews, or what is authorised. No Publish, APPLY,
production SQL, device control or Action Queue operation is implied anywhere below.

## 0. What this is, and where it came from

`source claim`: the AI LABS video "He Finally 10x Claude Code With This Method" (YouTube
`qLfSDQ5NGh0`, read as a transcript on 2026-10-02) describes a Claude Code workflow built on
Andrej Karpathy's Auto Researcher loop: the agent may change the code, may never change the file
that scores it, and reads a plain-English `program.md` for how to run each round. The channel adds
a second loop that reads the results of the first and rewrites the "how to work" part of the
instructions, and it reports one blind spot the checks cannot see: a feature whose checks all pass
but which nothing in the app reaches.

`established fact`: most of that pattern already exists here. Thousands of contract-pin tests
under `src/test/` are the scorer; `AGENTS.md` and `CLAUDE.md` are the fixed rules;
`docs/agents/HANDOFF_LOG.md` is the per-round results record; `CLAUDE.md` already requires every
new test to be shown RED before its fix. Three things were missing, and this page plus its slice
supplies them:

1. a mechanism, not a convention, that stops a session from quietly weakening an existing check
   (§3);
2. a place where recurring mistakes are written back as working rules, outside the versioned
   governance files, by a process that cannot touch the checks (§4);
3. an explicit statement of which tasks a loop may run on at all (§2).

## 1. Vocabulary

| Term         | Meaning here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loop         | An agent repeating build, run checks, keep or revert, without a human directing each round                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Scorer       | A file whose job is to judge other code: anything under `src/test/`, `e2e/` or `e2e-local/` (specs and their fixtures), any `*.test.*` or `*.spec.*` file wherever it lives (co-located `src/`, `supabase/` Deno tests, `scripts/`, `spikes/`, `plugins/`), the Deno underscore-named tests (`*_test.ts` under `supabase/functions/`), the Python testbench suites (`test_*.py` under `tools/`), the Pester suites (`*.Tests.ps1`), the pgTAP and RLS SQL suites under `supabase/tests/`, a gate script under `scripts/` at any depth whose basename carries a judge verb as a hyphen-delimited token (`check-`, `checks`, `verify-`, `assert-`, `validate-`, `audit-`, `scan-`, `precommit-`, `preflight-`, `-harness`, `-harnesses`, `-gate`, `-db-security`) or starts with `test-` or `run-` (every tracked `scripts/**/run-*` is a suite orchestrator or runtime harness that decides whether its suite fails the job), plus the measured gates whose name carries no verb (`diff-money-migration-prefixes.mjs`, `probe-migration-drift.mjs`, `annotate-edge-shared-drift.mjs`, the CI helpers under `scripts/ci/` including the merge-queue snapshot judge, the release-receipt derivation scripts `build-release-receipt-input.mjs`, `emit-release-receipt.mjs` and `print-release-receipt-status.mjs`, the smoke-lane judges `sandbox-credit-packs-smoke.ts` and `smoke-award-nugs.ts`, the release-gate tooling under `scripts/releases/` including the migration contract its gate and tests derive from, and the gate contract modules `scripts/p3-preservation/contract.mjs` and `scripts/seo/seoAllowlist.mjs`) and the migration manifests their judges pin (`required-money-migrations.mjs`, `required-core-migrations.mjs`) (in `.mjs`, `.cjs`, `.js`, `.ts`, `.ps1` or `.sh`; the verbs CI and `package.json` actually invoke; `static-client-secret-scan.mjs`, `sensor-safety-check.mjs` and the `run-*-rls-harness.ts` runtime tests are in, `measure-test-estate.mjs` and `send-ecowitt-test-payload.ts` are out), the test-runner configs that decide which checks execute (`vitest*.config.*`, `playwright*.config.*`, `vitest.workspace.*`), the active Vitest suite runners and their test-selection modules (`scripts/vitest-controlled/`, `scripts/run-vitest-batches.mjs`, `scripts/vitest-batch-utils.mjs`, `scripts/run-vitest-shard4-isolated.mjs`), the gate wiring that decides which judges run and what their result means (`.github/workflows/`, the local composite actions they delegate preflights to under `.github/actions/`, `.husky/`, `package.json` at the root and every nested `package.json` a lane runs with `working-directory`) and the delegated gate library a wrapper hands its pass/fail decision to (`scripts/lib/`), or the gate-owned configuration a judge reads to decide its result (`config/`, `scripts/config/`, `scripts/fixtures/`, the `*.config.*` modules under `scripts/` that pin route allowlists for the SEO parity lane, `eslint.config.*`, `tsconfig*.json` at any depth, the edge shared-lib sync manifest and the release-workbook manifest; widening an allowlist is as quiet a weakening as editing the gate) |
| Locked       | A scorer already tracked at `HEAD`. New scorers are always writable; that is how checks get written before code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Unlock       | A declared, reasoned exception recorded in `.claude/scorer-unlock.json` (git-ignored) for one task: bound to the branch it was declared on and expiring after 24 hours                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Results file | `docs/agents/HANDOFF_LOG.md`: what each round tried, whether it was kept, and which checks still failed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Habit        | A mistake that recurred across rounds, written as a working rule in `.claude/skills/verdant-loop-habits/SKILL.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## 2. Eligibility gate — when a loop is allowed at all

A task may be run as a loop only when all four hold. Record the answers in the task's handoff
block before the first round.

- **Repeated.** The task recurs often enough to repay building the loop. A one-off job gets one
  good prompt and a human in the loop.
- **Budgeted.** The token cost of failed rounds is accepted up front. Every round re-reads the
  project and tries a fix; rounds that are reverted cost the same as rounds that are kept.
- **Scorable.** Something other than the agent's own judgement scores the result, and that
  something runs locally or in CI: a test that is RED before the change and GREEN after. A score
  that is `NOT_MEASURED`, `BLOCKED` or lives only on production is not a score, and a loop whose
  only score is NOT_MEASURED is not eligible.
- **Runnable.** The agent can run what it built and see what broke, inside the fixture. If the
  only way to see the result is the live site, the task is not loop-eligible.

One feature per loop. A loop builds one feature or one fix to its checks; it never builds a whole
surface and calls it done. The checks are listed in plain words for a human before the first
round (the PR body's test list is that list).

**Never loop against these**, whatever the score says. They are the surfaces `AGENTS.md` keeps
with Matthew or behind named locks, and a loop has no business near them:

- production-only verification and smoke against `https://verdantgrowdiary.com` (the score there is
  measured by a person at a target SHA, never by a loop);
- `supabase/migrations`, any SQL, RLS policies, auth, and Edge Functions;
- the Action Queue, device control, and anything that writes to a grower's data;
- lockfile or dependency changes, and the twelve `Sentinel-Version` governance files;
- `docs/agents/CURRENT_STATE.md` (operating state is measured and written by a person or by a
  single explicit stamp, not iterated);
- Publish, promote, rollback, and the AI Doctor provider or model selection;
- billing and entitlement rules.

What is loop-eligible today, by elimination and by the routing in the draft slice builder
(Verdant-OS/verdant-grow-diary#1774, `docs/agents/claude-slices.md`, unmerged): test-only
slices, library and `*Rules.ts` work with RED-first tests, docs with a contract test, and
Copilot-sized UI slices whose checks run under `chromium-mocked` with an explicit spec filter.

## 3. The locked scorer

`established fact` (this slice): `scripts/scorer-lock.mjs` is wired as a `PreToolUse` command hook on `Edit|Write|MultiEdit|NotebookEdit` in `.claude/settings.json`, run from `$CLAUDE_PROJECT_DIR` so a `cd` into a subdirectory during the session cannot make the script path fail to resolve (a hook that errors with exit 1 is non-blocking, which would silently open the gate); the repository itself is discovered from the hook input's `cwd`, which follows the active git worktree, so an edit inside a worktree is judged against that worktree's `HEAD` rather than skipped as outside the session-start checkout. Before a file-writing tool call
runs, the hook reads the call, resolves the path against the repository root, and:

- allows it when the path is not a scorer (§1 vocabulary; the rule table is
  `SCORER_PATH_RULES` in `scripts/lib/scorerLockRules.mjs`);
- allows it when the scorer is not yet tracked at `HEAD` (a new check being written);
- allows it when the path, or a directory containing it written with a trailing slash, has an
  unlock in `.claude/scorer-unlock.json` that is still in force: declared with a reason of at
  least 8 characters, on the current branch, with a declaration time no later than now and an
  expiry at most 24 hours after it. The consumer enforces that whole contract, not only the expiry, so a hand-made
  record with a bare path and a far-off expiry is not in force. An unlock from another branch, or one that has
  expired, is ignored, so a declaration left behind by a session that was cut off never carries
  over to the next task (`AGENTS.md` › Agent Handoff / Coverage);
- otherwise exits 2 with a refusal that names the path and the unlock command, which Claude Code
  feeds back to the model.

Declaring an exception, for a task that genuinely renegotiates a pin with its behaviour change:

```bash
node scripts/scorer-lock.mjs --unlock src/test/quick-log-save.test.tsx --reason "pin follows the new copy in quickLogCopy.ts"
node scripts/scorer-lock.mjs --status            # current unlocks, expired ones marked
node scripts/scorer-lock.mjs --report --strict   # local pre-push gate vs the merge-base with verdant-grow-diary; exit 2 if any changed scorer is still locked, exit 1 if no deploy-branch ref exists (pass --base <ref>)
node scripts/scorer-lock.mjs --lock              # end of task: every check locked again
```

The unlock file is git-ignored, so an unlock never ships; declaring the same path again refreshes
its 24-hour window, and `--lock` ends every unlock at once. `--report` is for the PR body: it lists
every tracked scorer that was modified, deleted, renamed or retyped (replaced by a symlink, git status `T`) relative to the base and whether it was
declared, which is the "list the checks in plain words" step from the source workflow, applied to
changes rather than to new checks. A deleted, moved or retyped check counts because removing a check, or replacing it with a symlink that no longer executes, is the quietest way to weaken one; a rename is judged on the old path, the one that existed at the base, and a rename from a non-scorer into a scorer path is a new check, always allowed. The default base is the merge-base with the deploy branch, so the report stays correct after the changes are committed, which is when a PR body is written. When no deploy-branch ref exists (a fresh or shallow checkout), a plain report falls back to `HEAD` and says so, and `--strict` refuses with exit 1 rather than certify a comparison that cannot see committed changes. The lock's own control files, `scripts/scorer-lock.mjs`, `scripts/lib/scorerLockRules.mjs` and `.claude/settings.json`, are scorers too: they decide which checks are protected and whether the hook runs, so editing one needs the same declared unlock.

**Limits, stated honestly.** This is a tripwire against accidents, not a security boundary. The
agent that is refused can run `--unlock` itself; the hook can be routed around with a shell
redirect; a session started before the hook existed may not load it until `/hooks` is opened or
the session restarts; and Claude Code hooks are not consulted by CI. What the lock changes is that
weakening a check becomes an explicit, logged, reasoned act that a reviewer can find, instead of a
side effect. The real enforcement stays where it was: the 35 required checks, the
`Published migration integrity` gate, branch rulesets, and RLS. `practical observation`,
2026-10-02: inside the session that authored this slice, Claude Code picked up the new settings
file without a restart, and the hook refused two edits to tracked test files (exit 2, refusal
text fed back to the model) because the unlock on disk had been written without an expiry; after
`--unlock` in the current format the same edits went through. That is one session's reading, not
a guarantee for every host.

**Collision note.** Open Verdant-OS/verdant-grow-diary#1865 adds a `verdant-guard` Claude Code
mod with refusals for force-push, protected-branch pushes, migration edits and production
operations. This slice deliberately does not touch that branch or its plugin. When #1865 lands,
the scorer rule can move into `verdant-guard`'s `rules.ts` as one more pure check, and the project
hook here can be retired in the same change; until then the two do not overlap in what they
refuse.

## 4. Habits — writing the results back

The source workflow's second loop reads the results file, finds mistakes that keep coming back,
and rewrites the "how to work" instructions. Here that is a skill, not a file, for the reason the
video gives: only a skill's one-paragraph description stays in every session's context, and the
body loads when a session is about to build, review or finish a slice.

- **Where:** `.claude/skills/verdant-loop-habits/SKILL.md`.
- **Results file:** `docs/agents/HANDOFF_LOG.md`. Its closed blocks are the rounds; a habit cites
  the blocks or merged PRs that show the mistake recurring.
- **Who may amend it:** any peer, from a closed block or a merged PR, without a `Sentinel-Version`
  bump, because the skill is not one of the twelve governance files. The amendment rules are in
  the skill itself.
- **What the habits process may never do:** the habits process never edits a check, test, spec or
  gate to make a round pass. If a habit needs a new check, that check is a separate change and
  goes through the scorer lock like any other. This is the same rule as the source workflow's
  "the auto loop can't edit the checks", and for the same reason: otherwise rounds stop failing
  without the habit ever being fixed.

The two habits the video's own run produced, "connect each feature to the app in the same round
its checks pass" and "find every place the app already does a job and make each follow the new
rule", are H1 and H2 in the skill, each with Verdant evidence. H3 (count narrowly, state the
method) and H4 (a pin renegotiation is a declared act) come from this repository's own recorded
miscounts and from §3.

## 5. The results record a round needs

`docs/agents/HANDOFF_LOG.md` already carries the task block. For a looped task, the block's
`current state` line records per round: what was tried, kept or reverted, and which checks still
fail, with counts (`RED 7 passed / 1 failed` before, `8 passed / 0 failed` after). That is what the
habits process reads. A round with no counts is not a round.

## 6. Acceptance tests for this slice

| Test                                    | What it proves                                                                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/test/scorer-lock-rules.test.ts`    | The rule table, unlock matching, the verdict function, the `--hook`/`--unlock`/`--lock`/`--report` CLI against a disposable git repository, and the hook wiring on the resolved `.claude/settings.json` object |
| `src/test/loop-engineering-doc.test.ts` | This page keeps the four conditions, the never-loop list, the lock description and the habits rules; the skill keeps its frontmatter, evidence labels and amendment rules                                      |

Both were run RED before the implementation existed (module not found, document absent) and GREEN
after; the counts are in the PR body.

## 7. Deferred and rejected

- **Deferred: moving the scorer rule into `verdant-guard`.** Waits for #1865 to land (§3).
- **Deferred: linking this page from `docs/agents/claude-slices.md`.** That file exists only on
  #1774, Codex-held. Once it lands, one line under its routing section should point here for the
  eligibility gate.
- **Deferred: a CI form of the strict report.** The strict report is a local pre-push gate: it
  reads the git-ignored unlock file, so in a clean CI checkout every changed scorer would read as
  locked and no legitimate renegotiation could pass. A CI job needs the declarations from a
  reviewable input instead (a committed, reviewed manifest or a parsed block in the PR body), which
  is a design decision for that slice, plus a workflow, which is CI infrastructure under #1774's
  routing. Until then the PR body carries the report's output.
- **Rejected: a hard deny rule on `src/test/**` in settings permissions.** It would block the
  convention `CLAUDE.md` requires (renegotiate pins in the same commit as the behaviour change).
  A declared unlock keeps the convention and adds the record.
- **Rejected: a `SCORER_LOCK_DISABLED` environment bypass.** It would be the easiest route around
  the lock and leave no record; `--unlock --reason` is the only exception path.
- **Rejected: an "auto loop" that rewrites the habits file unattended.** The habits file is read by
  every builder; letting an unattended process rewrite it is the hidden-automation pattern
  `AGENTS.md` forbids. A peer amends it from evidence, and a reviewer sees the diff.
- **Not adopted: the video's sandbox-per-agent product placement.** Cloud sessions and the
  one-task-one-branch rule already isolate runs.
