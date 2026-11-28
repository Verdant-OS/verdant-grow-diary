# NAV-WAY-BACK-DASHBOARD-DOCTOR-20261123

```text
TASK NAV-WAY-BACK-DASHBOARD-DOCTOR-20261123  priority: P2  status: CLOSED
goal: two navigation dead ends are gone on phone: (1) a grower who has a tent can reach the Dashboard ("/") from the More sheet; (2) the Back button on a saved AI Doctor review opened from a copied link or a fresh tab opens the saved reviews list instead of doing nothing or leaving Verdant.
why: Matthew asked for the quickest simplification of the current UI with fewer taps (2026-11-23). Friction list item 4 (no Home, back links) and note 5 ("every screen one tap from a clear home base"). Since #3031 the Tent tab opens the grower's tent, and the phone header logo is not a link, so "/" had no phone route once a tent exists.
branch: claude/project-thread-cv7kqk
base: verdant-grow-diary at c64a1cc58050e985cf33cb68305d2f286afb1973
checkout: git fetch origin claude/project-thread-cv7kqk verdant-grow-diary && git switch claude/project-thread-cv7kqk
pr: the draft PR opened from this branch
head_sha: read the PR's current full head; a commit cannot name itself.
state: CLOSED 2026-11-24: merged as 8876c91c53a890ba67f2a669c5019a3a5bd2d9b3 (#3054, PR head 1b89c967d7ad9e6946aa9ff73e409507d390baa0; Codex code and security review clean at that head; Matthew's yes and VReviewer approval at that head). Post-merge check NOT_MEASURED: live /version.json read 7fcdc39 at 16:28 UTC, one commit behind the merge. Earlier draft-state note: Pure rule test passes locally (scratch vitest 4.1.12, 5/5). Component tests, typecheck, lint, build NOT_MEASURED locally (bun install --frozen-lockfile BLOCKED: registry 403); required CI provides them.
current_step: waiting on 35 required checks, then one independent exact-head review.
next_action: if CI is red on the new component tests, fix them on this branch; then route one non-contributing reviewer.
post_merge_check: on https://verdantgrowdiary.com once /version.json shows the merge SHA, at phone width: More lists Dashboard first and it opens "/"; opening a saved review link in a new tab and pressing Back lands on /doctor/sessions.
active_writer: Claude thread session (thread cmsg_01P7pGxx3V5wxVuLXvJUxaGsAZ8N43Mds1gfjk5GqfLBN2)
decisions: Dashboard label matches the desktop sidebar (one name per place). end: true so "/" is not marked current on every page. Back keeps history back when TanStack's __TSR_index > 0 (checked in @tanstack/history 1.162.5: the entry a tab opens on is 0, pushes increment) and otherwise opens /doctor/sessions. Rule in src/lib/savedReviewBackRules.ts; the page only presents.
tried_and_rejected: making the phone header logo a Home link (AppShell.tsx lines 416-421 sit in open PR #3034's hunk; revisit after #3034 lands, it would make Home 1 tap); always linking Back to the list (would drop growers who came from a plant or the Timeline).
commands: bunx vitest run src/test/saved-review-back-rules.test.ts src/test/ai-doctor-session-detail-back-dead-end.test.tsx src/test/mobile-nav.test.tsx src/test/tonight-tent-mobile-primary-nav.test.tsx --reporter=dot
files_touched: src/lib/savedReviewBackRules.ts, src/pages/AiDoctorSessionDetail.tsx, src/components/MobileNav.tsx, src/test/saved-review-back-rules.test.ts, src/test/ai-doctor-session-detail-back-dead-end.test.tsx, src/test/mobile-nav.test.tsx, src/test/tonight-tent-mobile-primary-nav.test.tsx (pin renegotiated: the Cultivation group now starts with Dashboard)
files_remaining: none planned
blockers: none
open_questions: none for this slice
gotchas: no schema, RLS, edge, auth, billing, migration or production change. Does not touch PlantDetail, Dashboard, Timeline, AppShell or Quick Log files (open PRs #3021 #3022 #3034 #3044 #3049 #3050 and the plant-page Quick Log thread own them).
links: friction list items 4 and 5 (2026-11-19 ranked list)
artifacts: PR checks on the draft PR
```
