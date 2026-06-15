# QA Checklist: Manual Sensor Snapshot Quality

Use this checklist when verifying the Manual Sensor Snapshot quality badge
and its integration with AI Doctor context readiness. All items should pass
before signing off on a release that touches sensor snapshot or readiness
surfaces.

## Current snapshot quality by source

- [ ] Valid manual snapshot with good values → quality badge shows **Usable**.
- [ ] Valid live snapshot with good values → quality badge shows **Usable**.
- [ ] CSV-only history → no current snapshot badge, or badge shows
      **history-only / not current**.
- [ ] Demo source snapshot → **not current** (cannot support current-room decisions).
- [ ] Stale source snapshot → **not current** (cannot support current-room decisions).
- [ ] Invalid source snapshot → **not current** (cannot support current-room decisions).
- [ ] Unknown source snapshot → **not current** (cannot support current-room decisions).
- [ ] Missing snapshot entirely → badge shows **missing** current reading.

## Suspicious-value flagging

- [ ] Humidity stuck at 0 % → flagged **invalid** or **needs review**.
- [ ] Humidity stuck at 100 % → flagged **invalid** or **needs review**.
- [ ] Soil moisture stuck at 0 % → flagged **invalid** or **needs review**.
- [ ] Soil moisture stuck at 100 % → flagged **invalid** or **needs review**.
- [ ] EC > 50 mS/cm → flagged **invalid** or **needs review** (likely unit mismatch).
- [ ] pH below realistic range → flagged **invalid** or **needs review**.
- [ ] pH above realistic range → flagged **invalid** or **needs review**.
- [ ] Temperature out of range → flagged **invalid** or **needs review**.
- [ ] VPD out of range → flagged **invalid** or **needs review**.
- [ ] Missing or unparseable timestamp → flagged **missing** or **invalid**.

## Staleness

- [ ] Snapshot older than `MANUAL_SNAPSHOT_CURRENT_STALE_HOURS = 6` hours
      → treated as stale, cannot support current-room decisions.
- [ ] Snapshot within 6 hours with valid values → can be **Usable**.

## Readiness panel integration

- [ ] Quality badge renders inside the AI Doctor context readiness panel
      when a current snapshot is present.
- [ ] Badge shows the correct quality color/state for the snapshot.
- [ ] Badge source label matches the snapshot source (`live`, `manual`, `demo`,
      `csv`, `stale`, `invalid`).
- [ ] Badge reason list is visible when quality is `needs_review` or `invalid`.
- [ ] Screen-reader summary (`role="status"`) is present and describes
      quality + source.

## Entry / review / confirmation surfaces

The Manual Sensor Snapshot quality badge currently appears in two
presenter-only surfaces:

- **Manual entry** — `src/components/ManualSensorReadingCard.tsx` renders
  the badge live as the grower types values, alongside the existing
  review-before-save prompt for suspicious readings.
- **AI Doctor readiness** — `src/components/AiDoctorContextReadinessPanel.tsx`
  renders the badge for the resolved current snapshot used as AI Doctor
  context.

Audit result (no separate review/confirmation surface exists):

- The Quick Log sensor snapshot strip (`QuickLogSensorSnapshotStrip.tsx`)
  already shows source + trust state via `SnapshotTrustBadge` and the
  strict resolver — it is **not** a manual-entry review surface, and
  adding a second badge would duplicate noisy labels for the same
  reading.
- Timeline / history cards (`ManualSnapshotTimelineCard.tsx`,
  `TentManualSnapshotHistoryList.tsx`, `ManualSnapshotTimelineSection.tsx`)
  render historical entries, not a pre-save confirmation step.
- `TentManualSnapshotChangeContext.tsx` displays change context for an
  already-persisted snapshot, not a pre-attach review.

If a dedicated manual-snapshot review/confirmation surface is added
later (e.g. a Quick Log "Review before attach" modal for manually
entered values), render `ManualSensorSnapshotQualityBadge` near the
reviewed values using only sanitized metric fields — never pass raw
payloads, vendor metadata, tokens, filenames, private IDs, or full
context objects.

## Safety / data hygiene

- [ ] No raw payload content renders in the badge or readiness panel.
- [ ] No `service_role`, bridge tokens, API keys, or private IDs render.
- [ ] No vendor secrets, internal filenames, or private metadata render.
- [ ] Only sanitized, whitelisted numeric metrics are forwarded to the badge.
- [ ] No `<button>` elements inside the badge.
- [ ] No Supabase writes, Action Queue inserts, Edge Function invokes,
      or alert creation triggered by the badge path.

## Action Queue suggestion preview impact

- [ ] When current snapshot is **Usable** and plant/tent/stage context is
      complete, Action Queue preview can show `eligible`.
- [ ] When only CSV history is present, preview shows `needs_current_reading`.
- [ ] When current snapshot is invalid/stale/demo/unknown, preview reflects
      the blocked or missing state appropriately.
- [ ] No Action Queue row is created by the badge or preview path.

## Validation commands & known counts

```bash
bun run typecheck
bunx vitest run \
  src/test/manual-sensor-snapshot-quality-rules.test.ts \
  src/test/manual-sensor-snapshot-quality-badge.test.tsx \
  src/test/ai-doctor-context-readiness-panel-current-snapshot-quality.test.tsx \
  --reporter=dot
bun run ai-doctor:preview-safety
```

Known good results:

| Check | Expected |
|-------|----------|
| `bun run typecheck` | passes |
| Manual snapshot quality rules | 18/18 passed |
| Integration (readiness panel + current snapshot) | 5/5 passed |
| `bun run ai-doctor:preview-safety` | OK |

## Related docs

- AI Doctor output contract: `docs/ai-doctor-output-contract.md`
- Imported history QA checklist: `docs/qa/ai-doctor-imported-history-safety-checklist.md`
- Action Queue suggestion preview QA runbook: `docs/runbooks/ai-doctor-action-suggestion-preview-qa.md`
- Preview safety scanner: `docs/testing/ai-doctor-preview-safety-scanner.md`
