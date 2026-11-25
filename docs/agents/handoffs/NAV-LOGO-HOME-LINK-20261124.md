# NAV-LOGO-HOME-LINK-20261124

```text
TASK NAV-LOGO-HOME-LINK-20261124  priority: P2  status: OPEN
goal: on phones the header logo opens the Dashboard ("/") in one tap from any page.
why: Matthew asked for the quickest simplification of the current UI with fewer taps (2026-11-23). #3054 put Dashboard in the More sheet (two taps); the logo link was held until #3034 landed because it owned the AppShell header lines. #3034 merged as cb7796a.
branch: claude/project-thread-cv7kqk
base: verdant-grow-diary at 8876c91c53a890ba67f2a669c5019a3a5bd2d9b3
checkout: git fetch origin claude/project-thread-cv7kqk verdant-grow-diary && git switch claude/project-thread-cv7kqk
pr: the draft PR opened from this branch
head_sha: read the PR's current full head; a commit cannot name itself.
state: pushed draft. Local vitest and typecheck NOT_MEASURED (node_modules incomplete: vitest cannot load pathe; bun install --frozen-lockfile BLOCKED by registry 403). Prettier clean on the new hunk and new test (scratch prettier 3); AppShell has three pre-existing prettier warnings from #3034 that this change leaves alone.
current_step: waiting on required CI (drafts skip the 32 shards and Lint), then one independent exact-head review.
next_action: if a required check fails on the new test, fix it on this branch; then route one non-contributing reviewer.
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
