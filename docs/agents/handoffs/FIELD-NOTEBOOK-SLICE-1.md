TASK FIELD-NOTEBOOK-SLICE-1 priority: other status: OPEN
goal: Direction A field-notebook slice 1 — save outcomes, occurred_at on the note readback, no Quick Log auto-open, and the notebook card on the dashboard.
why: Owner approvals through Nov 9 2026 3:42 PM CT. PR #2922 is ready for review at the pushed f9123764 head. This local commit fixes two of the three CI shard failures and does not push.
branch: cursor/field-notebook-slice-1-4799
base: verdant-grow-diary
checkout: git fetch origin cursor/field-notebook-slice-1-4799 verdant-grow-diary && git switch cursor/field-notebook-slice-1-4799
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2922 (ready for review at f9123764; this local head is not pushed)
head_sha: local commit on top of f9123764dd4b43d9266d9bb6b4f62e8316feff64. Not pushed.
state: Guide or activity prefill is stored and Quick Log stays closed. Timeline and home links use timelinePath and withGrowId. The Quick Log save-caller inventory still omits FieldNotebookMount.
current_step: local commit only. Do not push until the owner asks. Do not edit the PR body, labels, or reviewers.
next_action: Owner decides whether to push this local head.
post_merge_check: NOT_MEASURED. After the notebook is live, sign in on https://verdantgrowdiary.com and confirm Quick Log does not auto-open and a saved note shows the server time.
active_writer: Cursor cloud agent (this slice)
decisions: Drafts are in memory, one store per account, cleared by the auth identity fence. A late write from the previous account is dropped. Reload persistence stays #2806. J1 keeps editor text that differs from the submitted note. Timeline links use client navigation. Last Activity matches grow-event-${id} to the raw grow event id, not a diary id. An empty grouped-timeline cache is created with fetchQuery for the saved tent. A remounted card subscribes to the session, so a save that finishes after unmount leaves Saving. A failed note readback keeps the RPC id and stays uncertain because occurred_at is empty. An id mismatch still returns receipt_unverified without an id. Back to note sets recoverySurface to grow and navigates to /. Receipt compare uses the trimmed note; the editor keeps the raw snapshot.
tried_and_rejected: Editing locked Daily Check or notebook tests. New coverage includes src/test/field-notebook-identity-followups.test.tsx for the 3:09 PM findings.
commands: NODE_OPTIONS=--max-old-space-size=8192 bunx vitest run src/test/daily-check-_.test.ts src/test/daily-check-_.test.tsx src/test/app-shell-_.test.ts src/test/app-shell-_.test.tsx src/test/field-notebook.test.tsx src/test/field-notebook-outcome-rules.test.ts src/test/field-notebook-review-fixes.test.ts src/test/field-notebook-account-recovery.test.tsx src/test/quick-log-draft-preview-view-model.test.ts src/test/quick-log-failed-save-retry.test.tsx src/test/quicklog-shared-in-flight-coordination.test.tsx src/test/v0-operating-loop-contract.test.ts --reporter=dot
files_touched: src/lib/fieldNotebookOutcomeRules.ts; src/components/FieldNotebook.tsx; src/components/FieldNotebookTimelineRecovery.tsx; src/test/field-notebook-identity-followups.test.tsx
files_remaining: live sensor readings on the card, photo persistence, 393px and 200% evidence
blockers: #2806 still holds reload-safe drafts. Photo reload unproven. Shard 12 stays red until src/test/funnel-events-wiring.test.ts adds FieldNotebookMount with telemetryIntent null. That file is a scorer; this task did not edit it.
open_questions: none for this head
gotchas: A GH013 rejection on push means stop. Do not retry. Do not edit scorer-locked tests.
links: PR #2922; issue #2806; issue #2697
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Cursor cloud agent, 2026-11-09
owner: Cursor cloud agent
last_updated: 2026-11-09 16:50 CT, by Cursor cloud agent
resume here
