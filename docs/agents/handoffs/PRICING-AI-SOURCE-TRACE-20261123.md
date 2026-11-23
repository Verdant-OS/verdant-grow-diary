# PRICING-AI-SOURCE-TRACE-20261123

```text
TASK PRICING-AI-SOURCE-TRACE-20261123  priority: other  status: OPEN
goal: Trace why AI answers quote "$9.99/month or $39.99/year" for Verdant, and fix in-repo help/SEO surfaces that let AI guess. Why: a weekly AI-visibility report (Nov 16, repeated Nov 20) said 2 of 2 AI answers gave those prices, citing a different app.
branch: claude/project-thread-77re4e
base: verdant-grow-diary
pr: #3048 https://github.com/Verdant-OS/verdant-grow-diary/pull/3048
head_sha: 758bf1fb8e3c125b9b9f7b96886f02f3a13181d6 (first push, observed 2026-11-23); the review-fix commit that edits this line follows it, so read the live PR head for the current SHA
state: draft PR open; awaiting CI and an independent A/D/C review
decisions:
  - established fact (audited at base ab8826ac72220b9da1fcf3ef57b0740812e9561f): no Verdant product price of "$9.99" or "$39.99" appears in src, public, docs or supabase (`git grep '\$9\.99\|\$39\.99'` returns nothing), nor in /mnt/project-files/guides, live pages or live JSON-LD (live /pricing offers 0, 12, 99, 29, 249). The bare digits do appear incidentally in 43 files at that base (for example the historical "$19.99" note in docs/specs/stripe-live-checkout-plan.md and timestamp literals ending .999 in tests); none is a Verdant price. This file also quotes the prices it traces.
  - inference: AI borrows another app's prices because visible /pricing text never states the monthly $12 or $29, public/llms.txt had no prices, and /faq returns 404.
  - public/llms.txt now states the plan prices from src/constants/pricing.ts (Pro $12/mo or $99/yr; Craft $29/mo or $249/yr; credit packs 50 for $9, 150 for $19).
  - DiaryFaqLinkStatsPanel on /guides left as it was. It holds the only clear button and on/off switch for the local (localStorage-only) Related FAQ click counter, and that counter defaults to on, so removing the panel would leave recording with no reachable control (Copilot review on #3048). The empty-panel clutter on public /guides goes to the founder as a decision instead of being changed here.
  - src/pages/Pricing.tsx ("See toggle above") and src/constants/verdantSeoCopy.ts left alone: owned by open handoff CLAUDE-PRICING-FAQ-COPY-2026-11-18.
  - No billing, Paddle/Stripe, pricing.ts logic, Terms or homepage changes (founder: "Help pages only", Nov 17).
tried_and_rejected:
  - Removing DiaryFaqLinkStatsPanel from /guides (first push 758bf1fb): reverted, it removed the tracker's only controls, which this task did not ask to change.
  - Editing Pricing.tsx monthly copy directly: rejected, another open handoff owns that file.
commands:
  - git diff verdant-grow-diary -- public/llms.txt src/pages/GuidesIndex.tsx
  - git grep -n '\$9\.99\|\$39\.99' ab8826ac72220b9da1fcf3ef57b0740812e9561f -- src public docs supabase (no hits)
  - git grep -c '9\.99\|39\.99' ab8826ac72220b9da1fcf3ef57b0740812e9561f -- src public docs supabase (43 files, all incidental)
files_touched:
  - public/llms.txt
  - docs/agents/handoffs/PRICING-AI-SOURCE-TRACE-20261123.md
files_remaining: none in scope
blockers:
  - Local vitest/typecheck/lint BLOCKED: node_modules missing in this checkout. CI gates.
post_merge_check: live https://verdantgrowdiary.com/llms.txt shows the plan prices, and nothing else changed, once /version.json reports the merge SHA.
reviewer_seat: NOT_MEASURED (A/D/C review to be requested)
reviewer_sha: NOT_MEASURED
session_state: Claude thread session for "Trace where AI picks up the $9.99 price"; no routines; no paused workflows. Pending founder decisions: monthly prices on /pricing (other owner), /faq 404 redirect, report's TrolMaster claim, "Verdant vs My Grow" draft, pausing the weekly SEO draft.
claimed_by: Claude thread session (project-thread-77re4e)
last_updated: 2026-11-23
```
