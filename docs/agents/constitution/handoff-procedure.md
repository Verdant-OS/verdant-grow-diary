# Handoff procedure

Normative detail for `AGENTS.md` §12. The log template at the top of `docs/agents/HANDOFF_LOG.md` is the field list. This file is how to use it. Any agent or human follows the same steps.

## Write the entry first

Create the block before the first push. Update it at least daily and at every stop, including low budget and retirement. A log edit on a task branch is invisible until it merges, so the current holder also posts `claimed_by: <agent>, <YYYY-MM-DD HH:MM> UTC` on the PR.

Push the branch and open the draft PR before implementation, not only before a planned stop. A block with no pushed branch and no PR cannot be resumed. Unpushed work does not count.

## Cold start

The entry and the matching `resume here` PR comment use plain paths, full SHAs, and URLs. They include: goal and why; decisions and reasons; what was tried and rejected; exact commands to reproduce the state and run the relevant tests; files touched and files still to touch; open questions; gotchas; links to reviews, issues, and runs.

Do not write "as discussed" or "per my earlier message".

Before stopping, apply the cold start test: a fresh agent reading only the PR, the handoff entry, and the repo can take the next step.

## Stop and retirement

Near budget or on any stop: push, update the entry, post `resume here` with the cold-start facts and the exact head SHA.

Retirement is explicit. Every open PR has a current entry. Routines are reassigned or deleted, and the entry says which. Ownership rows in `docs/agents/CURRENT_STATE.md` transfer. If no successor is named, the default inheritor is the engineering lead on the roster. Post `handed off: <agent>, <YYYY-MM-DD HH:MM> UTC` with the `resume here` facts, then stop pushing.

## Claim, release, and takeover

Last activity is the newer of `last_updated` on the deploy branch and the effective claim, including the holder's renewal comments. A `last_updated` that exists only on the task branch does not count. A block with a pushed branch and a PR is open when it has no effective claim or its last activity is older than 24 hours.

The effective claim is the newest valid `claimed_by` in the log or on the PR, unless that holder later posted `released_by:`. A claim posted while another valid claim is under 24 hours old is not valid. The first claim posted wins a race. A release may name a successor; only that successor's claim is valid for the next 24 hours.

Before resuming, post `claimed_by: <agent>, <YYYY-MM-DD HH:MM> UTC`, then re-read comments. If another valid claim is earlier, stop. A successor does not open the PR. A valid claim means you hold the branch and the previous holder stops pushing.

Takeover:

1. Read the handoff.
2. `git fetch` the branch and the base. Compare `git rev-parse origin/<branch>` with the recorded head SHA.
3. Equal: continue. Ahead, and the recorded SHA is an ancestor of the PR head: adopt that head, name it in the claim, record it at the next log update. Diverged or rewritten: stop and reconcile.
4. Check out and `git merge --ff-only origin/<branch>`. If that fails, stop. Then run the block's checkout command, which ends in the base merge. Never rename, recreate, or force-push.
5. Re-run or confirm required checks at that SHA. If the head moved after the recorded review, get a new independent exact-head review. Never inherit a pass from an older SHA.

On startup with no assignment, take the highest-priority eligible open block: publish gate, then P1, then P2, then everything else. Ties go to the oldest `last_updated`.

Resuming does not change who merges, who reviews, or who owns CI. Close a merged, superseded, or dropped block the same day with the reason and the final SHA.

## One-pass review

The reviewer lists every finding at once. The writer verifies the whole affected section against the real SQL or code, not only the flagged line, and resolves that list in one pass.

## Stale work

A PR untouched for 14 or more days, or more than 500 commits behind its base, is closed with a superseded/stale note. Keep the branch. An owner claim stops the close.

## PR gate checklist

The PR body holds: required CI green; independent exact-head review; should-fix findings resolved; the last reviewed SHA; for a feature, the named post-merge check. Wording for the release checkbox, while the GitHub template is unchanged, is in `docs/agents/CURRENT_STATE.md`.
