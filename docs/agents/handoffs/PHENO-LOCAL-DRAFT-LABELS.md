# PHENO-LOCAL-DRAFT-LABELS

```text
TASK PHENO-LOCAL-DRAFT-LABELS  priority: other  status: CLOSED
closed: merged. #2815 merged into verdant-grow-diary on 2026-11-03 as 0685ea0b07d282268fc442a69a4e087dd5da6c8e (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Name where each Pheno Hunt candidate save goes: device-only documentation becomes "Candidate documentation (this device only)" with an outline "Save draft on this device" button; the account save reads "Save to account".
why: Live audit 2026-11-03 finding 8: two identical primary Save buttons on a candidate card saved to different places (this browser vs the Verdant account).
branch: claude/pheno-local-draft-labels
base: verdant-grow-diary
checkout: git fetch origin claude/pheno-local-draft-labels verdant-grow-diary && git switch claude/pheno-local-draft-labels
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block rides the first commit)
state: implemented and tested locally; draft PR.
current_step: draft PR open.
next_action: Matthew names the reviewer and merge authority. Signed-in visual check of a candidate card is NOT_MEASURED.
post_merge_check: after Publish, open a fixture pheno hunt workspace on https://verdantgrowdiary.com and confirm the card shows "Save to account" and an outline "Save draft on this device" under "Candidate documentation (this device only)". NOT_MEASURED until live /version.json reports the merge SHA.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: Matthew chose "Draft + account" (2026-11-03). Copy only: no storage, sync, schema or RLS change; test ids unchanged. Account persistence for candidate documentation stays a separate founder decision (schema/RLS).
tried_and_rejected: leaving the error-state /^save$/i assertion as is (it would pass vacuously after the rename).
commands: bunx vitest run src/test/pheno-documentation-defaults.test.tsx src/test/pheno-hunt-workspace.test.tsx --reporter=dot
files_touched: src/constants/phenoSaveDestinationCopy.ts; src/components/PhenoDocumentationSections.tsx; src/pages/PhenoHuntWorkspace.tsx; src/test/pheno-documentation-defaults.test.tsx (pin renegotiated, declared); src/test/pheno-hunt-workspace.test.tsx (pin renegotiated, declared; new label test); docs/agents/HANDOFF_LOG.md
files_remaining: none for this slice
blockers: none
open_questions: none
gotchas: both test files were unlocked with scripts/scorer-lock.mjs --unlock (reasons recorded); re-lock after commit.
links: audit finding 8 (private upload, not committed)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-03
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03, by Claude)
```
