# GROWER-BUGS-11

```text
TASK GROWER-BUGS-11  priority: P1  status: CLOSED
closed: merged. #2851 merged into verdant-grow-diary on 2026-11-04 as 379e9311dae05e6da27385de9ef41c9cafec1745 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: grower bug brief 2026-11-03 item 11 - after sign-in /onboarding flashes a blank body before the dashboard; first load sometimes fails with ERR_CONNECTION_CLOSED
why: measured in mocked Chromium: a grower with grows goes /auth -> /onboarding ("Loading your grows...") -> `/`, and `/` showed ~1 s of blank page before the dashboard. Cause: RootEntry kept its own `hydrated` useState(false)+useEffect, so every client-side mount for a signed-in grower first rendered and lazy-loaded the public Landing behind an invisible Suspense loader, then swapped to AppShell
branch: claude/grower-bugs-11 (founder-named, 2026-11-04)
base: verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2851
head_sha: read the current head on GitHub
state: ready for review (marked ready 2026-11-04 by Matthew's instruction); base merged
current_step: fix - RootEntry uses the shared useHydrated() (useSyncExternalStore): false only for SSR and the hydration pass, true on later client mounts. Test src/test/root-entry-client-nav-no-landing-flash.test.tsx (RED 1 failed before the fix; hydration-without-mismatch case kept)
next_action: independent review; production-build before/after frame measurement in the PR body
post_merge_check: on verdantgrowdiary.com, sign in as the fixture grower with a grow and no saved start screen; the page goes Loading your grows -> dashboard with no blank page between
active_writer: Claude session claude/grower-bugs-11
decisions: ERR_CONNECTION_CLOSED part is BLOCKED (needs Worker/host logs; no access from this session); the /onboarding hop itself is kept (it decides first-run vs returning), only the `/` remount detour is fixed
tried_and_rejected: none
commands: bunx vitest run src/test/root-entry-client-nav-no-landing-flash.test.tsx src/test/root-entry-routing.test.tsx --reporter=dot
files_touched: src/components/RootEntry.tsx, src/test/root-entry-client-nav-no-landing-flash.test.tsx, docs/agents/handoffs/GROWER-BUGS-11.md
files_remaining: none for this slice
blockers: ERR_CONNECTION_CLOSED needs the host's request/Worker logs (owner access)
open_questions: whether to send growers with grows from /auth straight to `/` (skips the /onboarding hop; behaviour change, not done here)
gotchas: `bun run build` refuses a dirty tree (stamp_dirty) and rewrites public/version.json and src/generated/buildInfo.ts; restore them after a local build
links: none
reviewer_seat: eligible non-contributing reviewer per OWNERSHIP.md 4.3
reviewer_sha: none yet
session_state: Claude session also watches PRs #2820, #2828, #2842, #2844, #2846
claimed_by: Claude, 2026-11-04 04:20 UTC
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-04 19:00 UTC, by Claude session_017UoYKyhNGum4qmfYdoNRLr (restored as its own file after a base merge dropped the HANDOFF_LOG block))
```
