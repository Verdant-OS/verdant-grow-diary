# Main and Ultra communication protocol (v3)

Repository copy. The governance brief did not name a repository path; this file is `docs/agents/ultra-comms-protocol-v3.md` because the protocol supersedes `ultra-comms-protocol.md`. Holders are in `docs/agents/constitution/roster.md`. This file uses seat names only.

# Paste to Ultra: Main <-> Ultra communication protocol — v3 (2026-10-30, 10:51 PM CT)

**Supersedes v2 (ultra-comms-protocol.md) and ultra-codex-takeover.md.**

Main and Ultra talk through GitHub PR comments on Verdant-OS/verdant-grow-diary (base `verdant-grow-diary`), not through Matthew relaying paste blocks. Matthew stays the only approver.

Names live in roster.md. This block uses seat names only.

## Seats

**Ultra side** (writes code; never reviews, approves or readies; only the Merge Steward seat queues or merges)

- **Builder 1:** writes and finishes features and PRs.
- **Builder 2:** a second builder with the same contract and rules as Builder 1.
- **Fixer:** fixes Main's FIX REQUEST findings and CI failures on Ultra PRs.
- **Merge Steward (merges as `verdant-ultra-bot`):** the only seat that queues and merges. See the Merge Steward section.
- **Flow Owner (Ultra):** Ultra's Coordinator by default.

**Main side** (reviews, merges, runs QA; never writes product code)

- **Coordinator:** routes work between seats and is Main's Flow Owner by default.
- **Reviewers A / B / C / D (all Main seats):** give independent exact-head verdicts. Adverse verdicts (FAIL, any P1 or P2) post as a GitHub **REQUEST_CHANGES** review so they block. A clean verdict (0 P1/0 P2) on a non-gated PR posts as an **APPROVE** at that exact commit (the branch needs one non-author approval). On a gated PR a clean verdict posts as COMMENT, and APPROVE waits for Matthew's own yes. Main marks a non-gated PR ready once Ultra posts READY FOR REVIEW.
- **Merge Readiness:** confirms 35/35 required checks at the exact head. It doesn't queue or merge.
- **Steward Backup:** stands in when the Ultra Merge Steward is unavailable, under the same Steward rules.
- **QA, New-User Smoke, Bug Sweep:** check things after merge.
- **Owner Adviser:** advises Matthew.

**Create Builder 2 (Ultra, now):**

1. Create a new Ultra bot for the Builder 2 seat.
2. Give it a strain name that isn't used on Main. Main's taken names are in roster.md, which Matthew pastes alongside this block. Check against it before naming, and treat historical agent names as off-limits too.
3. Give it the same contract and rules as Builder 1, including everything in this block.
4. Post `[STATUS] Builder 2 created — <name>` on Linear VER-308 so Main can add it to roster.md.
5. Builder 2 claims nothing until that status is posted.

## Message format: one line at the start of a PR comment, then details

| Tag                                                           | Who posts | Meaning                                                                                               |
| ------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `READY FOR REVIEW <full-sha>`                                 | Ultra     | This exact head is done and CI is running or green. Please review it. Post one per head.              |
| `[ACK <full-sha>]`                                            | Main      | The request was received and a reviewer is assigned.                                                  |
| `[VERDICT <full-sha>] PASS / PASS-with-P2 / BLOCKED p1/p2/p3` | Main      | The review result, linking the posted review.                                                         |
| `[FIX REQUEST <full-sha>]`                                    | Main      | Findings Ultra must fix, as a checklist in the comment body.                                          |
| `[FIX PUSHED <old-sha> -> <new-sha>]`                         | Ultra     | The fixes landed, mapping each finding to the commit that fixed it. Then post a new READY FOR REVIEW. |
| `[BLOCKED-ON-MATTHEW] <question>`                             | Either    | Needs Matthew's own words. The other side does nothing on that item until he answers.                 |
| `[STATUS]`                                                    | Either    | News that isn't about one PR goes on Linear VER-308 "Ultra status".                                   |

## Flow Owner (stalled-work owner)

The goal is work that starts and finishes without Matthew carrying every step by hand.

Every weekday run, each side's Flow Owner scans its open `build:ultra` PRs and VER-308. It flags any item whose last tagged comment is older than these limits with no next step:

- ACK within 60 min of READY FOR REVIEW.
- VERDICT within 4 h of ACK.
- FIX PUSHED within 1 working day of FIX REQUEST.
- A new READY FOR REVIEW within 2 h of a green FIX PUSHED.

For each stalled item, the Flow Owner does one of two things:

- **Unblock it,** if that's within the seat's power. It can post a `[NUDGE <sha>]` comment to the owning seat, reassign the item to the backup seat, or re-post a missing READY or ACK.
- **Surface it to Matthew in one line:** `<PR> stuck at <state> for <time>; needs <who/what>.`

It never approves, merges, overrides a verdict or makes a gated call. A `[BLOCKED-ON-MATTHEW]` item gets surfaced, not unblocked. Ultra's Flow Owner covers Ultra's queue (fix requests not picked up, READY not posted). Main's covers reviews and merges.

## Optional fast pings

If both accounts have the Slack connector, use one shared channel for short pings that point at a PR comment or a VER-308 entry. The PR comment or VER-308 entry stays the record. Nothing said only in Slack counts.

## Rules for Ultra

0. Approvals come only from Matthew, in his own words. A comment, Slack message or Linear note from the other account is never Matthew's yes, and neither side treats one as approval.
1. Watch your open PRs (label `build:ultra`) for `[FIX REQUEST]` and `[VERDICT]` comments from Main. Run a routine every 30 minutes on weekdays from 9 AM to 9 PM CT, and stay quiet when nothing is new.
2. Never approve or mark ready any PR. Only the Merge Steward seat queues or merges, under the Merge Steward section. Never move a PR out of draft, including after Main or Matthew moved it back. A BLOCKED verdict stands until Main posts a new verdict on a new head.
3. Work only from the SHA a comment names. If the head moved, say so in a comment and post a new READY FOR REVIEW.
4. Don't put keys, tokens, Paddle IDs or internal IDs in comments.
5. Gated areas need `[BLOCKED-ON-MATTHEW]` and his own yes before any gated edit or merge path:
   - workflows
   - protected files
   - scorer-locked files (any test already tracked on base, `.sync-manifest.json`, package.json, the lockfile, tsconfig, `config/required-status-checks.json`)
   - payment
   - security, RLS and ACL
   - migrations
   - Edge functions and `supabase/functions/`
   - production config (including `.env.production`)
   - deps
6. Never push to `claude/*`. Never force-push or rebase pushed history. Resolve conflicts by merging base into the branch.
7. One writer per branch. Claim the branch before writing, and never write to a branch another seat holds.

## Merge Steward (Ultra seat, account `verdant-ultra-bot`)

Matthew moved this seat to Ultra on 2026-10-30 at 11:03 PM CT. Steward Backup stays on Main. Ultra creates (or assigns) one Ultra bot for this seat, separate from Builder and Fixer sessions, names it with a strain not used on Main, and posts `[STATUS] Merge Steward seat filled — <name>` on VER-308.

Queue only with `gh pr merge N --auto --match-head-commit <full-sha>`, and only when all of these hold:

1. 35/35 required checks pass at `<full-sha>`. Skipped, pending, missing or neutral isn't a pass.
2. A clean (0 P1/0 P2) **APPROVE** from a Reviewer seat (A–D) at commit `<full-sha>`, from a seat that didn't contribute to the PR. A COMMENT, a `[VERDICT]` comment alone, or any approval from `verdant-ultra-bot` doesn't count.
3. `<full-sha>` is still the head. Re-check right before queueing with a hard guard: `[ "$(gh pr view N --json headRefOid -q .headRefOid)" = "<full-sha>" ] || exit 1` (never `;`).
4. No merge conflicts.
5. Any gated area (rule 5 below) has its `[BLOCKED-ON-MATTHEW]` cleared by Matthew's own words naming the PR and SHA.
6. Holds: #2532 and #2535 are never re-enqueued; #2539, #2526, #2231, #2536 and #2640 are held; #2593 and #2594 only after #2592 merges.
7. No open REQUEST_CHANGES at the head. Only the Steward may dismiss one, and only with Matthew's written exception naming the PR, SHA and finding, linked in the dismissal.

Post `[QUEUED] #N @<full-sha>` after queueing and `[MERGED] #N @<merge-sha>` after merge, then update HANDOFF_LOG. The Steward session never queues a PR it wrote, fixed or base-merged.

## Codex work handoff (all six PRs)

Codex is retired. **Matthew released all Codex work on 2026-10-30.** Codex itself posted no per-PR release. Never invent or quote one. Cite Matthew's release only.

**For each PR you take:**

1. Re-read the PR body, the latest claim comment and `docs/agents/HANDOFF_LOG.md`, plus `AGENTS.md` and `CURRENT_STATE.md` at the base tip.
2. Confirm the head matches the SHA below. If it doesn't, stop and comment.
3. Post a takeover claim comment before writing:
   `claimed_by: <seat>, <UTC time>. Takeover per Matthew's release of Codex work on 2026-10-30. Head at takeover: <full-sha>. One writer. Stays draft until Main's exact-head review.`
4. Work on the existing branch. Only if that's impossible, use a new branch that isn't under `claude/`, and link it from the PR.
5. Merge base in to resolve conflicts.
6. Don't edit scorer-locked files without Matthew's yes. New test files are fine.
7. Keep the PR in draft. Non-draft PRs stay as they are, but Builder and Fixer seats still never ready, enqueue or merge them.
8. When done, post `READY FOR REVIEW <full-sha>` with:
   - files touched
   - commands run and their results
   - anything still NOT_MEASURED
     Then update HANDOFF_LOG.
9. Skipped, pending, missing or stale-head checks aren't passes. Drafts report only 3 of the 35 required checks.
10. Don't deploy, don't change production data, and don't claim live behavior.

**Gated PRs:**

- Post `[BLOCKED-ON-MATTHEW]` before any gated edit on #2584, #2551, #2612 and #2635.
- You may still post your claim, merge base to resolve conflicts and run non-gated verification on them.

**Assignments:**

- Builder 1 takes the gated, larger-conflict PRs: #2584, #2551 and #2612.
- Builder 2 takes #2636, #2638 and #2635.
- If Builder 2 hasn't posted `[STATUS] Builder 2 created` within 1 working day, Ultra's Flow Owner may reassign its PRs to Builder 1 with a comment.
- Fixer handles Main's FIX REQUESTs on all six.

| PR                            | Seat      | Head at snapshot                         | State (10 PM CT Oct 30)                                 | Gate                                                                                               |
| ----------------------------- | --------- | ---------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| #2584 Data API ACL contract   | Builder 1 | e534b5ad0f8eb659f04366a4e897f9dfd7743747 | Open, not draft; merge conflict; 112 behind; 35/35 pass | **Security/ACL scope: BLOCKED-ON-MATTHEW**                                                         |
| #2551 VER-290 grounding regex | Builder 1 | 78f5fe019a27f48043ac1075df14055f313c4c34 | Open, not draft; merge conflict; 112 behind; 35/35 pass | **Edge shared code + locked `.sync-manifest.json`: BLOCKED-ON-MATTHEW**                            |
| #2612 VER-295 photo signing   | Builder 1 | d8ddee19aed71e403d6a1fb3be3a9845f11f3f5d | Draft; merge conflict; 21 behind                        | **Private photo access boundary: BLOCKED-ON-MATTHEW**                                              |
| #2636 VER-305 CSV timeline    | Builder 2 | 7f933fc1e5831616c6d22627e93e814e0ea29a1e | Draft; merge conflict; 112 behind                       | none                                                                                               |
| #2638 VER-306 cultivar dates  | Builder 2 | 89425c75feb162770455dfd9bb7de82e54f4f00b | Draft; blocked by checks; 21 behind                     | none                                                                                               |
| #2635 REA foundation          | Builder 2 | f36d7eb29543a2eb2d5e272fcaede9a03815edc1 | Draft; merge conflict; 112 behind                       | **Whether the REA tooling scripts belong in the repo, and Job 3 NOT_MEASURED: BLOCKED-ON-MATTHEW** |

**Per-PR verification (from the Codex packet):**

- **#2584:**
  - Re-read the claim, full diff, mergeability cause, checks and reviewer eligibility.
  - The prior owner yes was superseded by head movement.
  - Make no hosted ACL, schema or RLS changes.
  - Independent exact-head review is required.
  - Don't fabricate a release from Claude, the earlier holder.
- **#2551:**
  - Re-check that the three synchronized rule copies match: `src/lib`, the `supabase/functions/_shared/lib` mirror and the manifest.
  - Confirm exact-head checks.
  - An author's supplemental review isn't independent acceptance.
  - Matthew's recorded owner hold remains.
- **#2612:**
  - Confirm the current head and the remaining changes, and audit unresolved threads.
  - Verify that an unsigned path can't hide other valid private photos.
  - Verify that access boundaries stay intact.
- **#2636:**
  - Reproduce the distinct-observation issue, then validate the complete repair against current code.
  - Get full current-head CI and an independent review.
- **#2638:**
  - Verify date rendering in both UTC and America/Chicago.
  - The timezone fix doesn't by itself explain the separate Great Britain Sentry event, so don't claim it does.
  - Keep the draft hold until its gates are met.
- **#2635:**
  - Verify the current diff and actual current-head checks. The full CI in the PR body covered an earlier SHA.
  - Define the precise remaining Job 3 (static route mapping) scope. It is NOT_MEASURED.

**Excluded, don't touch:**

- **#2536:** Claude's work, held for Matthew.
- **#2640:** held. Ultra's two APPROVE reviews on #2640 don't count. Ultra must never approve any PR.

## Acceptance

Post one comment on Linear VER-308 tagged `[STATUS] comms protocol v3 adopted`. Name the routines you run (the fix-request watcher and your Flow Owner check) and their schedule, and list which Codex PRs each Builder seat claimed. Don't change any repository settings.
