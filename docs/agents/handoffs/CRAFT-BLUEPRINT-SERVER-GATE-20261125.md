# CRAFT-BLUEPRINT-SERVER-GATE-20261125

```text
TASK CRAFT-BLUEPRINT-SERVER-GATE-20261125  priority: P2  status: OPEN
goal: Blueprint overlay unlocks only after a server check confirms a Craft or Founder plan for the signed-in user, not on the client entitlement hint alone.
why: Craft checkout plan (Matthew, 2026-11-24, "Execute"). Lovable wrote this change as 04f3de340117026ab3454d844d400747dfc0e38b on lovable-sync-1795506858, a side branch that also swapped the payment client tokens; it never reached verdant-grow-diary. Lovable then declined to re-apply it (its project rules forbid app code edits) and pointed to the normal GitHub route.
branch: claude/project-thread-l98mix
base: verdant-grow-diary at d4bf3acbb (#3081)
checkout: git fetch origin claude/project-thread-l98mix && git switch claude/project-thread-l98mix
pr: #3094 (ready for review, not draft)
head_sha: read from the PR
state: PR #3094 out of draft (Matthew said yes, 2026-11-24 8:34 PM CT); CI is the first evidence. First ready run failed shard 15: src/test/blueprint-evidence-truth.test.tsx rendered the section without a query client after the server gate landed; fixed by mocking useBlueprintServerAccess there (commit 274e2e55b).
current_step: waiting on CI and review
next_action: (1) 35/35 required checks at the head; (2) one independent exact-head review from an eligible reviewer (exclude this Claude session, the porter; exclude Lovable/gpt-engineer-app, the original author); (3) Matthew's unlock of the two locked test edits (see scorer_lock); (4) Matthew's per-item yes naming the PR and full SHA; the Merge Steward queues it.
post_merge_check: after live /version.json reports the merge SHA, a Free or Pro account sees the locked Blueprint teaser on a plant page and the getBlueprintAccess server function answers allowed:false; a Craft or Founder account sees the overlay.
active_writer: Claude (thread cmsg_01P7pGxx3V5wxVuLXvJUxaGsAysC87qsZGRyxG4Wce3BR9)
decisions: (1) Port 04f3de340's src/ changes byte for byte (git apply, clean on d4bf3acbb). (2) Leave out every other change on that side branch: .env tokens, generated types, .lovable files. (3) No schema, RLS, edge function, secret, Stripe or Paddle change.
behavior_change: Blueprint shows nothing while the server answers and stays locked unless the server allows it. Free and Pro behave as before (locked teaser).
not_in_scope: Craft Paddle prices and secrets (waiting on Matthew, and on Paddle's answer about grower customers); checkout code (already handles Craft); the sensor snapshot query running for the locked teaser.
scorer_lock: two existing locked test files are edited and need Matthew's unlock: src/test/plant-blueprint-overlay-section.test.tsx (adds a server-access mock and one new deny case; no existing assertion changed) and src/test/blueprint-evidence-truth.test.tsx (adds a server-access mock that mirrors the client entitlement, because the section now waits on the server gate; its evidence assertions are unchanged).
tests (6): new src/test/blueprint-access-rules.test.ts, src/test/get-paddle-price-craft-catalog.test.ts, src/test/paddle-craft-plan-mapping.test.ts, src/test/use-blueprint-server-access.test.tsx; updated src/test/plant-blueprint-overlay-section.test.tsx, src/test/blueprint-evidence-truth.test.tsx. Known weak spot: the credit-pack replay case asserts at most one grant, so it also passes if none is granted.
not_measured: every test, typecheck, lint and build locally BLOCKED (bun install --frozen-lockfile: ProxyConnectFailed 403 on mirror tarballs; no npm fallback used). Lovable reported 160 passed on these files at 04f3de340; that is Lovable's claim, not evidence here. CI is the evidence.
commands: bunx vitest run src/test/blueprint-access-rules.test.ts src/test/get-paddle-price-craft-catalog.test.ts src/test/paddle-craft-plan-mapping.test.ts src/test/plant-blueprint-overlay-section.test.tsx; bun run typecheck
files_touched (11): src/components/PlantBlueprintOverlaySection.tsx; src/hooks/useBlueprintServerAccess.ts; src/lib/blueprintAccess.functions.ts; src/lib/blueprintAccessRules.ts; the six tests above; this handoff file
files_remaining: none for this slice
blockers: local dependency install (see not_measured)
open_questions: tighten the credit-pack replay test to assert exactly one grant (separate slice).
links: 04f3de340117026ab3454d844d400747dfc0e38b
reviewer_seat: not yet requested
reviewer_sha: none
session_state: this thread is subscribed to the PR. No routines, no paused workflows. Pending human decisions: merge yes; Craft price IDs.
claimed_by: Claude (this thread), 2026-11-25
owner: Claude (this thread)
last_updated: 2026-11-25, by Claude (this thread)
```
