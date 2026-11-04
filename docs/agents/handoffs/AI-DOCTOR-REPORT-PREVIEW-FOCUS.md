### AI-DOCTOR-REPORT-PREVIEW-FOCUS

```text
TASK AI-DOCTOR-REPORT-PREVIEW-FOCUS  priority: other  status: OPEN
goal: The AI Doctor report preview (an aria-modal dialog) moves focus to its Close button on open and returns focus to Preview report on Close or Escape.
why: Grower UX audit 2026-11-03 finding 12 (keyboard): focus stayed on the opener behind the modal, so Tab walked the page underneath. The citation modal in the same file already does this.
branch: claude/ai-doctor-report-preview-focus
base: verdant-grow-diary
checkout: git fetch origin claude/ai-doctor-report-preview-focus verdant-grow-diary && git switch claude/ai-doctor-report-preview-focus
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: fix and test committed.
current_step: draft PR open.
next_action: route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ).
post_merge_check: on the live build, open AI Doctor Preview report with the keyboard; focus lands on Close; Escape returns focus to Preview report.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: copy the citation modal's pattern (focus Close on mount; return focus to the trigger in a microtask after unmount). No focus trap added; the other in-file modals have none either.
tried_and_rejected: none
commands: bunx vitest run src/test/ai-doctor-report-preview-focus.test.tsx
files_touched: src/components/AiDoctorDiagnosisPanel.tsx; src/test/ai-doctor-report-preview-focus.test.tsx; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none
open_questions: none
gotchas: Close is disabled while an export is pending; the dialog cannot close then, so focus return does not run.
links: audit finding 12 (private upload, not committed)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-03 18:30 CT, by Claude
```
