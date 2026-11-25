# NAV-LOGO-HOME-LINK-20261124

```text
TASK NAV-LOGO-HOME-LINK-20261124  priority: P2  status: CLOSED
goal: on phones the header logo opens the Dashboard ("/") in one tap from any page.
why: Matthew asked for the quickest simplification of the current UI with fewer taps (2026-11-23). #3054 put Dashboard in the More sheet (two taps); the logo link was held until #3034 landed because it owned the AppShell header lines. #3034 merged as cb7796a.
branch: claude/project-thread-cv7kqk
base: verdant-grow-diary at 8876c91c53a890ba67f2a669c5019a3a5bd2d9b3
checkout: git fetch origin claude/project-thread-cv7kqk verdant-grow-diary && git switch claude/project-thread-cv7kqk
pr: the draft PR opened from this branch
head_sha: read the PR's current full head; a commit cannot name itself.
state: merged as eb4d9931e0a9cc5ff9ed6420cee404423a0f0cc7 (PR #3089, 2026-11-25 03:31 UTC via merge queue) from reviewed head 463308d8d58fadf3f8cb6c4f3543a509fb20c06b: 35/35 required checks green, Codex code + security reviews with no findings, Cheek's merge yes and VReviewer APPROVE at that head. Post-merge check NOT_MEASURED until /version.json reports the merge SHA.
current_step: closed.
next_action: run post_merge_check once live (needs a signed-in disposable test account; Cheek's yes).
post_merge_check: on https://verdantgrowdiary.com once /version.json shows the merge SHA, at phone width the header logo opens "/" from a plant page.
active_writer: Claude thread session (thread cmsg_01P7pGxx3V5wxVuLXvJUxaGsAZ8N43Mds1gfjk5GqfLBN2)
decisions: Link from the react-router-compat shim, aria-label "Dashboard" (same word as the sidebar and the More sheet); only the phone header logo (md:hidden) changes, the desktop sidebar logo is untouched; focus-visible ring matches the shell's skip link.
tried_and_rejected: none.
commands: bunx vitest run src/test/app-shell-home-logo-link.test.tsx src/test/brand-logo.test.ts --reporter=dot
files_touched: src/components/AppShell.tsx (import + header logo block), src/test/app-shell-home-logo-link.test.tsx (new), this file, docs/agents/handoffs/NAV-WAY-BACK-DASHBOARD-DOCTOR-20261123.md (closed)
files_remaining: none planned
blockers: none
open_questions: none
gotchas: no schema, RLS, edge, auth, billing, migration or production change. Open PRs checked for AppShell.tsx overlap on 2026-11-24 (#3022, #3080 touch other files).
links: friction list items 4 and 5
artifacts: PR checks on the draft PR
```
