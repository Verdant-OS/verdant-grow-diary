# PRICING-AI-SOURCE-TRACE-20261123

```text
TASK PRICING-AI-SOURCE-TRACE-20261123  priority: other  status: OPEN
goal: Trace why AI answers quote "$9.99/month or $39.99/year" for Verdant, and fix in-repo help/SEO surfaces that let AI guess. Why: a weekly AI-visibility report (Nov 16, repeated Nov 20) said 2 of 2 AI answers gave those prices, citing a different app.
branch: claude/project-thread-77re4e
base: verdant-grow-diary
pr: (set after open)
head_sha: (set after first push)
state: draft PR open; awaiting CI and an independent A/D/C review
decisions:
  - established fact: $9.99 and $39.99 appear nowhere in the repo, /mnt/project-files/guides, live pages or live JSON-LD (live /pricing offers 0, 12, 99, 29, 249).
  - inference: AI borrows another app's prices because visible /pricing text never states the monthly $12 or $29, public/llms.txt had no prices, and /faq returns 404.
  - public/llms.txt now states the plan prices from src/constants/pricing.ts (Pro $12/mo or $99/yr; Craft $29/mo or $249/yr; credit packs 50 for $9, 150 for $19).
  - Removed the empty operator DiaryFaqLinkStatsPanel from public /guides (it showed "No Related FAQ clicks recorded yet"). Removed rather than hidden; the component file is untouched.
  - src/pages/Pricing.tsx ("See toggle above") and src/constants/verdantSeoCopy.ts left alone: owned by open handoff CLAUDE-PRICING-FAQ-COPY-2026-11-18.
  - No billing, Paddle/Stripe, pricing.ts logic, Terms or homepage changes (founder: "Help pages only", Nov 17).
tried_and_rejected:
  - Editing Pricing.tsx monthly copy directly: rejected, another open handoff owns that file.
commands:
  - git diff verdant-grow-diary -- public/llms.txt src/pages/GuidesIndex.tsx
  - grep -rn '9\.99\|39\.99' src public docs supabase (no hits)
files_touched:
  - public/llms.txt
  - src/pages/GuidesIndex.tsx
  - docs/agents/handoffs/PRICING-AI-SOURCE-TRACE-20261123.md
files_remaining: none in scope
blockers:
  - Local vitest/typecheck/lint BLOCKED: node_modules missing in this checkout. CI gates.
post_merge_check: live https://verdantgrowdiary.com/llms.txt shows the plan prices, and live /guides shows no "Related FAQ clicks" panel, once /version.json reports the merge SHA.
reviewer_seat: NOT_MEASURED (A/D/C review to be requested)
reviewer_sha: NOT_MEASURED
session_state: Claude thread session for "Trace where AI picks up the $9.99 price"; no routines; no paused workflows. Pending founder decisions: monthly prices on /pricing (other owner), /faq 404 redirect, report's TrolMaster claim, "Verdant vs My Grow" draft, pausing the weekly SEO draft.
claimed_by: Claude thread session (project-thread-77re4e)
last_updated: 2026-11-23
```
