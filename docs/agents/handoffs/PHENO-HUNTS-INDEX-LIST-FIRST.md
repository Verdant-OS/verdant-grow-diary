# PHENO-HUNTS-INDEX-LIST-FIRST

```text
TASK PHENO-HUNTS-INDEX-LIST-FIRST  priority: other  status: CLOSED
closed: merged. #2836 merged into verdant-grow-diary on 2026-11-04 as c4551b46636da131288eda63515039f430fddd01 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Show the Pheno Hunts list before the keeper stability roll-up.
why: Live audit 2026-11-03 finding 10 (last sentence): Pheno Hunts opened with keeper summaries from audit/demo records before the active hunt list. Source: PhenoHuntsIndex rendered PhenoStabilityDashboard above the list. The roll-up reads every keeper the grower owns (RLS-scoped), so filtering would hide real records; the fix is order only.
branch: claude/pheno-hunts-index-order
base: verdant-grow-diary
checkout: git fetch origin claude/pheno-hunts-index-order verdant-grow-diary && git switch claude/pheno-hunts-index-order
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub
state: implementation and test committed.
current_step: draft PR open; reviewer and merge authority awaiting Matthew.
next_action: Matthew names the reviewer and merge gate; then mark ready and route.
post_merge_check: after Publish, open /pheno-hunts on https://verdantgrowdiary.com with the fixture account and confirm the hunt list appears before Keeper stability. NOT_MEASURED until live /version.json reports the merge SHA.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: Order only; no filtering of the grower's own records. The failed-read notice moves with the roll-up and its copy changes from "absence below" to "absence here".
tried_and_rejected: hiding demo/audit-named hunts (they are the grower's own data).
commands: bunx vitest run src/test/pheno-hunts-index-list-first.test.tsx --reporter=dot; NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck
files_touched: src/pages/PhenoHuntsIndex.tsx; src/test/pheno-hunts-index-list-first.test.tsx; docs/agents/HANDOFF_LOG.md
files_remaining: none for this slice
blockers: none
open_questions: reviewer and merge authority for this PR.
gotchas: commit with NODE_OPTIONS=--max-old-space-size=8192 (never --no-verify).
links: none
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03 18:15 CT, by Claude)
```
