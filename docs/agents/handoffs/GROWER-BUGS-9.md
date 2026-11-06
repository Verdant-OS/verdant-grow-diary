# GROWER-BUGS-9

```text
TASK GROWER-BUGS-9  priority: P1  status: CLOSED
closed: merged. #2846 merged into verdant-grow-diary on 2026-11-04 as 71b967e4c45e2db76e03064d71f8eb7cc1b404c1 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: grower bug brief 2026-11-03 item 9 - after a tab crash, a new tab does not keep the sign-in
why: cause is the deliberate per-tab session (src/integrations/supabase/client.ts:18 sessionStorage; docs/auth-security.md; contract AC-2.4; auth-hardening-static-safety test). Measured in headless Chromium 2026-11-04: after a renderer crash, reloading the same tab keeps sessionStorage; a new tab starts empty
branch: claude/grower-bugs-9 (founder-named, 2026-11-04)
base: verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2846
head_sha: read the current head on GitHub
state: ready for review (marked ready 2026-11-04 by Matthew's instruction); base merged
current_step: copy-only fix - sign-in panel adds "If a Verdant tab crashed, reload that tab to stay signed in." under the existing per-tab note (#2478)
next_action: independent review
post_merge_check: on verdantgrowdiary.com /auth, the Sign in panel shows the crashed-tab reload line; the Create account panel does not
active_writer: Claude session claude/grower-bugs-9
decisions: founder chose keep-design-and-explain (2026-11-04); no auth, storage or token change; scorer-locked src/test/sign-in-per-tab-copy.test.tsx left unchanged, so the new line is a separate paragraph
tried_and_rejected: sharing the session to new tabs (does not help the crash case, auth change); localStorage (reverses AC-2.4)
commands: bunx vitest run src/test/auth-crashed-tab-reload-note.test.tsx src/test/sign-in-per-tab-copy.test.tsx --reporter=dot
files_touched: src/constants/authSessionCopy.ts, src/pages/Auth.tsx, src/test/auth-crashed-tab-reload-note.test.tsx, docs/agents/handoffs/GROWER-BUGS-9.md
files_remaining: none for this slice
blockers: none
open_questions: Safari/iOS reload-after-crash behaviour NOT_MEASURED
gotchas: none
links: none
reviewer_seat: eligible non-contributing reviewer per OWNERSHIP.md 4.3
reviewer_sha: none yet
session_state: Claude session also watches PRs #2820, #2828, #2842, #2844
claimed_by: Claude, 2026-11-04 03:50 UTC
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-04 19:00 UTC, by Claude session_017UoYKyhNGum4qmfYdoNRLr (restored as its own file after a base merge dropped the HANDOFF_LOG block))
```
