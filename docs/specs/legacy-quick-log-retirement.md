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
| Test ids in the file         | 112                                         | 65 (4 shared)                                      |
| `@/` modules imported        | 71                                          | 76 (28 shared)                                     |

All rows are `established fact` (counts taken from the tracked tree with `git grep`
and `wc`).

## 3. Where each one is mounted

`established fact`, from import statements including relative imports:

| Host                                                 | Legacy | V2                | Routed       |
| ---------------------------------------------------- | ------ | ----------------- | ------------ |
| `src/components/AppShell.tsx` (every signed-in page) | yes    | yes               | n/a          |
| `src/pages/DailyCheck.tsx` (`/daily-check`)          | yes    | no                | yes          |
| `src/pages/GrowRoomMode.tsx`                         | yes    | opens V2 by event | **no route** |
| `src/components/QuickLogGroupedTimelineSection.tsx`  | no     | yes               | n/a          |

`/daily-check` is a primary destination, not a side page: it is the mobile nav "Log"
tab (`src/components/MobileNav.tsx`) and the global-search "Quick Log" result
(`src/lib/globalSearchItems.ts`). `established fact`.

### 3.1 How the app shell chooses

`established fact`, `src/components/AppShell.tsx`:

- Header "+" and the mobile FAB open **V2**, with a route-derived tent or plant target.
- `QUICK_LOG_V2_OPEN_EVENT` and `QUICK_LOG_V2_FEED_OPEN_EVENT` open **V2**. Eight
  production modules reference those events.
- `PLANT_QUICKLOG_PREFILL_EVENT` opens **legacy** with a `QuickLogPrefill`. Twenty-nine
  production modules reference that event or its dispatch helpers, including Plant
  Detail quick actions, the onboarding checklist, the One-Tent Loop next-step card,
  the Harvest Watch card, the AI Doctor "add context" router, Fast Add, the public
  starter handoff card, and the Plants page.
- The saved start-screen "Quick Log" intent and the guide handoff open **legacy**.
- The shell closes and remounts legacy before opening V2, so two modal focus locks
  are never active together. The in-code comment says other paths "may still open
  legacy when they need activity-type flows".

So the split today is by entry path, and by what the entry needs to capture.

## 4. Write paths

`established fact` unless labeled:

- Both save through `useQuickLogV2Save` → `quicklog_save_manual`
  (`src/components/QuickLog.tsx` line 446; frozen by
  `docs/specs/one-tent-loop-quicklog-single-write-path.md`).
- Legacy maps its form to that RPC through `src/lib/legacyQuickLogUnifiedSave.ts`,
  which accepts only `watering`, `observation` and `note` and rejects every other
  event type with `unsupported_event_type`.
- Legacy makes one extra write after a confirmed save: `grows.update({ stage })`
  (line 1864), reported separately if it fails ("stage save unconfirmed").
- `src/components/QuickLogAllActivitiesSection.tsx` (2,284 lines) saves through
  `useQuickLogActivitySave`, which calls `quicklog_save_manual` and
  `quicklog_save_event`, and uploads photos to the `diary-photos` bucket. It is
  imported only by legacy `QuickLog.tsx` and `DailyCheck.tsx`.

Retirement therefore removes no writer the single-write-path spec protects. The grow
stage write-back is the one behavior with no V2 counterpart found (`inference`, from
V2 not importing `quickLogGrowStageWritebackRules`).

## 5. Capability comparison

Method and its limit: this table comes from each file's imports and test ids, not
from running both surfaces side by side. A "no" means V2 does not import the module
or render the test id that implements it in legacy. Every row is `inference` until a
behavioral comparison is done in the stage that touches it.

| Capability                                                                | Legacy                  | V2                                | Evidence                                                                |
| ------------------------------------------------------------------------- | ----------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Note                                                                      | yes                     | yes                               | V2 action set is `water`, `note`, `feed` (`src/lib/quickLogV2Rules.ts`) |
| Watering with volume                                                      | yes                     | yes, dedicated form               | `QuickLogWateringForm`                                                  |
| Feeding with recipe                                                       | via All Activities      | yes, dedicated form               | `QuickLogFeedingForm`                                                   |
| Photo                                                                     | via All Activities      | yes                               | `quickLogPhotoDiaryEntry`                                               |
| Video                                                                     | no                      | yes                               | `quickLogVideoDiaryEntry`                                               |
| Structured readings on a note                                             | hardware readings block | yes                               | `quickLogStructuredReadingRules`                                        |
| Maturity evidence fields                                                  | no                      | yes                               | `QuickLogMaturityEvidenceFields`                                        |
| Session draft that survives reopen                                        | no                      | yes                               | `quickLogObservationDraftRules` (see #2936)                             |
| Duplicate-submit guard                                                    | no dedicated module     | yes                               | `quickLogDuplicateSubmitGuard`                                          |
| Environment check section                                                 | yes                     | no                                | `environmentCheckQuickLogRules`                                         |
| Training, defoliation, issue observation, manual sensor snapshot, harvest | yes, via All Activities | no                                | `src/constants/quickLogActivityTypes.ts`                                |
| Reminder event type                                                       | yes                     | no                                | `eventType === "reminder"` branch                                       |
| Early-stage milestones and vigor chips                                    | yes                     | no                                | `earlyStageQuickLogRules`                                               |
| Harvest Watch inspection preview                                          | yes                     | no                                | `harvestInspectionQuickLogPreviewRules`                                 |
| Pheno evidence goal capture                                               | yes                     | no                                | `PhenoEvidenceQuickLogPanel`                                            |
| Public starter draft handoff and consume-once                             | yes                     | no                                | `publicQuickLogStarterDraftStore`                                       |
| Draft preview panel for handoffs                                          | yes                     | no                                | `quickLogDraftPreviewViewModel`                                         |
| Sensor snapshot attach toggle and strip                                   | yes                     | gate rules only                   | `QuickLogSensorSnapshotStrip` vs `quickLogSensorSnapshotGateRules`      |
| Grow and plant pickers inside the form                                    | yes                     | target panel                      | `quick-log-grow-select`, `QuickLogTargetPanel`                          |
| Recent-target suggestion (accept or dismiss)                              | yes                     | yes                               | both import `quickLogRecentTargetStore`                                 |
| Grow stage write-back                                                     | yes                     | no                                | `quickLogGrowStageWritebackRules`                                       |
| Review-issues summary with jump links                                     | yes                     | no                                | `quick-log-review-issues`                                               |
| Post-save panel                                                           | yes                     | navigation to the timeline anchor | `quick-log-post-save`, `timelineAnchorNavigation`                       |

Reading: V2 is the stronger surface for note, water and feed. Legacy is the only
surface for about a dozen capture types and handoffs.

## 6. Tests and proof that move with it

`established fact`:

- 74 test files reference the legacy component (44 import it, 31 mock it so another
  surface can render without it). 22 reference `QuickLogAllActivitiesSection`
  (9 import, 13 mock).
- Five Playwright specs use legacy test ids: `e2e/one-tent-loop-golden-path-ui.spec.ts`,
  `e2e/one-tent-loop-interaction-counter.spec.ts`, `e2e/quicklog-smoke.spec.ts`,
  `e2e/quick-log-activation-handoff.spec.ts` and
  `e2e/operator-edge-alerts-dispatch-history.spec.ts`. The golden path and the
  Quick Log smoke are the deployed-app proofs for the core loop.
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

- Scope: every `PLANT_QUICKLOG_PREFILL_EVENT` producer whose prefill is a plain note,
  watering or feeding with a known plant or tent target dispatches the V2 open intent
  instead. Producers that need a legacy-only capability are left alone and listed.
- Acceptance: for each migrated producer, a test shows V2 opens with the same target
  and action and legacy does not; target selection stays explicit or route-derived
  (no remembered-target or only-plant auto-selection); the starter note text and
  watering volume still arrive as unconfirmed prefill.
- Non-goals: no change to `QuickLog.tsx`, Daily Check, the RPC, or any schema.
- Risk: a producer that silently depended on a legacy-only field. Mitigation: migrate
  in small groups, each with its own test.

### Stage 2 — decide the home for the legacy-only capture types

Two options, to be chosen in section 8:

- **2A, host the activity editor without the dialog.** `QuickLogAllActivitiesSection`
  already saves through the shared hook. Mount it in V2 (or as its own sheet) for
  training, defoliation, issue observation, manual sensor snapshot, harvest and
  environment check.
- **2B, port each capture type into V2.** More work, one surface at the end.

Acceptance either way: each capture type saves through the existing RPCs only, with
the same provenance labels; a manual sensor snapshot stays labeled manual; nothing
writes the Action Queue.

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

### Stage 5 — Grow Room Mode

`src/pages/GrowRoomMode.tsx` has no route. Either route it (a product decision outside
this spec) or delete it with its tests. Until then it keeps one legacy mount alive.

### Stage 6 — delete legacy

Only when no production module imports `QuickLog.tsx`. Delete it,
`legacyQuickLogUnifiedSave.ts`, the legacy-only rules modules that nothing else
imports, and their tests. The `QuickLogPrefill` type moves to a rules module first,
because 51 production modules use it.

## 8. Decisions needed from the owner

1. **Stage 2 direction:** 2A (host the existing activity editor) or 2B (port into V2).
2. **Which legacy-only capabilities are kept.** Candidates to drop, each a product
   call: reminder event type, early-stage chips, review-issues summary, draft preview panel.
3. **Grow stage write-back:** keep it as a Quick Log side effect, move it to the grow
   page, or drop it.
4. **Grow Room Mode:** route it or delete it.
5. **Order:** whether stage 1 should start now or wait for #2936 (which edits
   `QuickLogV2Sheet.tsx`) to merge, to avoid two writers on that file.

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
  measured. Product analytics could rank the 29 legacy producers; that query was not
  run for this spec.
- **Behavioral parity** — `uncertainty`. Section 5 is an import and test-id
  comparison. Two surfaces that import the same rules module can still behave
  differently.
- **Production state** — `NOT_MEASURED`. This spec read the repository only.
- **Effort** — not estimated.

## 11. Out of scope

Rewriting `QuickLogV2Sheet.tsx`, changing the RPC allow-list, the public `/quick-log`
starter page, `PlantQuickLog.tsx` on Plant Detail (already on the shared hook), and
any schema, RLS or edge function change.
