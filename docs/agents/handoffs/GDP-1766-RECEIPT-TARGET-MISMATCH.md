### GDP-1766-RECEIPT-TARGET-MISMATCH

```text
TASK GDP-1766-RECEIPT-TARGET-MISMATCH  priority: P1  status: CLOSED
goal: Keep mismatched manual readback locked and preserve #1745's confirmed-null recovery card.
branch: copilot/fix-target-mismatch-return
base: codex/quicklog-manual-lineage-fence-20260927
checkout: None; closed (dropped; the work never reached the deploy branch). Historical: git fetch origin copilot/fix-target-mismatch-return codex/quicklog-manual-lineage-fence-20260927 && git switch copilot/fix-target-mismatch-return && git merge origin/codex/quicklog-manual-lineage-fence-20260927
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/1766 (merged into a stacked parent only)
head_sha: 8adb15561a400635e65e40b3d3c0baf12755c6b4
state: CLOSED (dropped). Last recorded open state: #1766 merged at 2026-09-28 19:25:56 CT into the #1745 stack as decc6d15d0c534a642efc84b73a2ba211e529c36, from head 8adb15561a400635e65e40b3d3c0baf12755c6b4. It is not on the deploy branch. Prior local proof: 26 files / 501 passed / 0 failed / 0 skipped; typecheck 0. Parent confirmed-null card unchanged; no migration delta versus parent.
next_action: None; dropped. Reopen as a new task from verdant-grow-diary if the change is still wanted.
files: Five paths listed in PR #1766 body; pure mismatch-copy rules, QuickLog recovery presenter and focused tests.
blockers: None for this closed task. Historical: #1745 database-approval hold and its #1735 parent lock remain. Do not land locked ancestors or auto-untag/release mismatched target state.
artifacts: https://github.com/Verdant-OS/verdant-grow-diary/pull/1766
reviewer_seat: Blue Dream
claimed_by: Codex, 2026-09-28 18:46 CT
last_updated: 2026-10-13 16:45 CT, by Claude (log maintenance on owner instruction; not a claim). Earlier entry: 2026-09-28 21:13 CT, by Codex
closure: Dropped. #1766 merged on 2026-09-29 00:25:56 UTC as decc6d15d0c534a642efc84b73a2ba211e529c36 into its stacked parent codex/quicklog-manual-lineage-fence-20260927, not the deploy branch. That parent (#1745) merged as 851239d4170e90f2121129b42ad229bc70f6343f into codex/quicklog-active-replay-fence-20260926, whose PR to verdant-grow-diary (#1735, head b4bd2fc557c506432d9cb02d5d4bbdd72b82b58c) closed without merging on 2026-10-01 04:02:50 UTC. Neither merge commit is an ancestor of verdant-grow-diary. Whether equivalent work later landed by another PR was not verified here.
```
