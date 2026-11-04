### AI-DOCTOR-READINESS-SUMMARY-IMPL

```text
TASK AI-DOCTOR-READINESS-SUMMARY-IMPL  priority: other  status: CLOSED
goal: Implement the one-summary AI Doctor readiness card on Plant Detail per docs/specs/ai-doctor-readiness-single-summary.md (spec PR #2809).
why: Live audit 2026-11-03 finding 3. Plant Detail shows readiness from six rule sets that can disagree.
branch: claude/ai-doctor-readiness-summary (Matthew chose a separate branch, 2026-11-03)
base: verdant-grow-diary
checkout: git fetch origin claude/ai-doctor-readiness-summary verdant-grow-diary && git switch claude/ai-doctor-readiness-summary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2810 (merged)
head_sha: 89f4952fa36542b15bd397d718023a25308d636a (final PR head)
state: CLOSED (merged). #2810 squash-merged through the merge queue as 7ca284b9490cb5a6c30a7cc356b967eb62d4f58a on 2026-11-03 at 20:44 UTC.
current_step: none; closed
next_action: None; closed. post_merge_check below stays with this owner; a live failure reopens it.
post_merge_check: after Publish, open a plant's AI review on https://verdantgrowdiary.com with the fixture account. Exactly one readiness verdict is visible before a review starts. NOT_MEASURED until live /version.json reports the merge SHA.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: D1 keep local preview collapsed; D2 overview copy is a later slice; D3 C stays visible with its pre-start confidence line hidden on Plant Detail.
tried_and_rejected: hiding C in the disclosure (it owns the Start review control).
commands: bunx vitest run src/test/ai-doctor-readiness-summary-rules.test.ts --reporter=dot; NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck
files_touched: src/lib/aiDoctorReadinessSummaryRules.ts; src/constants/aiDoctorReadinessSummaryCopy.ts; src/components/AiDoctorReadinessSummary.tsx; src/components/PlantDetailAiDoctorReadinessSection.tsx; src/components/PlantDetailAiDoctorReadiness.tsx; src/components/AiDoctorContextReadinessPanel.tsx; src/components/PlantDetailAiDoctorContextReadinessMount.tsx; src/components/PlantDetailAiDoctorLiveReview.tsx; src/pages/PlantDetail.tsx; src/test/ai-doctor-readiness-summary-rules.test.ts; src/test/ai-doctor-readiness-signal-props.test.tsx; src/test/ai-doctor-live-review-readiness-signal.test.tsx; src/test/ai-doctor-readiness-summary-section.test.tsx; src/test/plant-detail-information-architecture.test.ts (3 structure pins renegotiated); docs/agents/HANDOFF_LOG.md
files_remaining: none for this slice
blockers: none
open_questions: none
gotchas: the pre-commit full-project tsc runs out of memory at the default heap; commit with NODE_OPTIONS=--max-old-space-size=8192 (never --no-verify). Prettier runs on staged .md files.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2809
artifacts: none
reviewer_seat: Grok (verdant-ultra-bot), independent of this Claude session
reviewer_sha: 89f4952fa36542b15bd397d718023a25308d636a, APPROVE by verdant-ultra-bot (Grok) 2026-11-03 20:38 UTC (an earlier approval at c3a0ae2 was dismissed by the next push)
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-03
closure: merged as 7ca284b9490cb5a6c30a7cc356b967eb62d4f58a (#2810)
owner: Claude
last_updated: 2026-11-03, by Claude (closed in the water-volume spec PR)
```
