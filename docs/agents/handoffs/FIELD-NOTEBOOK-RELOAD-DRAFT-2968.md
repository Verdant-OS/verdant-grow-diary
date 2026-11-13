TASK FIELD-NOTEBOOK-RELOAD-DRAFT-2968 priority: P2 status: OPEN
goal: Keep an unsaved Field Notebook observation through a full page reload for the signed-in owner, and clear it on sign-out and successful save.
why: #2968. The #2922 draft lived only in memory, so a typed URL to /pricing and back emptied Observation.
branch: cursor/notebook-draft-reload-33b8
base: verdant-grow-diary
pr: see the pull request opened for this branch
head_sha: recorded on the pull request after push
state: implemented
current_step: tests and typecheck passed locally
next_action: independent exact-head review; do not enqueue or merge
post_merge_check: signed-in dashboard notebook still shows an unsaved observation after a full load of /pricing and back, and a second account does not see it
active_writer: cursor cloud agent
decisions: persist only editing-phase note text plus owner id in sessionStorage under verdant:field-notebook-unsaved:<userId>. Uncertain, saving, and saved phases are not stored, so Save again, retracted-key, and offline recovery stay in memory. adoptNotebookSessionOwner(null) and a live owner change drop the previous owner's key. clearNotebookSession drops every key with that prefix. forgetNotebookMemory still drops memory only so a reload can be simulated.
tried_and_rejected: persisting the full NotebookDraft, which would store idempotency keys and change uncertain restore.
commands: bunx vitest run src/test/field-notebook-reload-draft.test.ts src/lib/fieldNotebookOwnerMount.test.tsx src/lib/fieldNotebookUncertainAttempt.test.tsx src/lib/fieldNotebookSaveAgainRecovery.test.tsx src/lib/fieldNotebookKeyAndEmptyNote.test.tsx src/test/field-notebook-copilot-followups.test.tsx --reporter=dot; bun run typecheck
files_touched: src/lib/fieldNotebookSession.ts src/test/field-notebook-reload-draft.test.ts docs/agents/handoffs/FIELD-NOTEBOOK-RELOAD-DRAFT-2968.md
files_remaining: none
blockers: none
open_questions: none
gotchas: Pricing.tsx and auth files stay untouched. Do not persist attempt or idempotency fields.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/2968
artifacts: local vitest 29 passed / 0 failed; tsc exit 0
reviewer_seat:
reviewer_sha:
session_state: cursor cloud agent
claimed_by: cursor cloud agent 2026-11-12
owner: cursor cloud agent
last_updated: 2026-11-12 18:45 CT, by cursor cloud agent
