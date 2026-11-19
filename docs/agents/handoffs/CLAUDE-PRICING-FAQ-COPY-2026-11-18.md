# CLAUDE-PRICING-FAQ-COPY-2026-11-18

```text
TASK CLAUDE-PRICING-FAQ-COPY-2026-11-18  priority: P2  status: OPEN
goal: Two Pricing page FAQ answers match the product. "Does Verdant charge extra for AI Doctor?" names the one-time credit packs (50 for $9, 150 for $19) instead of saying there are no à-la-carte AI charges. "Can I cancel anytime?" says paid features last to the end of the paid period, then the account moves to Free, instead of promising read-only access to logs.
why: The 2026-11-18 help center conflict check found both answers contradict the code: CREDIT_PACKS in src/constants/pricing.ts sells packs to Pro, Craft and existing Founder, and no read-only mode exists (Settings says "access continues until the end of your current period"). Matthew chose "Help pages only" (2026-11-17) and then asked "Fix the Pricing page" (2026-11-18 06:31 UTC, via coordinator relay).
branch: claude/project-thread-47u2lz
base: verdant-grow-diary at facf9154922011055a86fa6c81bcffe3d3df5403
checkout: /home/user/verdant-grow-diary
pr: draft, opened after the first push
head_sha: see the PR; this file is committed in the same commit it describes
state: pushed; draft PR open; required checks running; no independent review yet
current_step: waiting on required CI at the PR head
next_action: (1) 35/35 required checks green at the PR head; (2) one independent exact-head review by a session that did not write this; (3) Matthew's per-item yes naming the PR and full head SHA, then the Merge Steward queues it.
post_merge_check: after live /version.json reports the merge SHA, open https://verdantgrowdiary.com/pricing, expand both FAQ answers and expect the credit-pack sentence and the end-of-billing-period sentence; view source and expect the same cancel sentence in the FAQPage JSON-LD.
active_writer: Claude thread session for the help center conflicts task
decisions: (1) Copy only, two answers only. The AI answer keeps every included-credit fact and adds the pack prices from CREDIT_PACKS. (2) The cancel answer is changed in both places it lives in Pricing.tsx (accordion and FAQPage JSON-LD array) so the visible FAQ and structured data stay identical. (3) A new test file instead of editing scorer-locked pricing tests; it carries a @source-scan-justified header because the cancel answer is not exported.
tried_and_rejected: Editing src/test/pricing.test.ts or verdant-seo-landing-copy.test.ts (locked; neither pins the changed text, so no change needed).
not_in_scope: Terms of Service, homepage copy, VPD ranges, any pricing numbers, checkout or entitlement logic. PRs #3003 and #3004 untouched.
commands: bunx vitest run src/test/pricing-faq-cancel-and-credit-packs-copy.test.ts src/test/pricing.test.ts src/test/verdant-seo-landing-copy.test.ts --reporter=dot ; bun run typecheck ; bunx prettier --check src/constants/verdantSeoCopy.ts src/pages/Pricing.tsx src/test/pricing-faq-cancel-and-credit-packs-copy.test.ts
red_proof_recipe: git diff origin/verdant-grow-diary -- src/constants/verdantSeoCopy.ts src/pages/Pricing.tsx > x.patch && git apply -R x.patch ; run the new test, expect 6 of 10 assertions to fail ; git apply x.patch
tests: new src/test/pricing-faq-cancel-and-credit-packs-copy.test.ts (6 tests, 10 assertions). Local vitest and typecheck BLOCKED (no node_modules; frozen install 403s on the Lovable registry mirror). A bun mirror of the same assertions ran 4 pass / 6 fail before the copy change and 10 pass / 0 fail after. prettier --check PASS on all three files. CI is the evidence for this head.
files_touched: src/constants/verdantSeoCopy.ts; src/pages/Pricing.tsx; src/test/pricing-faq-cancel-and-credit-packs-copy.test.ts (new); this file
files_remaining: none for this slice
blockers: local checks BLOCKED as above. No npm fallback used, per AGENTS.md section 16.
open_questions: none
gotchas: The cancel answer exists twice in Pricing.tsx; change both or the JSON-LD and the visible FAQ disagree.
links: help center conflict report in the Claude thread "Check the code behind the help center conflicts"
artifacts: none
reviewer_seat: not yet requested; requested once required checks are green
reviewer_sha: none
session_state: no routines, no paused workflows. Pending human decisions: Matthew's merge yes after review.
claimed_by: Claude thread session for the help center conflicts task, 2026-11-18 06:40 UTC
owner: Claude thread session for the help center conflicts task
last_updated: 2026-11-18 06:40 UTC, by the Claude thread session for the help center conflicts task
```
