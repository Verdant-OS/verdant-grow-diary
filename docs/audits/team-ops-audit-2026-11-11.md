# Team ops audit: token cost, stale branches, and five weak spots

Audit date: 2026-11-11, measured on the deploy branch `verdant-grow-diary` (re-checked
2026-11-12 at `c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8`). Read-only: the audit itself
pushed, deleted, labelled and commented on nothing. This file records the findings so every
seat can see them; it changes no rule.

Labels: **measured** (counted from the repo or GitHub), **estimated** (worked out from a
measurement, method stated), **inference** (a reading, not proven), **NOT_MEASURED** (not
checked).

Companion file: [`stale-branches-2026-11-11.md`](stale-branches-2026-11-11.md), the full
stale-branch list.

## Who owns what now

Each weak spot, mapped to the open work or the decision that covers it, as of 2026-11-12.

| # | Weak spot | Covered by | Still open |
|---|---|---|---|
| 1 | A fresh owner yes on every push | Nobody yet | Habit change: one yes request per PR, at the final head, after CI and the independent review pass |
| 2 | Startup reads cost about ten times what they need to | PR #2933 (lean startup reads), draft | Review and merge of #2933 |
| 3 | The rulebooks disagree in three places | PR #2948 covers the Chemdawg merge-gate line only (inference from its diff) | `roles/claude.md` "no current seat" vs. the CLAUDE.md import; §11 APPROVE vs. §13 COMMENT. Needs one amendment PR, with the founder picking the answers |
| 4 | GitHub cannot show who reviewed what | Nobody yet | Merge Steward checks for a review event at the exact head before queueing |
| 5 | Branch clutter and loose handoff tracking | PR #2928 closes the open stale handoff | Delete-on-merge setting (founder, as admin); pruning the 43 merged branches, only on the founder's yes to the list |

PR #2933 and PR #2948 both edit the eighteen versioned governance files, so whichever
merges second needs a fresh `Sentinel-Version` bump (inference from the parity rule in
`AGENTS.md` §0.2). This file is outside those eighteen on purpose.

## The numbers behind this

- Merged PRs in the four weeks to 2026-11-11: **399**; 58 more closed without merging (measured).
- Merges per week: 98, 99, 78, then 124 in the week of Nov 2 (measured).
- Merges by GitHub account: cheekhimself 357 (about 89%), verdant-ultra-bot 30, cursor[bot] 10,
  Codex 1, posthog[bot] 1 (measured).
- GitHub review decision on those 399: 57 approved, 1 changes requested, about 341 with none
  (measured). Reviews kept only in PR comments: NOT_MEASURED.
- Time from opening to merge: median 14.4 h, middle half 2.8 h to 38.8 h, 1 in 10 over 94.4 h,
  longest 580.8 h (measured). 136 PRs took over a day and 59 over three days (measured).

## 1. A fresh owner yes on every push

**What happens.** A yes binds to one exact head SHA, so every new push needs the founder
again. PR #2922 (field notebook slice 1) lists owner approval timestamps for many separate
pushes in its body (measured: the body lists them; the count of separate asks:
NOT_MEASURED).

**What the rules already say.** `AGENTS.md` §11 asks for the founder's per-item yes "at that
exact head SHA" for the merge. It does not ask for a yes on the pushes in between
(inference from the text).

**Smallest fix.** Ask once per PR: after required CI is green and the independent review
has passed at the final head, with one line naming the PR and the full SHA. Builders bundle
every review fix into one push. No rule change is needed.

**How we'll know.** Count yes requests per merged PR for two weeks before and after
(NOT_MEASURED today).

## 2. Startup reading costs about ten times what it needs to

Claude Code, Codex and Gemini are told to read `docs/agents/CURRENT_STATE.md` (483,497 B)
and `docs/agents/HANDOFF_LOG.md` (428,510 B) in full before acknowledging (measured sizes).

Token cost per session start, estimated at 4 characters per token:

| Agent | Required start reads | Bytes | Tokens (estimated) |
|---|---|---|---|
| Claude Code | CLAUDE.md, AGENTS.md, roles/claude.md (auto-loaded) plus the two big files | about 984 KB | about 246k |
| Codex | AGENTS.md, roles/codex.md, the two big files | about 953 KB | about 238k |
| Gemini | GEMINI.md, roles/gemini.md, the two big files | about 954 KB | about 239k |
| Grok bot | AGENTS.md, CURRENT_STATE "Start here", OWNERSHIP seats and §4.2, roster, the open handoff, its seat file, common.md | about 104 KB | about 26k |

Whether a session really pulls every byte (tools read long files in pieces) is
NOT_MEASURED. The required-read rule still points at all of it.

About 228k tokens of each Claude, Codex or Gemini start go to two files that are mostly
history (inference: `HANDOFF_LOG.md` takes no new blocks since 2026-11-04, and 91 of the 93
files in `docs/agents/handoffs/` are closed, measured 2026-11-12).

**Fix in flight.** PR #2933 makes the lean read the required one. Estimated saving: about
200k tokens per Claude, Codex or Gemini session start.

## 3. The rulebooks disagree in three places

Each of these can stop an agent and send the question back to the founder (inference).

- `docs/agents/roles/claude.md` says "Historical — no current seat", but `CLAUDE.md` imports
  it as Claude's assigned role (measured).
- `CLAUDE.md` says Chemdawg's merge gate decides merges; `AGENTS.md` §11 says only the Merge
  Steward queues or merges (measured). PR #2948 removes the Chemdawg line.
- `AGENTS.md` §11 says the Merge Steward queues only after a reviewer APPROVES the exact
  head; §13 says a clean review on a gated PR is a COMMENT until the founder's yes
  (measured). Read together, a gated PR may never get the APPROVE that §11 waits for
  (inference).

**Smallest fix.** One amendment PR, after #2933 and #2948 land, that settles the remaining
two lines. The founder picks the answer for APPROVE versus COMMENT.

## 4. GitHub cannot show who reviewed what

About 341 of 399 recent merges have no GitHub review decision (measured). Reviews live in
`[ROUTE]`, `[ACK]` and `[CLAIM]` comments, and most seats post from the same account
(measured: 357 of 399 merges), while the rules say a shared account does not prove
independence.

**Smallest fix.** `AGENTS.md` §13 already asks for "a GitHub review at that commit". The
Merge Steward checks, before queueing, that a review event exists at the exact head and
names the reviewer seat in its first line. Separate accounts per seat would settle
independence for good; that is the founder's call.

## 5. Branch clutter and loose handoff tracking

- 320 of 724 remote branches had no commit in 30+ days on 2026-11-11, and only 43 are proven
  to be in `main` (measured; 726 remote branches on 2026-11-12). Squash merges hide the
  rest, so "not proven merged" does not mean the work was lost.
- The repository's delete-branch-on-merge setting: NOT_MEASURED (no settings access).
- The one open handoff, `CLAUDE-HANDOFF-BULK-CLOSE-20261106` (32,036 B), adds about 8k tokens
  to every Grok bot start until PR #2928 closes it (estimated).

**Smallest fix.** The founder turns on delete-on-merge in repository settings. Then prune the
43 merged branches first, by prefix, only on the founder's yes to the list.

## Not measured

- How many minutes each yes, review check or rule question costs the founder.
- How many tokens a session really loads, as opposed to what the rules tell it to read.
- Reviews recorded only in PR comments.
- Repository settings and branch protection.
