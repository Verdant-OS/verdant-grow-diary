# Grok Bot fleet — Ultra account

Secret-free description of the Ultra Grok Bot account so it can be rebuilt from the repo.
Seats and holders live only in `docs/agents/constitution/roster.md`. Bot description texts
live in `docs/agents/grok-bots/`. The reproducible export is `grok-bot-fleet-manifest.json`.
Decided by Matthew Cheek on 2026-11-05 (10:17–10:23 CT): the Ultra bots were deleted and
rebuilt from scratch; the Ultra Relay seat exists; yeses are relayed to the PR as `[YES]`
comments; every bot wakes on GitHub events, not chat pings.

Source for the vendor facts below: docs.x.ai Grok Bot overview, FAQ and teams pages, read
2026-11-05. Facts marked `3rd-party` are reported, not confirmed by the vendor.

## Facts that shape the fleet

| #   | Fact                                                                                                                                                                        | Consequence                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| F1  | One persistent computer per **user**; every Bot on the account shares its files, browser sessions and CLI logins. "Do not use separate Bots as a security boundary."        | Bots are roles, not fences. The merge credential (`verdant-ultra-bot`) lives on this account only; this account never reviews. |
| F2  | A Bot's conversation and learned memory are per-Bot and not shared. Context moves only through shared files, group chats and direct handoffs.                               | A packet in bot memory dies with that bot. The record is GitHub, never memory and never only `/workspace`.                     |
| F3  | Usage is a weekly pool per paid seat. When the pool is spent, **every Bot on the account stops** until reset or paid top-up. (`3rd-party`, consistent with the vendor FAQ.) | Exhaustion is account-wide. Resilience comes from the Main account, Claude or Codex reading the same GitHub record.            |
| F4  | Routines fire on schedule or on GitHub, Linear, Slack, Sentry and webhook events; routines spend the pool while nobody watches.                                             | Zero polling. One scheduled routine on the whole account.                                                                      |
| F5  | Reported caps: 50 Bots + group chats per account, 2–6 Bots per group chat. (`3rd-party`)                                                                                    | Five bots and one group chat fit.                                                                                              |

## Seats on the Ultra account

| Seat                     | Focus                                                                                                  | Description file              |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Ultra Builder 1          | Builds one claimed slice at a time; pushes at every stop point                                         | `grok-bots/ultra-builder.md`  |
| Ultra Builder 2          | Second build lane; never the same files as Builder 1                                                   | `grok-bots/ultra-builder.md`  |
| Ultra Fixer              | Repairs review findings and red CI on Ultra PRs; never opens slices                                    | `grok-bots/ultra-fixer.md`    |
| Merge Steward            | The only seat that queues: `gh pr merge <N> --auto --match-head-commit <sha>` after re-reading gates   | `grok-bots/merge-steward.md`  |
| Ultra Relay              | Continuity: `[YES]` relay, handoff-file keeper, lapsed-seat reporter, daily reconciliation; never code | `grok-bots/ultra-relay.md`    |
| Ultra Verifier (phase 2) | Re-runs the task file's commands at the exact head and posts counts; added only after the T9 drill     | `grok-bots/ultra-verifier.md` |

Why five and not more: F3. Extra bots on one account buy parallelism, not resilience, and
parallelism is capped by the Main review bench before it is capped by bots. Reviewers, QA,
Smoke, Bug Sweep and Owner Adviser are Main seats and stay off this account (F1).

## Computer layout

```text
/workspace/verdant/repo                 one clone, deploy branch verdant-grow-diary. Never edit here.
/workspace/verdant/wt/<TASK-ID>         one git worktree per open task. One bot per worktree.
/workspace/verdant/handoffs/<TASK-ID>/  scratch only: logs, counts, cloud-agent ids. A mirror, never the record.
```

Plugins: GitHub and Linear only. Vault: empty. GitHub identity on the computer:
`verdant-ultra-bot` only, receipted by `gh auth status` (masked) in `CURRENT_STATE.md`.

## Handoff: how a dark bot's work is picked up

The packet is the existing per-task file `docs/agents/handoffs/<TASK-ID>.md`. Four fields
are mandatory at every stop point (before every push, on BLOCKED, at the end of every turn,
on any usage warning): `head_sha`, `next_action`, `commands`, `session_state` (which names
`pool`, `worktree`, `cloud_agent`, `uncommitted`). A stop point is a push.

When the Ultra pool is spent mid-slice: at most one turn per task is lost; the Claude
read-only sentinel lists tasks whose `last_updated` is stale; the Coordinator (Main)
transfers under the AGENTS.md coverage rule; the successor runs the file's `checkout:` and
`next_action:` lines unchanged. When Ultra returns, the original bot reads the newer
`claimed_by`, posts `[ACK]`, and does not push.

Known residual risks, accepted: a cloud agent's in-flight diff at the moment of exhaustion;
a yes typed into a dark Relay's chat (Matthew types it on the PR directly instead); whether
a bot can read its own usage meter is `NOT_MEASURED`.

## Group chat

**Ultra Bench** — Relay, Builder 1, Builder 2, Fixer, Steward. Coordination only. No yes,
no verdict, no evidence lives there. Main seats are not members.

## Routines (event-triggered; one schedule; no polling)

| #   | Seat            | Trigger (repo `Verdant-OS/verdant-grow-diary`)           | Filter                                                                                                                                                                                                                          | Action                                                                                                                                             |
| --- | --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Merge Steward   | `issue_comment` created                                  | body contains `[PRECHECK] #` and `READY`, or `[YES] #` and `scope: "merge"` (quoted, the canonical Relay form)                                                                                                                  | Precondition re-read; `[MERGE] … QUEUED` or `BLOCKED`                                                                                              |
| R2  | Ultra Fixer     | `check_suite` completed                                  | conclusion `failure`, PR author `verdant-ultra-bot`                                                                                                                                                                             | Triage; claim only if released/assigned; else `[CI] … FAIL`                                                                                        |
| R3  | Ultra Fixer     | `pull_request_review` submitted; `issue_comment` created | `changes_requested` on an Ultra PR; or `[YES] #` naming an edit                                                                                                                                                                 | Repair per the Fixer seat file                                                                                                                     |
| R4  | Ultra Builder n | `issue_comment` created                                  | body contains `[SLICE] #` and `-> Ultra Builder n`; canonical dispatch is `[SLICE] #N @<40-hex> -> Ultra Builder n` (OWNERSHIP §4.2 parse rule)                                                                                 | Collision guard, claim, build                                                                                                                      |
| R5  | Ultra Relay     | `issue_comment` created; `pull_request_review` submitted | comment author is not `verdant-ultra-bot`; body contains any of `[WITHDRAWN]`, `[FALLBACK`, `released_by:`, `claimed_by:`, `READY FOR REVIEW`, `BLOCKED` on an Ultra PR. `[HANDOFF]` is excluded: it is the Relay's own receipt | Reconcile that task's handoff file; post `[HANDOFF] … CURRENT/STALE` only when the state differs from the last `[HANDOFF]` on that PR (idempotent) |
| R6  | Ultra Relay     | schedule, daily 06:00 America/Chicago                    | —                                                                                                                                                                                                                               | Reconciliation pass, summary, `WAITING ON MATTHEW:` line                                                                                           |

## Auto Review rules (advisory on self-serve plans; the enforced fence is "no production credential on this computer")

- Deny: `gh pr merge` without both `--auto` and `--match-head-commit`; `--admin`;
  `gh pr review --approve`; `gh pr ready`; `git push --force*`; rebase of a pushed branch;
  branch delete; `supabase db push`; `supabase functions deploy`; `supabase link`; any request
  to `*.supabase.co/rest/v1/rpc`; Paddle, Stripe or Cloudflare dashboards; device bridge;
  writes under `/workspace/verdant/repo`.
- Require approval: creating or editing any routine or trigger; launching a cloud agent in
  any mode other than `verdant-builder`.

## Receipts before the fleet counts as live

| #   | Test                                                             | PASS                                                                                                                         |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| T5a | `gh auth status` on the Ultra computer                           | `verdant-ultra-bot` only, dated, masked, recorded in `CURRENT_STATE.md`                                                      |
| T9  | Handoff drill: pause Ultra mid-slice after one pushed stop point | A Main seat, Claude or Codex resumes from the task file within 60 min with zero questions; the Ultra bot posts `[ACK]` later |
| T10 | Stop-point audit on three Ultra pushes                           | Each product-file push also updated the task file with the four mandatory fields                                             |
| T11 | Relay fidelity: a scoped yes typed in the Relay's chat           | Verbatim `[YES]` on the PR within 10 min; an ambiguous yes produces a question                                               |
| T12 | Usage ceiling: Settings → Usage at day start and end             | Dated screenshots; per-seat delta recorded                                                                                   |

Until these exist, the fleet's behaviour is `NOT_MEASURED`.
