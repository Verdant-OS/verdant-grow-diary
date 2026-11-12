# LEAN-STARTUP-READS-20261111

```text
TASK LEAN-STARTUP-READS-20261111  priority: other  status: OPEN
goal: Cut the required startup reads for Claude Code, Codex and Gemini from about 1.4 MB to about 0.2 MB (about 0.11 MB once the entries #2928 closes are archived) without changing any rule except which files are read at startup.
why: Startup reads cost about 240k tokens per Claude Code, Codex or Gemini session (two mostly historical files plus every handoff file), so Claude's weekly usage runs out mid-week and grower-facing work stalls. Requested by Matthew on 2026-11-11 ("you can kick off the session now"), building the slice he was shown.
branch: claude/project-thread-8cw7yi
base: verdant-grow-diary at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8
checkout: git fetch origin claude/project-thread-8cw7yi verdant-grow-diary && git switch claude/project-thread-8cw7yi
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (git ls-remote origin claude/project-thread-8cw7yi)
state: pushed draft
current_step: draft PR open; required CI running.
next_action: an eligible independent reviewer (not this session) checks the whole diff at the exact head, including the byte-for-byte archive check in commands; then Matthew's per-item yes at that head, then the Merge Steward. Builder seats do not mark ready, enqueue or merge.
post_merge_check: on the deploy branch, run the archive check below against the merge commit and confirm `node scripts/check-sentinel-version-parity.mjs <merge-parent>` passes; a fresh Claude Code session's SENTINEL_ACK names the Start here section and the open handoff log. Failure reopens this task with the same owner.
active_writer: Claude Code thread session cfc4207e-79c9-57a9-a07a-0bd07dc11789 (project thread cmsg_01P7pGxx3V5wxVuLXvJUxaGsXRFDQLP8NaN8dr9HbR9UUf)
decisions: (1) CURRENT_STATE.md stays one file; only its required-read scope changes to the "Start here (agents)" section (everything above "# Verdant — Current Operating State"), whose first paragraph now says when to search the log. Splitting the file was rejected because other sessions append observations to it daily. (2) HANDOFF_LOG.md keeps its header, template, the 11 blocks still open on the base (no own file yet), and "Coverage not yet imported" (it lists standing holds). 35 Open-section blocks whose own files read CLOSED, plus both "## Closed" sections (original lines 1654-3103), moved byte for byte, in order, to docs/agents/archive/HANDOFF_LOG_ARCHIVE.md under a short header and one added "## Moved from Open" heading. (3) The handoff log read is HANDOFF_LOG.md plus handoff files whose TASK line reads status: OPEN. (4) Each required-read sentence was replaced in place, not stacked. (5) The CLAUDE.md read-instruction pins in scripts/check-sentinel-version-parity.mjs and its self-test were renegotiated in the same commit as the wording change (allowed by CLAUDE.md "Renegotiate pins in the same commit"); the pin still fails on the old wording (negative gate in commands). (6) Sentinel-Version 2026-11-11.1, AGENTS.md §17 entry added.
tried_and_rejected: archiving the 11 still-open blocks now — rejected, they are open on the base; PR #2928 (another session) closes them in their own files, after which they can move to the archive in a follow-up.
commands: node scripts/check-sentinel-version-parity.mjs c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8; node scripts/check-sentinel-version-parity.test.mjs; node scripts/sync-sentinel-mirror.mjs --check. Archive check (bytes and order): R='1,75 874,907 1011,1031 1052,1086 1087,1121 1122,1155 1156,1187 1222,1255 1290,1323 1324,1360 1381,1402 1566,1585 3104,3114' (the kept line ranges of the base log); D=$(for r in $R; do printf '%sd;' $r; done); P=$(for r in $R; do printf '%sp;' $r; done); git show c03ea6fd:docs/agents/HANDOFF_LOG.md > /tmp/o; cmp <(sed "$D" /tmp/o) <(sed '1,/^## Moved from Open$/d' docs/agents/archive/HANDOFF_LOG_ARCHIVE.md | tail -n +2) (expect no output); diff <(sed -n "$P" /tmp/o) docs/agents/HANDOFF_LOG.md (expect only the header paragraph, lines 4-5 to 4-8). Negative gate for the pin: git diff c03ea6fd -- scripts/check-sentinel-version-parity.mjs > /tmp/pin.patch && git apply -R /tmp/pin.patch; node scripts/check-sentinel-version-parity.mjs c03ea6fd (expect exit 1); git apply /tmp/pin.patch.
files_touched: AGENTS.md; CLAUDE.md; GEMINI.md; .grok/rules/verdant-grok-role.md; docs/agents/README.md; docs/agents/HANDOFF_PROTOCOL.md; docs/agents/roles/*.md (12); docs/agents/CURRENT_STATE.md (Start here intro only); docs/agents/HANDOFF_LOG.md; docs/agents/archive/HANDOFF_LOG_ARCHIVE.md (new); docs/agents/handoffs/README.md; docs/agents/handoffs/LEAN-STARTUP-READS-20261111.md (new); scripts/check-sentinel-version-parity.mjs; scripts/check-sentinel-version-parity.test.mjs
files_remaining: none for this slice
blockers: local vitest and the lint-staged hook could not run here: bun install --frozen-lockfile fails with a 403 on the Lovable registry tarballs (BLOCKED); hosted CI is the gate.
open_questions: (1) After #2928 merges, archive its 11 now-closed blocks in a follow-up? (2) .claude/skills/steward/SKILL.md says feature PRs never edit CURRENT_STATE.md; this governance PR edits only the Start here intro, and no restamp PR is open (3 open PRs checked 2026-11-11).
gotchas: never read CURRENT_STATE.md or the archive whole; use grep -n and sed -n ranges. AGENTS.md and GEMINI.md are prettier-ignored; regenerate GEMINI.md's core with scripts/sync-sentinel-mirror.mjs.
links: docs/agents/archive/HANDOFF_LOG_ARCHIVE.md; PR #2928 (semantic neighbour, no shared files)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access; no routines; nothing paused
claimed_by: Claude Code thread session cfc4207e-79c9-57a9-a07a-0bd07dc11789, 2026-11-11 09:53 CT
owner: Claude
last_updated: 2026-11-11 09:53 CT, by Claude
```
