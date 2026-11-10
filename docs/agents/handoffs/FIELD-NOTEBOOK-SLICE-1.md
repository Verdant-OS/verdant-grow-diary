TASK FIELD-NOTEBOOK-SLICE-1 priority: other status: OPEN
goal: Direction A field-notebook slice 1 — save outcomes, occurred_at on the note readback, no Quick Log auto-open, and the notebook card on the dashboard.
why: Owner approvals through Nov 9 2026 8:10 PM CT. PR #2922. Remote head before this commit is ecdd084a3c4a6284eaf8bf239855c0e47f691b11. This commit is local until the owner asks for a push.
branch: cursor/field-notebook-slice-1-4799
base: verdant-grow-diary
checkout: git fetch origin cursor/field-notebook-slice-1-4799 verdant-grow-diary && git switch cursor/field-notebook-slice-1-4799
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2922
head_sha: local commit on top of ecdd084a3c4a6284eaf8bf239855c0e47f691b11. Not pushed.
state: Ordinary sign-in with a saved Quick Log preference lands on /dashboard (DASHBOARD_WITHOUT_QUICK_LOG_ROUTE). opensQuickLog stays false. The eligible-plant branch still returns plantId, tentId, and growId. Explicit open=quick-log links still open. An uncertain save keeps the write blocked and offers only Check Timeline. There is no Retry and no resend. Check Timeline can confirm that attempt by a read-only select of grow_event_id from quicklog_idempotency for the signed-in user and the attempt key, then the existing grow_events read. A missing row, a failed read, or a tent or note mismatch stays uncertain. A spaces-only note disables Save and does not dispatch. countIncludesEntry accepts a production grouped-timeline array that contains the event id, and a numeric object count of zero still does not count.
current_step: local commit only. Do not push until the owner asks. Do not merge.
next_action: Owner decides whether to push this head and request review.
post_merge_check: NOT_MEASURED. After the notebook is live, sign in on https://verdantgrowdiary.com and confirm ordinary sign-in lands on the Dashboard with Quick Log closed, and a saved note shows the server time.
active_writer: Cursor cloud agent (this slice)
decisions: Drafts are in memory, one store per account. Reload persistence stays #2806. Pushed history through ecdd084a landed ordinary sign-in on /dashboard, replacing the earlier /grows/:id route. Approved locked assertions that expect "/dashboard" are auth-quick-log-start-redirect.test.tsx lines 178 and 209, quick-log-start-screen-plant.test.ts lines 50, 53, and 80, and returningSignInNoAutoOpen.test.ts line 35. This commit adds no locked-test edits. No migration, RLS, or RPC change. The idempotency read uses the existing owner SELECT policy.
tried_and_rejected: Offering Retry or a second action while the outcome is uncertain. Treating a missing idempotency row as proof the write failed. Resending an uncertain save.
commands: NODE_OPTIONS=--max-old-space-size=8192 bunx vitest run src/test/field-notebook.test.tsx src/test/field-notebook-identity-followups.test.tsx src/test/field-notebook-copilot-followups.test.tsx src/test/field-notebook-unverified-receipt.test.ts src/test/field-notebook-account-recovery.test.tsx src/test/field-notebook-review-fixes.test.ts src/test/field-notebook-outcome-rules.test.ts src/lib/fieldNotebookNoIdRetry.test.tsx src/lib/fieldNotebookUncertainAttempt.test.tsx src/lib/fieldNotebookDurbanFollowups.test.ts src/lib/fieldNotebookKeyAndEmptyNote.test.tsx src/lib/fieldNotebookArrayCacheCount.test.ts src/lib/fieldNotebookIdempotencyLookup.test.ts src/test/quick-log-start-screen-plant.test.ts src/test/start-screen-preferences.test.ts src/test/settings-start-screen-a11y.test.tsx src/test/settings-start-screen-control.test.tsx src/lib/returningSignInNoAutoOpen.test.ts src/test/app-shell-mobile-quick-log-routing.test.tsx src/test/auth-quick-log-start-redirect.test.tsx --reporter=dot
files_touched: src/lib/fieldNotebookFindService.ts; src/lib/fieldNotebookOutcomeRules.ts; src/lib/fieldNotebookReflection.ts; src/components/FieldNotebook.tsx; src/components/FieldNotebookMount.tsx; src/components/AppShell.tsx; src/lib/fieldNotebookKeyAndEmptyNote.test.tsx; src/lib/fieldNotebookArrayCacheCount.test.ts; src/lib/fieldNotebookIdempotencyLookup.test.ts; docs/agents/handoffs/FIELD-NOTEBOOK-SLICE-1.md
files_remaining: live sensor readings on the card, photo persistence, 393px and 200% evidence
blockers: #2806 still holds reload-safe drafts. Photo reload unproven.
open_questions: none for this head
gotchas: A GH013 rejection on push means stop. Do not retry. Do not edit scorer-locked tests. A missing idempotency row stays uncertain.
links: PR #2922; issue #2806; issue #2697
artifacts: none
reviewer_seat: Reviewer A (Sour Diesel) CHANGES at ecdd084a for the no-event-id Check Timeline block and the spaces-only Save, plus the reflection and handoff P2s
reviewer_sha: ecdd084a3c4a6284eaf8bf239855c0e47f691b11
session_state: no production access
claimed_by: Cursor cloud agent, 2026-11-09
owner: Cursor cloud agent
last_updated: 2026-11-09 20:10 CT, by Cursor cloud agent
resume here
