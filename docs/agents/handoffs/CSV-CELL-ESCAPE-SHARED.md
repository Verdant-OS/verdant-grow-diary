# CSV-CELL-ESCAPE-SHARED

```text
TASK CSV-CELL-ESCAPE-SHARED  priority: other  status: OPEN
goal: Every grower-facing CSV export neutralizes spreadsheet formula triggers while numeric cells stay numeric.
why: Deep audit 2026-11-05 at deploy tip e4c2fc02dda02d28bab3529f62ba311df6570a57, finding F-03. aiDoctorEvidenceCsvExportRules.csvEscape and growHelpToolkitExport.escapeCsv quoted commas and quotes but let a cell starting with =, +, -, @, tab or CR through, so a grower's own note or cycle name could run as a formula when the export opens in Excel or Sheets. sensorChartExport and athenaFeedLogRules already guarded this; the two exports did not.
branch: claude/csv-cell-escape
base: verdant-grow-diary
checkout: git fetch origin claude/csv-cell-escape verdant-grow-diary && git switch claude/csv-cell-escape
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub
state: pushed draft
current_step: draft PR open; Matthew lifted the GitHub posting hold and approved pushing this branch 2026-11-05; reviewer routing pending.
next_action: route an eligible independent reviewer under OWNERSHIP.md §4.3 (no existing test edited; Graft low-risk lane applies if Graft did not author or repair).
post_merge_check: export the AI Doctor evidence CSV and the Grow Help Toolkit CSV from https://verdantgrowdiary.com with a note starting "=" and confirm the cell opens as text. NOT_MEASURED until live /version.json reports the merge SHA.
active_writer: Claude session_017UoYKy4m7tV5CyJMwrFb2X
decisions: One pure helper src/lib/csvCellEscapeRules.ts (escapeCsvCell) with the athenaFeedLogRules semantics: numbers and plain numeric strings pass through so negative deltas stay numeric; = @ tab CR and non-numeric +/- strings get a leading apostrophe; commas, quotes, CR, LF are quoted. The AI Doctor export still redacts before escaping. sensorChartExport and athenaFeedLogRules were deliberately not consolidated in this slice (scope stays on the two unguarded exports); a follow-up may point them at the shared helper.
tried_and_rejected: importing athenaFeedLogRules.escapeCsvField into the exports (couples unrelated domains); a regex over the generated CSV as the only test (asserting exact cells is clearer).
commands: bunx vitest run src/test/csv-cell-escape-rules.test.ts src/test/export-redaction-rules.test.ts src/test/ai-doctor-evidence-citation-a11y.test.tsx src/test/grow-help-toolkit-p2-readiness.test.ts src/test/qa-2195-graft-review-fixes.test.tsx --reporter=dot; NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck
files_touched: src/lib/csvCellEscapeRules.ts (new); src/lib/aiDoctorEvidenceCsvExportRules.ts; src/lib/growHelpToolkitExport.ts; src/test/csv-cell-escape-rules.test.ts (new, RED before the fix: 2 of 5 failing once the helper existed, import failure before that); docs/agents/handoffs/CSV-CELL-ESCAPE-SHARED.md
files_remaining: none for this slice
blockers: none
open_questions: none
gotchas: no locked scorer was edited (scorer-lock --report --strict: 0 changed scorers). Commit with NODE_OPTIONS=--max-old-space-size=8192; never --no-verify.
links: audit finding F-03
artifacts: none in the repository besides the test
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKy4m7tV5CyJMwrFb2X, 2026-11-05 09:15 UTC
owner: Claude
last_updated: 2026-11-05 03:45 CT, by Claude
```
