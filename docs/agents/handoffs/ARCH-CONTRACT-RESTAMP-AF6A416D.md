# ARCH-CONTRACT-RESTAMP-AF6A416D

```text
TASK ARCH-CONTRACT-RESTAMP-AF6A416D  priority: other  status: OPEN
goal: docs-only §15 re-verification of docs/architecture-contract.md from stamp 479cadb3032ddc3ad80d93f105283609179d6c0a to deploy tip af6a416d5d1cc99c22b2ba3677f2b0e191e9edb5; no application code, no governance file.
why: 81 first-parent merges since the 479cadb3 stamp changed 26 cited files, including src/server.ts (#2539, #2777), the Stripe lane removal (#2811) and a new runtime Supabase-client import in a *Rules.ts file (#2758); the founder approved the restamp slice once #2811 resolved.
branch: claude/architecture-contract-restamp-af6a416d
base: verdant-grow-diary (merged in at cae980f53c938c45dc260f9ced13fb38e5b3e242, #2860)
checkout: git fetch origin claude/architecture-contract-restamp-af6a416d verdant-grow-diary && git switch claude/architecture-contract-restamp-af6a416d && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2864 (draft)
head_sha: the base merge of cae980f5 into 8ecd0d45a441e22e62c0058d6bda3266ca265b70. A commit cannot name its own SHA; read the PR head. Earlier heads: 3b543d1304a4c1529fa5a6602499a1ba934f2b31, 8ecd0d45a441e22e62c0058d6bda3266ca265b70 (neither reviewed).
state: pushed draft
current_step: #2860 merged and conflicted in HANDOFF_LOG.md. Merged the base, took the base side of HANDOFF_LOG.md, and moved this block into docs/agents/handoffs/ARCH-CONTRACT-RESTAMP-AF6A416D.md under #2860's rule. The contract stays stamped at af6a416d: the 25 files changed on the base since then are AGENTS.md, CLAUDE.md and other governance/handoff files, and the contract's mentions describe the stamped tree (§15). Independent review routed to a non-contributing Grok session (issuecomment-6626952234); no claim yet.
next_action: Grok, or the named fallback Reviewer D if Matthew approves the transfer, reviews the current head. An authorized seat marks the PR ready so the 32 required shards run. If the deploy tip moves again, merge it and confirm this file is unchanged.
post_merge_check: on the merged deploy tip, `git show origin/verdant-grow-diary:docs/architecture-contract.md | head -4` names af6a416d5d1cc99c22b2ba3677f2b0e191e9edb5, and docs/agents/handoffs/ARCH-CONTRACT-RESTAMP-AF6A416D.md exists
active_writer: Claude session_017UoYKywiErQ3bEQMo9dYGe
decisions: (1) stamp records in the header and §15.1 describe their own trees and stay as written (§15), except the 479cadb3 record's "describes" became "described" when it was demoted, matching the 27991451 record; (2) the runtime Supabase-client import in src/lib/cultivarSlugRouteRules.ts is recorded as AC-3.2 drift, not fixed: moving it into a *Service.ts is code, and correcting CLAUDE.md's "no root-level *Rules.ts imports the client" is a governance edit with the 18-file Sentinel bump; (3) AC-6.1 labels the Lovable Stripe route (/api/public/payments/webhook, billing_provider) a source claim because git grep finds neither on the deploy tree at af6a416d; (4) the AC-4.3 third figure is defined as a stale/invalid pair in either order, the only reading that reproduces 106/86 at 479cadb3; (5) the release-topology cite :1017 is unchanged at af6a416d and stays; PR #2858 may move it, and whichever lands second re-points it.
tried_and_rejected: counting only the "stale" | "invalid" order for AC-4.3 (gives 102/84 at 479cadb3, not the recorded 106/86); re-pointing src/pages/Pricing.tsx:316 (it is history pinned to 27991451)
commands: VERIFIED_SHA=<head> per the checkout line; git diff --name-only 479cadb3032ddc3ad80d93f105283609179d6c0a af6a416d5d1cc99c22b2ba3677f2b0e191e9edb5 | wc -l (573); for each SHA, git archive <sha> src supabase scripts e2e tools plugins spikes | tar -x -C <dir>, then count ls src/lib/*Rules.ts, grep -l "Date.now()" / "Math.random()" (comments stripped for the executable rows), grep 'from "@/integrations/supabase/client"', grep -c 'from "@/lib/react-router-compat"' over src, the AC-4.3 overlapping adjacent-pair scan, and the AC-10.2 case-insensitive pattern over seven roots; ./node_modules/.bin/prettier --check docs/architecture-contract.md docs/agents/HANDOFF_LOG.md; node scripts/assert-docs-safety.mjs
files_touched: docs/architecture-contract.md; docs/agents/handoffs/ARCH-CONTRACT-RESTAMP-AF6A416D.md (this file). HANDOFF_LOG.md equals the base.
files_remaining: none in this slice. Follow-ups for other slices: CLAUDE.md and docs/codebase-map.md wording on runtime Supabase-client importers in *Rules.ts; moving the cultivarSlugRouteRules.ts read into a service
blockers: independent exact-head review; 35/35 required checks; founder's per-item yes at the exact head
open_questions: whether ServiceUnavailablePage's cultivar-specific copy on every SSR 503 is intended (src/lib/serviceUnavailablePage.ts:11,24-25); where the Lovable Stripe route lives, since the deploy tree does not hold it
gotchas: Since #2860 this entry lives in its own file, so base merges no longer touch it; still confirm it after any merge. The script that relocates cites skips cites without a directory (for example Settings.tsx:341) and bare :NN list items; re-read those by hand. node_modules in the scratchpad worktree is a symlink: stage with explicit paths, not git add -A. Commits need NODE_OPTIONS=--max-old-space-size=8192 for the pre-commit full tsc.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2864
artifacts: docs/architecture-contract.md header stamp and §15.1 row dated 2026-11-04
reviewer_seat: route to a non-contributing Grok session; excluded as author: Claude session_017UoYKywiErQ3bEQMo9dYGe
reviewer_sha: none yet
session_state: Claude session_017UoYKywiErQ3bEQMo9dYGe holds the branch and is subscribed to the PR; no paused workflows; pending human decision: founder per-item yes at the reviewed head
claimed_by: Claude session_017UoYKywiErQ3bEQMo9dYGe, 2026-11-04
owner: Claude session_017UoYKywiErQ3bEQMo9dYGe
last_updated: 2026-11-04 10:00 UTC, by Claude session_017UoYKywiErQ3bEQMo9dYGe
```
