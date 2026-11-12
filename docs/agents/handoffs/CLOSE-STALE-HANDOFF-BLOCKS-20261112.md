# CLOSE-STALE-HANDOFF-BLOCKS-20261112

```text
TASK CLOSE-STALE-HANDOFF-BLOCKS-20261112  priority: other  status: OPEN
goal: Close the 15 handoff tasks that still read OPEN on the deploy branch although their PRs merged on 2026-11-12, without losing their unfinished items.
why: AGENTS.md section 12 requires a merged task to be CLOSED the same day with the reason and final SHA. On 2026-11-12 at base c2884348875b3dd39f2059ecc323ac10c33cfde5, 15 files in docs/agents/handoffs/ had a TASK line reading status: OPEN, and GitHub reports every one of their PRs merged that day. Matthew asked for the stale files to be closed (source claim: his message relayed in this thread's brief; he counted 12 to 13, the measured count is 15).
branch: claude/project-thread-sgovxq
base: verdant-grow-diary @ c2884348875b3dd39f2059ecc323ac10c33cfde5
checkout: git fetch origin claude/project-thread-sgovxq verdant-grow-diary && git switch claude/project-thread-sgovxq && git ls-remote origin claude/project-thread-sgovxq  # compare with the PR head before trusting any review
pr: the draft PR for branch claude/project-thread-sgovxq (number recorded in the PR body and the thread report)
head_sha: the commit carrying this file; read the current head from the PR and verify with git ls-remote
state: pushed draft; no review requested
current_step: review routing
next_action: the Coordinator routes one eligible independent reviewer (not this session) for the exact head; then Matthew's per-item yes and the Merge Steward. This writer does not mark ready, request review, enqueue or merge. After merge, the carried-forward items below need owners.
post_merge_check: on the merged deploy tip, (a) git grep -lE '^TASK .*status: OPEN' -- docs/agents/handoffs/ lists none of the 15 task ids below; (b) each of their TASK lines reads status: CLOSED; (c) git diff <base>..<tip> -- docs/agents/HANDOFF_LOG.md is empty. Docs only; nothing ships to the app, so there is no production check.
active_writer: Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f
decisions:
  - Follows the CLOSE-STALE-HANDOFF-BLOCKS-20261111 (#2928) convention. Three things change in each file: the TASK line reads status: CLOSED, one closed: line is added under it, and last_updated is replaced with the old value kept in parentheses. Nothing else in the 15 files changes. HANDOFF_LOG.md is not edited.
  - Merged state and merged_at come from GitHub (PR reads, 2026-11-12). Each landing SHA is the first-parent commit on origin/verdant-grow-diary whose subject ends with the PR number (read 2026-11-12). All 15 are first-parent commits on the deploy branch.
  - CLOSE-STALE-HANDOFF-BLOCKS-20261111 (#2928) is itself one of the 15. Its own carried-forward list stays in its file and is not repeated here.
  - Closing does not mean the items are done. Each entry's post_merge_check, open_questions and blockers are copied verbatim below unless the whole value is an empty marker (none, N/A, NOT_APPLICABLE, optionally "(docs only)"). None is claimed as measured.
  - Claim check before writing (2026-11-12): the four open PRs (#2960, #2956, #2951, #2936) touch none of the 15 files; no other branch edits them; Slack showed no claim on the close-out.
tried_and_rejected: none
commands: re-check a landing SHA: git log origin/verdant-grow-diary --first-parent --format='%H %s' | grep '(#<N>)$'. Per file, git diff <base> -- docs/agents/handoffs/<TASK-ID>.md shows exactly the TASK line, the added closed: line and last_updated. The edit script was scratch-only (not committed).
files_touched: edited: docs/agents/handoffs/{AI-DOCTOR-SNAPSHOT-FRESH-WINDOW,AUTH-EMAIL-DIRECT-SEND,CLOSE-STALE-HANDOFF-BLOCKS-20261111,DEAD-MODULE-CLEANUP-ZERO-REFERENCE,FIELD-NOTEBOOK-SLICE-1,LEAN-STARTUP-READS-20261111,LEGACY-QUICKLOG-RETIREMENT-SPEC,OPERATOR-PLANTS-READ-ONLY,POSTHOG-USER-AGENT-AUTOMATION,SENTINEL-PARITY-MERGE-GROUP,TEAM-OPS-AUDIT-20261112,TIMELINE-PAGED-HISTORY-TRUTH,TYPECHECK-GATE-HEAP,VERDANT-AUTO-HANDOFF-20261112,WORKFLOWS-TYPECHECK-GATE}.md; this file (new)
files_remaining: none
blockers: none for the docs. Independent exact-head review and Matthew's per-item yes are the standing gates.
open_questions: who owns each carried-forward item below (Matthew). POSTHOG-USER-AGENT-AUTOMATION names OG Kush as owner, and the roster records OG Kush as retired with no named inheritor; that owner gap is BLOCKED until Matthew names one.
gotchas: check the TASK line only; the words status: CLOSED can appear elsewhere in a file. FIELD-NOTEBOOK-SLICE-1.md had no code fence, and on the deploy branch it already failed prettier --check: with the repo config, prettier --write (which lint-staged runs on commit) would pair the two __root.tsx mentions as bold and rewrite them as **root.tsx. This change wraps that entry in a text fence, as the other handoff files have, so no existing line changes; its TASK line is now line 2. Some carried-forward blockers name pre-merge gates for PRs that have since merged; they are historical and kept verbatim. Whether any carried-forward post-merge check was already measured elsewhere was not checked.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2928 (convention)
exclusions_for_review: Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f (this writer)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no paused workflows; no scheduled routines.
claimed_by: Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f, 2026-11-12 (Matthew's request)
owner: Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f
last_updated: 2026-11-12, by Claude thread session cmsg_01P7pGxx3V5wxVuLXvJUxaGsEpwdKHZggkJ6ogkMmA8G6f
```

## Closed entries (15)

| Task                                  | PR    | Merged (UTC)     | Landing SHA                                |
| ------------------------------------- | ----- | ---------------- | ------------------------------------------ |
| `AI-DOCTOR-SNAPSHOT-FRESH-WINDOW`     | #2940 | 2026-11-12 09:42 | `caac9166625d133309e7d5f76d05d3567dc5fc2c` |
| `TYPECHECK-GATE-HEAP`                 | #2938 | 2026-11-12 09:14 | `9e2d6309017b2395fa58ce53163e90c4b5613830` |
| `LEAN-STARTUP-READS-20261111`         | #2933 | 2026-11-12 09:14 | `d4b2ac06622b8ff3acc0ace7d2d2659305effa61` |
| `FIELD-NOTEBOOK-SLICE-1`              | #2922 | 2026-11-12 09:50 | `42f867b510ece2edf365c469be5cc920cb4e98a3` |
| `DEAD-MODULE-CLEANUP-ZERO-REFERENCE`  | #2946 | 2026-11-12 09:58 | `4fb9f4389646ba9b468d7aa00384e08b0ec2c700` |
| `VERDANT-AUTO-HANDOFF-20261112`       | #2949 | 2026-11-12 10:29 | `9340ce3a67a7d18985372d922309edf134a507f3` |
| `CLOSE-STALE-HANDOFF-BLOCKS-20261111` | #2928 | 2026-11-12 10:30 | `d9fc27721c4a7b0fbebd174c13c4cbc2bd44003c` |
| `LEGACY-QUICKLOG-RETIREMENT-SPEC`     | #2950 | 2026-11-12 10:47 | `58286d66fb8ed7380977c25d5301ec7e4a882512` |
| `OPERATOR-PLANTS-READ-ONLY`           | #2941 | 2026-11-12 11:04 | `5c3006159664bf84ad7fb41c9197fa15c2cea1df` |
| `WORKFLOWS-TYPECHECK-GATE`            | #2947 | 2026-11-12 11:04 | `e2cd59379a3b84702ceba5933122350c22d72103` |
| `POSTHOG-USER-AGENT-AUTOMATION`       | #2923 | 2026-11-12 12:06 | `9c2d542aa6e1a84ae78ed5c980460eb243221609` |
| `SENTINEL-PARITY-MERGE-GROUP`         | #2958 | 2026-11-12 12:22 | `75e2a70d0de7b55c439855615a05d9716b08028b` |
| `TIMELINE-PAGED-HISTORY-TRUTH`        | #2934 | 2026-11-12 12:35 | `c50c422a92e377c25c737ce1e5ceb14c35ab0fe4` |
| `AUTH-EMAIL-DIRECT-SEND`              | #2961 | 2026-11-12 12:37 | `a6be091539a3a8613ad78192e2ba6c84a71405fa` |
| `TEAM-OPS-AUDIT-20261112`             | #2959 | 2026-11-12 13:18 | `c2884348875b3dd39f2059ecc323ac10c33cfde5` |

## Carried-forward items

Copied verbatim from each closed entry (`source claim` from that block, not re-verified). A field is omitted only when its whole value is an empty marker. A `blockers` line that names only a pre-merge gate for that entry's own PR is historical, because that PR has since merged; it is kept so nothing is silently dropped. Production checks run on https://verdantgrowdiary.com only, after live `/version.json` reports a SHA that includes the merge, and are founder-gated: this file authorizes no Publish, production APPLY, production write or migration.

`CLOSE-STALE-HANDOFF-BLOCKS-20261111` (#2928) keeps its own carried-forward list in its file; it is not repeated here.

### `AI-DOCTOR-SNAPSHOT-FRESH-WINDOW` (#2940)

- **post_merge_check:** after live /version.json reports the merge SHA, on the disposable fixture grow: open the AI Doctor launch dialog for the fixture plant whose newest manual snapshot is between 24 and 48 hours old and confirm the stale explanation shows and the copy says 24 hours. Read-only; no save needed. NOT_MEASURED until then.
- **open_questions:** docs under docs/ that describe the 48-hour readiness window were not searched or edited in this slice.

### `TYPECHECK-GATE-HEAP` (#2938)

- **post_merge_check:** NOT_APPLICABLE to production (no shipped code changes). After merge, the required `Lint, typecheck, test, build` context on the next PR is the check: it must still run typecheck to exit 0. A failure reopens this work with the same owner.
- **open_questions:** whether to move the two workflows above onto `bun run typecheck`.

### `LEAN-STARTUP-READS-20261111` (#2933)

- **post_merge_check:** on the deploy branch, run the archive check below against the merge commit and confirm `node scripts/check-sentinel-version-parity.mjs <merge-parent>` passes; a fresh Claude Code session's SENTINEL_ACK names the Start here section and the open handoff log. Failure reopens this task with the same owner.
- **open_questions:** (1) After #2928 merges, archive its 11 now-closed blocks in a follow-up? (2) .claude/skills/steward/SKILL.md says feature PRs never edit CURRENT_STATE.md; this governance PR edits only the Start here intro, and no restamp PR is open (3 open PRs checked 2026-11-11).
- **blockers:** local vitest and the lint-staged hook could not run here: bun install --frozen-lockfile fails with a 403 on the Lovable registry tarballs (BLOCKED); hosted CI is the gate.

### `FIELD-NOTEBOOK-SLICE-1` (#2922)

- **post_merge_check:** NOT_MEASURED. After the notebook is live, sign in on https://verdantgrowdiary.com and confirm ordinary sign-in lands on the Dashboard with Quick Log closed, and a saved note shows the grower's clock.
- **open_questions:** none for this head
- **blockers:** Photo reload unproven.

### `DEAD-MODULE-CLEANUP-ZERO-REFERENCE` (#2946)

- **post_merge_check:** none on production. Deleted files had no importer, so no bundle or route changes; after live /version.json reports the merge SHA, the signed-out landing and one authenticated page loading is sufficient. NOT_MEASURED until then.
- **open_questions:** docs/superpowers/plans/irrigation-evidence-ledger-v1.md line 66 names PlantIrrigationHistoryLink as part of a planned slice; the owner chose to delete it anyway, and that plan would recreate it if it is ever built.

### `VERDANT-AUTO-HANDOFF-20261112` (#2949)

- **post_merge_check:** in a fresh Claude Code session on the deploy branch, the hook stays silent below the mark, prints one handoff reminder after context passes about 150k tokens, and prints a re-read reminder on the first tool call after a compaction.
- **blockers:** bun install --frozen-lockfile is BLOCKED here (registry tarballs 403 through the proxy), so bun run typecheck, bun run lint and the repo-installed vitest did not run locally; CI runs them. Local evidence used vitest 4.1.12 installed in a scratch directory outside the repo (repo lockfile untouched): new test 10/10 and scorer-lock-rules 82/82 green, settings test RED first (1 failed, 9 passed).

### `CLOSE-STALE-HANDOFF-BLOCKS-20261111` (#2928)

- **post_merge_check:** on the merged deploy tip, (a) grep -lE "^TASK .*status: *OPEN" docs/agents/handoffs/\*.md lists none of the 12 task ids below; (b) each of the 11 ids from HANDOFF_LOG.md has docs/agents/handoffs/<TASK-ID>.md whose TASK line reads status: CLOSED; (c) git diff <base>..<tip> -- docs/agents/HANDOFF_LOG.md is empty. Docs only; nothing ships to the app, so there is no production check.
- **open_questions:** who owns each carried-forward item below (Matthew). Whether docs/agents/handoffs/ should join the OWNERSHIP.md low-risk review lane is still open from HANDOFF-LOG-PER-FILE (#2860).
- **blockers:** none for the docs. Independent exact-head review and Matthew's per-item yes are the standing gates.

### `LEGACY-QUICKLOG-RETIREMENT-SPEC` (#2950)

- **open_questions:** the six decisions in spec section 8. Stage 1 would edit dispatch sites and may need QuickLogV2Sheet.tsx, which open PR #2936 also edits.
- **blockers:** none for the spec; the build stages are blocked on the owner's decisions

### `OPERATOR-PLANTS-READ-ONLY` (#2941)

- **post_merge_check:** after the operator applies the migration in production, in the SQL editor: select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'plants' order by 1; expect no row named "Operators update all plants", and "Operators view all plants" plus "Users update own plants" still present. Before that apply, production behavior is NOT_MEASURED and unchanged.
- **open_questions:** (1) supabase/tests/pheno_candidate_number_maintenance_paths.sql lines 154-160 carry a comment that names "Operators update all plants" as a way a non-owner reaches a plant row. The test logic does not depend on the policy (it runs under role none) and was not edited; the comment becomes stale once this is applied. (2) Correction to the same row-level security pass: it also reported that a grower can set profiles.current_badge to any text. That is true of committed migrations only (last guard definition 20260721194325 does not list current_badge). docs/knk-20260824-profiles-gamification-triggers-apply-ledger-operator-runbook.md records that production knkwiiywfkbqznbxwqfh was captured on 2026-08-24 with an UPDATE trigger that refuses current_badge changes and an INSERT trigger that nulls it (source claim; live state NOT_MEASURED since). That ledger closes #1120 and bars #1178 as the wrong artifact, so no migration was written. Owner decision 2026-11-12: drop the badge-lock slice. src/test/profiles-gamification-write-protection.test.ts and its integration twin still pin a client badge edit as succeeding, which matches committed history and not the recorded live trigger; left unchanged.

### `WORKFLOWS-TYPECHECK-GATE` (#2947)

- **post_merge_check:** none on production (CI-only change). After merge, the next run of each of the two workflows on the deploy branch should show the step executing `bun run typecheck` and passing. On the PR branch this is already measured (see workflow_runs).
- **open_questions:** both workflows run on ubuntu-latest (ecowitt-windows-tooling.yml line 29, demo-proof-walkthrough-readonly.yml line 56); despite its name, the EcoWitt workflow does not use a Windows runner, so a hosted run does not exercise Windows. Both workflows have run with this change and passed (see workflow_runs). `bun run typecheck` on Windows is a separate, unmeasured question that this slice does not depend on. docs/bridge-trust-phase-a-freshness-checklist.md line 231 still shows the direct tsc command as a manual step; docs were not edited.

### `POSTHOG-USER-AGENT-AUTOMATION` (#2923)

- **post_merge_check:** after Publish and live /version.json reports the merge SHA, run in PostHog SQL: count web $pageview events in the last 24 hours grouped by $virt_traffic_type. Expect Regular for consented growers and no rise in Automation / no_user_agent. NOT_MEASURED until the SHA is live.
- **blockers:** independent exact-head review; Matthew's per-item yes; Publish is Matthew's only

### `SENTINEL-PARITY-MERGE-GROUP` (#2958)

- **post_merge_check:** the next merge_group run on verdant-grow-diary reports "Governance files agree on Sentinel-Version" (success). A queue entry still landing NOT_MEASURED until CodeQL and both Analyze contexts also report on merge_group, which is Matthew's settings change. A failure reopens this work with the same owner.
- **blockers:** none. Update 2026-11-12: at 09:14:29 UTC the copilot-advisory-review ruleset was edited to require only "Claude locked paths" and "EcoWitt custom-upload claims pgTAP (disposable local Postgres)"; #2938 merged from the queue 24 s later (9e2d6309). This PR is no longer needed to unblock the queue; Matthew chose to keep it as merge_group coverage for the parity check.

### `TIMELINE-PAGED-HISTORY-TRUTH` (#2934)

- **post_merge_check:** after live /version.json reports the merge SHA, on the disposable fixture grow: open Timeline, press "Load older entries", save one Quick Log note tagged [smoke <timestamp>], and confirm the older entries are still listed. NOT_MEASURED until then.

### `AUTH-EMAIL-DIRECT-SEND` (#2961)

- **post_merge_check:** after a deploy that Cheek approves, request a sign-in email for the disposable test account on https://verdantgrowdiary.com, confirm it arrives From noreply@verdantgrowdiary.com with SPF, DKIM and DMARC PASS, and confirm one new email_send_log row with status sent. Until then NOT_MEASURED (no deploy authorized).
- **open_questions:** (1) Whether Lovable's managed setup also needs the retired queue files removed before it shows the update as applied (Lovable's claim, unverified). (2) Display name. (3) Whether the production Supabase send-email hook is on.
- **blockers:** bun install --frozen-lockfile fails here (403 on the pinned registry tarballs), so typecheck, lint and the full suite were not run locally; CI owns them.

### `TEAM-OPS-AUDIT-20261112` (#2959)

- **post_merge_check:** NOT_APPLICABLE (docs only; no runtime behavior)
- **open_questions:** Which seat takes weak spot 1 (yes-per-PR habit) and weak spot 4 (review-event check)? Founder pick on §11 APPROVE vs §13 COMMENT.
- **blockers:** none for the docs; the follow-ups listed in the audit's ownership table need the founder or the named seats
