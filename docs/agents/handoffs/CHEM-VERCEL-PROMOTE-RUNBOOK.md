### CHEM-VERCEL-PROMOTE-RUNBOOK

```text
TASK CHEM-VERCEL-PROMOTE-RUNBOOK  priority: publish-gate  status: CLOSED
goal: Explain current Deployment Checks and prepare the owner's production promotion and rollback runbook.
branch: codex/chem-vercel-promote-runbook
base: verdant-grow-diary
checkout: None; closed (merged). Historical: git fetch origin codex/chem-vercel-promote-runbook verdant-grow-diary && git switch codex/chem-vercel-promote-runbook && git merge origin/verdant-grow-diary
state: CLOSED (merged). Last recorded open state: Draft 4b1195e6d76e80135d6c89a69994c404d34b1b82 retains the Rolling Release/probe/cache/identifier repairs. At 21:28 CT all 35 required contexts SUCCESS and native local-backend job SUCCESS; root dependency audit FAIL. Current live identity matches deploy 95464496 after an external release, not a Codex promotion. Independent publish-gate acceptance remains NOT_MEASURED.
next_action: None; closed. Production delivery of this change is NOT_MEASURED here.
files: docs/agents/RUNBOOK_VERCEL_PROMOTE.md only.
blockers: Matthew controls Vercel checks configuration and production promotion; lockfile repair remains off-limits. No promotion by Codex.
artifacts: https://github.com/Verdant-OS/verdant-grow-diary/pull/1780; docs/agents/RUNBOOK_VERCEL_PROMOTE.md; deployment dpl_6SBqN5WCrZaK7RRd3nn3kDkQhhBt; live identity receipt in Downloads is supplemental only.
claimed_by: Codex, 2026-09-28 19:10 CT
last_updated: 2026-10-13 16:20 CT, by Claude (log maintenance on owner instruction; not a claim). Earlier entry: 2026-09-28 21:35 CT, by Codex
closure: #1780 merged as 21bc60f0874bdfe89bc08de55a1b0e2a3d890b27 at 2026-10-01 00:51:36 UTC from final head d29b5e41cecef498751d1a02391869ec51dd7b9f. Verified on the deploy branch with git merge-base --is-ancestor at 2026-10-13 16:20 CT.
reviewer_seat: Blue Dream (publish gate / P1)
```
