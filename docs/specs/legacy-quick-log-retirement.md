# Spec — Legacy Quick Log retirement

**Author:** Claude (session `session_017UoYKvCNSMryxiQZyBbit8`), at the owner's request
**Date:** 2026-11-12
**Slice name:** `LEGACY-QUICKLOG-RETIREMENT-SPEC`
**Status:** PROPOSAL — docs only. Nothing in this file is approved for build until the
owner answers the decisions in section 8.
**Measured at:** `verdant-grow-diary` at `c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8`

Every claim is labeled per the Sentinel evidence discipline: `established fact`,
`source claim`, `practical observation`, `inference`, `uncertainty`, `missing evidence`.

---

## 1. Verdict

Do not delete the legacy Quick Log in one change. It is not a leftover: it is the
dialog a grower gets from most "log this" buttons in the app, from the mobile "Log"
tab's page, and from the deployed smoke specs. Retire it in stages, entry path by
entry path, starting with the paths whose activity the newer sheet already supports.

The two implementations already share one write path, so this is a product-surface
consolidation, not a data-safety fix. Nothing here is urgent for diary truth.

## 2. What "legacy" and "V2" are

|                              | Legacy                                      | V2                                                 |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------- |
| File                         | `src/components/QuickLog.tsx` (4,163 lines) | `src/components/QuickLogV2Sheet.tsx` (4,562 lines) |
| Container                    | modal dialog (`ui/dialog`)                  | bottom sheet (`ui/sheet`)                          |
| Test files that reference it | 74 (44 import it, 31 mock it)               | 67 (54 import it, 13 mock it)                      |
| Literal test ids in the file | 104, plus 8 templated                       | 62, plus 4 templated (4 literals shared)           |
| `@/` modules imported        | 71                                          | 76 (28 shared)                                     |

All rows are `established fact` (counts taken from the tracked tree with `git grep`
and `wc`). Test ids are counted as unique `data-testid="…"` string literals; ids built
from a template expression are counted separately because one expression can render
many ids.

## 3. Where each one is mounted

`established fact`, from import statements including relative imports:

| Host                                                                                   | Legacy | V2                | Routed       |
| -------------------------------------------------------------------------------------- | ------ | ----------------- | ------------ |
| `src/components/AppShell.tsx` (every signed-in page)                                   | yes    | yes               | n/a          |
| `src/pages/DailyCheck.tsx` (`/daily-check`)                                            | yes    | no                | yes          |
| `src/pages/GrowRoomMode.tsx`                                                           | yes    | opens V2 by event | **no route** |
| `src/components/QuickLogGroupedTimelineSection.tsx`                                    | no     | yes               | n/a          |
| `src/components/QuickLogV2Fab.tsx`, rendered by `PlantDetail.tsx` and `TentDetail.tsx` | no     | yes               | n/a          |

`/daily-check` is a primary destination, not a side page: it is the mobile nav "Log"
tab (`src/components/MobileNav.tsx`) and the global-search "Quick Log" result
(`src/lib/globalSearchItems.ts`). `established fact`.

### 3.1 How the app shell chooses

`established fact`, `src/components/AppShell.tsx`:

- Header "+" and the mobile FAB open **V2**, with a route-derived tent or plant target.
- `QUICK_LOG_V2_OPEN_EVENT` and `QUICK_LOG_V2_FEED_OPEN_EVENT` open **V2**. Eight
  production modules reference those events.
- The event string `verdant:open-quicklog` opens **legacy** with a `QuickLogPrefill`.
  The shell listens for the string, and three constants carry it:
  `PLANT_QUICKLOG_PREFILL_EVENT` (`src/lib/plantQuickLogPrefillRules.ts`),
  `ACTION_FOLLOWUP_QUICKLOG_EVENT` (`src/lib/actionFollowUpQuickLogHandoffRules.ts`)
  and `CORRECTED_QUICKLOG_EVENT` (`src/lib/diaryEntryRemovalFollowUpRules.ts`). Some
  modules send the bare string with no constant. Section 3.2 inventories the
  producers by the string, not by one constant's name.
- The saved start-screen "Quick Log" intent and the guide handoff open **legacy**.
- The shell closes and remounts legacy before opening V2, so two modal focus locks
  are never active together. The in-code comment says other paths "may still open
  legacy when they need activity-type flows".

So the split today is by entry path, and by what the entry needs to capture.

### 3.2 Who opens legacy

`established fact`. Method: production files (tests excluded) that call
`dispatchEvent` and name the string `verdant:open-quicklog` or one of its three
constants; then, separately, files that dispatch an event whose name comes from a
variable. `AppShell.tsx` is the listener and is not counted.

- **25 modules dispatch it by name.** Listed in appendix A. Three of them use the
  bare string: `DiaryCalendarSection.tsx` (two call sites) and
  `PlantDetailWhatsMissing.tsx`. `ActionFollowUpQuickLogHandoffButton.tsx` and
  `diaryEntryRemovalFollowUpRules.ts` use the other two constants.
- **7 modules dispatch an event name supplied by a rules object**
  (`intent.eventName`, `target.eventName`, `cta.eventName`,
  `addContextDecision.quickLogEvent.type`). Listed in appendix A; one of them is also
  in the first list. Whether each sends the legacy string or a V2 event depends on the
  rule that built the intent, and was not traced per call site for this spec
  (`uncertainty`). `plantDetailDoctorAddContextRouter.ts` sets the legacy constant, so
  `PlantDetailDoctorLaunchDialog.tsx` does open legacy.
- 29 production files mention `PLANT_QUICKLOG_PREFILL_EVENT`. That number mixes
  dispatchers with rules modules that only build a payload, and it misses the bare
  string and the two other constants. It is not the producer count.

One producer depends on a legacy-only behavior that section 8 puts up for decision:
`DiaryCalendarSection.tsx` opens legacy for the cultivation calendar's stage change,
with the in-code note "Reuse the one existing manual stage writer in Quick Log". The
calendar has no stage writer of its own. Among client `from("grows")` calls, the
one in `QuickLog.tsx` is the only one that updates `stage`; a search for a grow
update helper by name (`updateGrow`, `setGrowStage`, `updateGrowStage`) found none. So
the calendar's stage change depends on the legacy write-back (`inference`).

### 3.3 What a V2 open event can carry today

`established fact`:

- `src/lib/quickLogV2OpenIntent.ts` defines the intent as a target key plus
  `action: "water"`. Its builder returns `null` for any other action.
- `src/lib/quickLogV2FeedOpenIntent.ts` is the same shape with `action: "feed"`.
- Neither intent carries note text, a watering volume, or any other prefill. The
  shell passes only the validated intent to the sheet.
- No event opens V2 on a note. The sheet defaults to `note` only when the grower opens
  it from the header "+" or the mobile button.

So a legacy producer cannot be moved to V2 today by changing the event it sends,
unless it is a water or feed producer with a known target and no prefill.

## 4. Write paths

`established fact` unless labeled:

- Both save through `useQuickLogV2Save` → `quicklog_save_manual`
  (`src/components/QuickLog.tsx` line 446; frozen by
  `docs/specs/one-tent-loop-quicklog-single-write-path.md`).
- Legacy maps its form to that RPC through `src/lib/legacyQuickLogUnifiedSave.ts`,
  which accepts `watering`, `observation`, `note` and `environment`
  (`SUPPORTED_LEGACY_EVENT_TYPES`, lines 52-57) and rejects every other event type
  with `unsupported_event_type`.
- An `environment` save keeps the environment-check envelope and sends air
  temperature, humidity and VPD through the RPC's first-class parameters, so
  `quicklog_save_manual` persists the structured `environment_events` row. That is an
  existing persistence contract the retirement has to preserve.
- Legacy makes one extra write after a confirmed save: `grows.update({ stage })`
  (line 1864), reported separately if it fails ("stage save unconfirmed").
- `src/components/QuickLogAllActivitiesSection.tsx` (2,284 lines) saves through
  `useQuickLogActivitySave`, which calls `quicklog_save_manual` and
  `quicklog_save_event`, and uploads photos to the `diary-photos` bucket. It is
  imported only by legacy `QuickLog.tsx` and `DailyCheck.tsx`.
- That section does **not** persist a manual sensor reading. It sets
  `canPersistManualSensor = false` (line 734) and shows either a launcher
  (`onOpenManualSensorReading`) or instructions to use the separate card;
  `useQuickLogActivitySave` does not save the `manual_sensor_reading` route. The
  writer for that capture is `src/components/ManualSensorReadingCard.tsx`, hosted on
  `DailyCheck.tsx` and `src/pages/Sensors.tsx`.

Retirement therefore removes no writer the single-write-path spec protects. The grow
stage write-back is the one behavior with no V2 counterpart found (`inference`, from
V2 not importing `quickLogGrowStageWritebackRules`).

## 5. Capability comparison

Method and its limit: this table comes from each file's imports and test ids, not
from running both surfaces side by side. A "no" means V2 does not import the module
or render the test id that implements it in legacy. Every row is `inference` until a
behavioral comparison is done in the stage that touches it.

| Capability                                                    | Legacy                                            | V2                                | Evidence                                                                |
| ------------------------------------------------------------- | ------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Note                                                          | yes                                               | yes                               | V2 action set is `water`, `note`, `feed` (`src/lib/quickLogV2Rules.ts`) |
| Watering with volume                                          | yes                                               | yes, dedicated form               | `QuickLogWateringForm`                                                  |
| Feeding with recipe                                           | via All Activities                                | yes, dedicated form               | `QuickLogFeedingForm`                                                   |
| Photo                                                         | via All Activities                                | yes                               | `quickLogPhotoDiaryEntry`                                               |
| Video                                                         | no                                                | yes                               | `quickLogVideoDiaryEntry`                                               |
| Structured readings on a note                                 | hardware readings block                           | yes                               | `quickLogStructuredReadingRules`                                        |
| Maturity evidence fields                                      | no                                                | yes                               | `QuickLogMaturityEvidenceFields`                                        |
| Session draft that survives reopen                            | no                                                | yes                               | `quickLogObservationDraftRules` (see #2936)                             |
| Duplicate-submit guard                                        | no dedicated module                               | yes                               | `quickLogDuplicateSubmitGuard`                                          |
| Environment check section, saved with structured air readings | yes                                               | no                                | `environmentCheckQuickLogRules`, `SUPPORTED_LEGACY_EVENT_TYPES`         |
| Training, defoliation, issue observation, harvest             | yes, via All Activities                           | no                                | `src/constants/quickLogActivityTypes.ts`                                |
| Manual sensor snapshot                                        | launcher only; saved by `ManualSensorReadingCard` | no                                | `canPersistManualSensor = false`                                        |
| Reminder event type                                           | yes                                               | no                                | `eventType === "reminder"` branch                                       |
| Early-stage milestones and vigor chips                        | yes                                               | no                                | `earlyStageQuickLogRules`                                               |
| Harvest Watch inspection preview                              | yes                                               | no                                | `harvestInspectionQuickLogPreviewRules`                                 |
| Pheno evidence goal capture                                   | yes                                               | no                                | `PhenoEvidenceQuickLogPanel`                                            |
| Public starter draft handoff and consume-once                 | yes                                               | no                                | `publicQuickLogStarterDraftStore`                                       |
| Draft preview panel for handoffs                              | yes                                               | no                                | `quickLogDraftPreviewViewModel`                                         |
| Sensor snapshot attach toggle and strip                       | yes                                               | gate rules only                   | `QuickLogSensorSnapshotStrip` vs `quickLogSensorSnapshotGateRules`      |
| Grow and plant pickers inside the form                        | yes                                               | target panel                      | `quick-log-grow-select`, `QuickLogTargetPanel`                          |
| Recent-target suggestion (accept or dismiss)                  | yes                                               | yes                               | both import `quickLogRecentTargetStore`                                 |
| Grow stage write-back                                         | yes                                               | no                                | `quickLogGrowStageWritebackRules`                                       |
| Review-issues summary with jump links                         | yes                                               | no                                | `quick-log-review-issues`                                               |
| Post-save panel                                               | yes                                               | navigation to the timeline anchor | `quick-log-post-save`, `timelineAnchorNavigation`                       |

Reading: V2 is the stronger surface for note, water and feed. Legacy is the only
surface for about a dozen capture types and handoffs.

## 6. Tests and proof that move with it

`established fact`:

- 74 test files reference the legacy component (44 import it, 31 mock it so another
  surface can render without it). 22 reference `QuickLogAllActivitiesSection`
  (9 import, 13 mock).
- Six Playwright specs use a test id that exists only in the legacy dialog:
  `e2e/one-tent-loop-golden-path-ui.spec.ts`,
  `e2e/one-tent-loop-interaction-counter.spec.ts`, `e2e/quicklog-smoke.spec.ts`,
  `e2e/quick-log-activation-handoff.spec.ts`,
  `e2e/operator-edge-alerts-dispatch-history.spec.ts` and
  `e2e/symptom-check-branch.spec.ts` (`quick-log-target-plant`, line 345). The golden
  path and the Quick Log smoke are the deployed-app proofs for the core loop. Method:
  each spec was searched for the 100 literal test ids found in `QuickLog.tsx` and not
  in `QuickLogV2Sheet.tsx`.
- Tracked tests, `e2e/` and workflows are locked scorers. Each stage must declare its
  unlocks and name every renegotiated check in its PR body.

Deleting legacy before its tests are re-pointed would remove the loop's smoke proof.

## 7. Staged plan

Each stage is one PR, one writer, with its own handoff. A stage starts only after the
one before it is merged and its post-merge check has run.

### Stage 0 — decisions (no code)

The owner answers section 8. Output: this spec's status moves to IMPLEMENT for the
stages approved.

### Stage 1 — route note, water and feed entry paths to V2

Stage 1 has a prerequisite, because of section 3.3. It is two PRs, in order.

**Stage 1a — extend the V2 open contract (prerequisite).**

- Scope: one typed, validated open intent for V2 that can name `note` as well as
  `water` and `feed`, and can carry optional prefill: starter note text and a watering
  volume. The shell passes it to the sheet; the sheet seeds its fields from it.
- Acceptance:
  - prefill arrives as unconfirmed input the grower can edit or clear; nothing is
    saved without an explicit save;
  - the target stays explicit or route-derived; an intent with no valid target opens
    the sheet with no target chosen (no remembered-target or only-plant selection);
  - every field is validated at the boundary: unknown actions, non-string notes,
    non-finite or non-positive volumes and oversized text are rejected, and a rejected
    intent opens nothing;
  - the existing water and feed intents keep working unchanged;
  - prefill never overwrites text the grower already typed, and never replaces a
    session draft for the same target.
- This is a bounded change to `QuickLogV2Sheet.tsx` and the two intent modules. It is
  not the rewrite that section 11 excludes. It touches the file #2936 edits, so it
  follows decision 5 in section 8.

**Stage 1b — move producers.**

- Scope: every producer in section 3.2 and appendix A whose prefill is a plain note,
  watering or feeding with a known plant or tent target sends the V2 intent instead.
  The inventory is by event string, so it includes the bare-string and aliased
  producers. Each rules-supplied dispatcher is traced first to see which event it
  sends. Producers that need a legacy-only capability are left alone and listed.
- Acceptance: for each migrated producer, a test shows V2 opens with the same target,
  action and prefill and legacy does not; the stage 1a acceptance still holds.
- Non-goals: no change to `QuickLog.tsx`, Daily Check, the RPC, or any schema.
- Risk: a producer that silently depended on a legacy-only field. Mitigation: migrate
  in small groups, each with its own test.

### Stage 2 — decide the home for the legacy-only capture types

Two options, to be chosen in section 8:

- **2A, host the activity editor without the dialog.** `QuickLogAllActivitiesSection`
  already saves through the shared hook. Mount it in V2 (or as its own sheet) for
  training, defoliation, issue observation and harvest. Two capture types need more
  than that mount:
  - **Manual sensor snapshot.** The section only launches it. 2A must also keep and
    wire the existing `ManualSensorReadingCard` flow from the new host, or the
    capture type has no working editor there.
  - **Environment check.** Today it saves through the legacy adapter, not the
    activity editor. 2A must name where it lives and keep its structured save.
- **2B, port each capture type into V2.** More work, one surface at the end. The same
  two capture types need explicit handling.

Acceptance either way: each capture type saves through the existing RPCs only, with
the same provenance labels; a manual sensor reading is still written by its existing
card and stays labeled manual; an environment check still sends temperature, humidity
and VPD as first-class RPC parameters and produces the `environment_events` row;
nothing writes the Action Queue.

### Stage 3 — Daily Check

- Scope: the step flow keeps its own page. Its save step opens the surface chosen in
  stage 2 instead of the legacy dialog.
- Acceptance: the `verdant:entry-created` event still marks the step done from a
  confirmed save only; `daily-check-post-submit` behavior is unchanged; the mobile
  "Log" tab still lands on a working flow at 375 px.
- Proof: re-point `e2e/quicklog-smoke.spec.ts` and the golden path in the same PR.
  Hosted smoke stays a post-deploy signal on the production host with the disposable
  fixture account.

### Stage 4 — the handoffs

Harvest Watch inspection preview, Pheno evidence goal, public starter consume-once,
early-stage chips, grow stage write-back, reminder. One PR per handoff, or an explicit
decision to drop it (section 8).

The grow stage write-back is not only a Quick Log side effect: the cultivation
calendar's stage change opens legacy to reach it (section 3.2). Whatever is decided
for the write-back has to give `DiaryCalendarSection.tsx` a working stage control in
the same PR.

### Stage 5 — Grow Room Mode

`src/pages/GrowRoomMode.tsx` has no route. Either route it (a product decision outside
this spec) or delete it with its tests. Until then it keeps one legacy mount alive.

### Stage 6 — delete legacy

Only when no production module imports `QuickLog.tsx`. Delete it,
`legacyQuickLogUnifiedSave.ts`, the legacy-only rules modules that nothing else
imports, and their tests. The legacy event listener in `AppShell.tsx` goes only after
every producer in section 3.2 has been moved or removed; a producer left behind would
become a button that does nothing, with no error. The `QuickLogPrefill` type moves to
a rules module first: three production modules import it from `QuickLog.tsx`
(`AppShell.tsx`, `GrowRoomMode.tsx`, `hyperLogDraftRules.ts`), and seven name it as a
whole word.

## 8. Decisions needed from the owner

1. **Stage 2 direction:** 2A (host the existing activity editor) or 2B (port into V2).
2. **Which legacy-only capabilities are kept.** Candidates to drop, each a product
   call: reminder event type, early-stage chips, review-issues summary, draft preview panel.
3. **Grow stage write-back:** keep it as a Quick Log side effect, move it to the grow
   page, or drop it. Dropping it also removes the cultivation calendar's only stage
   control, unless that control gets its own writer.
4. **Grow Room Mode:** route it or delete it.
5. **Order:** whether stage 1a should start now or wait for #2936 (which edits
   `QuickLogV2Sheet.tsx`) to merge, to avoid two writers on that file.
6. **Stage 1 shape:** extend the V2 open contract first (stage 1a, as written), or
   skip 1a and move only water and feed producers that carry no prefill, leaving note
   and prefill producers on legacy until a later stage.

## 9. Safety fences for every stage

- One persist path: `quicklog_save_manual` (and `quicklog_save_event` where the
  activity editor already uses it). No new client inserts into diary or event tables.
- Target selection explicit or route-derived only.
- Post-save refresh is `applyQuickLogV2Refresh` plus one `verdant:entry-created`
  dispatch, only after a confirmed save.
- Sensor values keep their source label; a snapshot that cannot be attached is said
  so, never shown as attached.
- No Action Queue writes, no device control, no schema or RLS change.

## 10. What is not known

- **Usage** — `missing evidence`. Which entry paths growers actually use was not
  measured. Product analytics could rank the legacy producers in appendix A; that query
  was not run for this spec.
- **Rules-supplied dispatchers** — `uncertainty`. Which event each of them sends was
  not traced per call site (section 3.2).
- **Behavioral parity** — `uncertainty`. Section 5 is an import and test-id
  comparison. Two surfaces that import the same rules module can still behave
  differently.
- **Production state** — `NOT_MEASURED`. This spec read the repository only.
- **Effort** — not estimated.

## 11. Out of scope

Rewriting `QuickLogV2Sheet.tsx`, changing the RPC allow-list, the public `/quick-log`
starter page, `PlantQuickLog.tsx` on Plant Detail (already on the shared hook), and
any schema, RLS or edge function change.

## Appendix A — producers of the legacy open event

`established fact` at the measured commit, by the method in section 3.2.

Dispatch `verdant:open-quicklog` by name (25):

- `src/components/ActionFollowUpQuickLogHandoffButton.tsx`
- `src/components/DiaryCalendarSection.tsx`
- `src/components/FirstPlantMemoryCta.tsx`
- `src/components/GrowRecoveryPrompt.tsx`
- `src/components/GrowRoomQuickActionsCard.tsx`
- `src/components/GuidedGrowWalkPanel.tsx`
- `src/components/OnboardingChecklistCard.tsx`
- `src/components/OneTentLoopNextStepCard.tsx`
- `src/components/PendingCheckpointBanner.tsx`
- `src/components/PhenoCandidateEvidenceCoverage.tsx`
- `src/components/PlantDetailAiDoctorContextReadinessMount.tsx`
- `src/components/PlantDetailAiDoctorReadiness.tsx`
- `src/components/PlantDetailHarvestWatchCard.tsx`
- `src/components/PlantDetailQuickActions.tsx`
- `src/components/PlantDetailTimelineEvidenceReadinessLaunch.tsx`
- `src/components/PlantDetailWhatsMissing.tsx`
- `src/components/PlantTentEnvironmentPanel.tsx`
- `src/components/PublicQuickLogHandoffCard.tsx`
- `src/components/TentPlantActivityPanels.tsx`
- `src/lib/diaryEntryRemovalFollowUpRules.ts`
- `src/lib/tentPlantRosterQuickActions.ts`
- `src/pages/CultivarDiaryProfile.tsx`
- `src/pages/Onboarding.tsx`
- `src/pages/OreozGelonadeDiaryComparison.tsx`
- `src/pages/Plants.tsx`

Dispatch an event name supplied by a rules object (7):

- `src/components/AiDoctorContextQuickActions.tsx`
- `src/components/GlobalFastAddButton.tsx`
- `src/components/GlobalSearchDialog.tsx`
- `src/components/PlantDetailAiDoctorContextReadinessMount.tsx`
- `src/components/PlantDetailDoctorLaunchDialog.tsx`
- `src/components/PlantRelativeTimelineSection.tsx`
- `src/components/TimelineEmptyState.tsx`
