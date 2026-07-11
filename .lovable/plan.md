
# Slice 4 — Reality Check + Proposed Sub-Slice Order

Slice 4 as written is 5+ product features plus a Playwright execution stage. Shipping all of it in a single turn would either produce a broken UI (untested selectors wired into ActionDetail) or a dishonest "PASS" claim. I want to break it into safe additive sub-slices you approve one at a time, matching the additive slice discipline you've been enforcing.

## Audit findings (already on disk)

- `src/lib/actionFollowUpEvidenceViewModel.ts` already exports `actionFollowupTimelineLabel(details)` — this is the shared outcome-label helper Slice 4 wants. It just isn't imported everywhere yet.
- Diary/timeline surfaces that currently render `action_followup`:
  - `src/lib/diaryTimelineViewModel.ts`
  - `src/lib/growDiaryTimelineRules.ts`
  - `src/lib/timelineEntryClassification.ts`
  - `src/lib/timelineEvidenceDetailViewModel.ts`
  - `src/lib/quickLogHistoryRules.ts`
  - `src/components/DiaryEntryBadges.tsx`
  - `src/pages/Timeline.tsx`
  - `src/hooks/useOneTentLiveProofTimelineFollowup.ts`
- No report/PDF builder currently branches on `action_followup` outcome — the "report/export" section of the spec is speculative until we confirm a surface exists.
- `ActionFollowUpEvidenceForm` currently exposes outcome/note/observedAt only. `photoReference` and `sensorSnapshotId` are already in the draft type and service payload — the persistence path accepts them, the UI does not emit them yet.
- `ActionFollowUpEvidenceCard` renders a Manual sensor badge only when `sensorSnapshotId` is present, but does not resolve the snapshot or render a photo.

## Proposed sub-slices

**Slice 4a — Shared outcome-label helper + diary/timeline summary integration**
- Promote `actionFollowupTimelineLabel` to a named exported helper (`actionFollowUpOutcomeLabel`) plus keep the legacy alias.
- Wire it into the diary/timeline surfaces listed above so `Follow-up · <Outcome>` renders everywhere the marker currently renders.
- Legacy marker-only rows continue to render `Follow-up`.
- Tests: extend `action-followup-timeline-visibility` + `diary-timeline-polish` with outcome-label cases.
- No new UI selectors, no photo/sensor changes, no schema changes.

**Slice 4b — Optional manual sensor snapshot association**
- Read-only candidate query (authenticated client, `source = manual`, scoped to grow/tent/plant).
- Extend form + view model + card to associate an existing manual snapshot ID.
- Failure of the candidate query never blocks the core save (passes `sensorSnapshotId: null`).
- Tests: candidate scope, exclusions (live/csv/demo/stale/invalid/cross-user), card renders Manual, unavailable copy.

**Slice 4c — Optional existing-photo association**
- Reuse existing durable-reference validator + signed-URL resolver.
- Candidate query scoped to grow/plant; no uploader, no bucket, no new object.
- Card renders through the approved resolver; raw `storage://` never shown; unavailable copy on resolution failure.
- Tests: durable-reference-only, cross-user/wrong-bucket rejection, no upload path invoked.

**Slice 4d — Managed-session preflight + authenticated Playwright execution**
- Run `bun run e2e:one-tent:preflight`.
- If READY → seed + UI walk + capture receipts.
- If BLOCKED → emit the deterministic BLOCKED receipt exactly as specified; do not fabricate login.
- Update `docs/one-tent-loop-golden-path.md` with the honest matrix at the end.

## What I would explicitly NOT do inside any sub-slice

- No new photo upload controls, buckets, or signed-URL persistence.
- No sensor creation/ingest/CSV path from the form.
- No schema, RLS, migration, or Edge Function changes.
- No automatic follow-up creation, AI-generated outcomes, or device commands.
- No broad ActionDetail or timeline redesign.
- No fabricated Playwright login; BLOCKED is a legitimate outcome.
- No "report/export" edits until we confirm a real report surface renders `action_followup` — otherwise Slice 4a alone covers "diary/report summary" honestly.

## Ask

Which sub-slice should I ship in the next turn?

1. Slice 4a only (shared label + diary/timeline summaries) — smallest, safest, unblocks the summary tests.
2. Slice 4a + 4d (label + preflight/Playwright) — proves the summary end-to-end when managed auth is ready.
3. Slice 4b (manual sensor association) — additive UI + candidate query.
4. Slice 4c (existing-photo association) — additive UI + resolver reuse.
5. All four, sequentially, one turn per slice, with an honest matrix update at each step.

Default recommendation: **option 5**, starting with 4a next turn.
