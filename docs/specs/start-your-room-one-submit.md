# Spec — Start Your Room one submit

**Measured:** 2026-10-30 against deploy tip `ffc6076aeb3723f17d85057154f8e9772ed9c222` (#2582, with the draft recovery from #2565).
**Status:** current behavior. This page documents the code. It does not change it.

Evidence labels: `established fact` unless a line says otherwise.

Route `/start-room` (`access: auth` in `src/lib/appRouteManifest.ts`) renders `src/pages/StartYourRoom.tsx` from `src/routes/_app/start-room.tsx`. The page is a presenter. The step machine lives in `src/lib/startYourRoomRules.ts`. Draft shape and retry copy live in `src/lib/startYourRoomDraftRules.ts`. Browser persistence lives in `src/lib/sessionFormDraftRules.ts` and `src/lib/sessionFormDraftStore.ts`.

## Intent

A grower with an empty room names a plant once. One submit creates the grow, the tent, and the plant, binding `grow_id` and `tent_id` on the way, then opens Plant Detail with Quick Log:

```text
/plants/<plantId>?open=quick-log
```

That href is `plantDetailQuickLogHref`. After a confirmed plant, the page also stores the start-screen choice `quickLog` for that user (`setStartScreenChoice`) so the next login skips empty onboarding.

The visible form is one step. `firstMissingStep(ids)` still returns `grow`, `tent`, `plant`, or `done` from which ids already exist. The page shows `oneStepProgressLabel`: `One step` until `done`, then `Complete`. `progressLabel` (`Step N of 3`) and `nextStepAfter` remain exported and are not what this page renders.

## What one submit writes

`canSubmitRoom` requires a plant name of 1–80 characters after trim. A grow or tent name the grower typed for an item still to be created must pass the same rule. Blank optional names are filled by `startRoomFormWithDefaults`:

| Field | Blank becomes                                   | Payload                                          |
| ----- | ----------------------------------------------- | ------------------------------------------------ |
| Grow  | `My grow` (`START_YOUR_ROOM_DEFAULT_GROW_NAME`) | `name`, `grow_type: "tent"`, `stage: "seedling"` |
| Tent  | `Tent 1` (`START_YOUR_ROOM_DEFAULT_TENT_NAME`)  | `name`, `grow_id`, `stage: "seedling"`           |
| Plant | no default; the name is required                | `name`, `grow_id`, `tent_id`, `stage`            |

Plant stages the form and the draft parser accept: `seedling`, `veg`, `flower`. The default is `seedling`. The plant payload omits `health`; the column default applies.

The page adds `id` and `user_id` from the signed-in user. It inserts through `persistHierarchyCreateAttempt` (`src/lib/hierarchyCreatePersistence.ts`). Row-level security stays the authorization boundary. This flow does not call an Edge Function, write the Action Queue, or send a device command.

Each entity gets one preallocated UUID from `newHierarchyCreateAttemptId` (`crypto.randomUUID`, lowercased). Retry reuses that id. The plant id is released only after `setIds` has recorded the confirmed plant, so a reload during the post-save refresh retries the same row.

Order inside `submitRoom`:

1. Plan gates run before any insert. A new grow needs `evaluateVerifiedGrowCreationGate`. A tent on an existing grow needs `evaluateVerifiedTentCreationGate`. A blocked gate sets `blockedCopy` and inserts nothing.
2. Create the grow when `shownIds.growId` is missing, then `refresh()` the grow list. A refresh failure after a confirmed grow toasts and continues, so the form does not offer a second grow.
3. Stop if this page instance unmounted or lost the writer epoch. A reopened setup must not start a tent or plant the new page cannot see.
4. Create the tent, then the plant, with the same stop.
5. If the confirmed plant row has no `grow_id`, stop with the Plant Detail rescue / Lineage Repair message.
6. Settle grow refresh plus `["tents"]` and `["plants"]` invalidation. A failed refresh stays recoverable in Quick Log and does not create a second plant.
7. Clear this writer's draft, set the start-screen choice, and `replace` to the Quick Log href. Skip that navigation when the grower has already left.

A second click is ignored while `busy` or `createInFlightRef` is set.

## Resume when rows already exist

`resolveStartYourRoomResume` runs only when grows, tents, and plants have all been read, the account has exactly one grow, and `activeGrowId` is null or equal to that grow. Otherwise it returns null and the form stays ready to create a grow.

| Room                                                    | Resume step        |
| ------------------------------------------------------- | ------------------ |
| No tent on that grow                                    | `tent`             |
| One tent, no plant on it                                | `plant`            |
| One tent, one plant on it                               | `done`             |
| More than one tent, or more than one plant on that tent | `null` (ambiguous) |

`appliedResume` keeps a `done` resume. A partial resume is applied only when plan verification is ready and the grow gate does not allow another grow. When the gate allows another grow, the page stays on a new grow instead of hiding that choice. A free account at its grow limit therefore keeps the limit notice and can still create the missing tent and plant. A plan that may open another grow can still create one from this page.

Saved names shown after a partial save come from the owner-scoped grow or tent list. While that list is refreshing, the page uses the name on the confirmed insert response for the same owner and row id. If neither source has a name, the bound line reads `your grow` or `your tent`. Typed optional names that were never confirmed are not shown as saved names. The stored draft blanks a name once its id exists (`startYourRoomDraftForm`), so a later empty form does not inherit a confirmed name.

## Session draft

Storage is `window.sessionStorage` (a tab lifetime). The key is:

```text
verdant.session-form.1.<userId>.start-your-room
```

`SESSION_FORM_DRAFT_VERSION` is `1`. The form id is `start-your-room`. The value is JSON:

```json
{
  "step": "grow",
  "form": { "growName": "", "tentName": "", "plantName": "Plant A", "plantStage": "seedling" },
  "ids": { "growId": null, "tentId": null, "plantId": null },
  "pendingRowIds": { "grow": null, "tent": null, "plant": null },
  "saveError": null
}
```

`parseStartYourRoomDraft` rejects a non-object, a `done` step, a missing `form` / `ids` / `pendingRowIds`, a non-UUID id, and a stage outside the three allowed values (those fall back to `seedling`). Names are sliced to 80 characters. `saveError` is sliced to 280.

Hydration waits until the grow roster has finished without error. If the draft contains a tent id, it also waits until the tent query is not loading, not fetching, and not in error. A cached tent list that is still refreshing is not treated as a deleted tent. Forms stay hidden until `draftOwnerReady` matches the current user, so keystrokes are not wiped by a late restore.

| Roster result                                                         | What hydration does                                                                                      |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Draft grow id is still in the owned grows                             | Restore ids, pending row ids, and the saved error                                                        |
| Draft grow id is gone                                                 | Clear ids and pending row ids; drop the error                                                            |
| Saved tent is missing, or the draft step is `plant` without that tent | Keep the grow id, clear tent and plant ids and pending row ids, drop the error, keep unsent plant typing |
| No draft                                                              | Reset form, ids, pending ids, and error                                                                  |

A pending grow id that already appears in the owned grows list is adopted (`adoptablePendingGrowId`) instead of inserted again. Adoption runs only on the grow step, when `growId` is still null.

The draft clears when `firstMissingStep` is `done`, and again after the confirmed plant when this writer still owns the key. The plant navigation unmounts the page before the done effect can run, so `submitRoom` clears the draft itself.

### Writer epoch

Each page instance holds a `Symbol`. The symbol is replaced when the signed-in user id changes, and the current symbol is stored in `startRoomDraftWriters` for that user. A new instance claims the user even when the form text matches the previous instance. Only the symbol currently in the map may write or clear the draft.

`submitRoom` captures the owner id and the symbol at commit. Before and after each persist and refresh it requires all of: the owner ref still matches, this instance's symbol is unchanged, and the map still points at that symbol. An unknown create outcome is still recorded for the captured owner after another instance takes over. Only the current writer may set this page's error.

### Errors and retry

`persistHierarchyCreateAttempt` returns `confirmed`, `definitive_error`, or `unknown`.

- **Confirmed.** Release that entity's pending id and continue.
- **Definitive error.** `startRoomSaveErrorWithReason` appends `Reason: <server message>` unless the message is empty or `Could not create record`. The Retry control is shown only when `isStartRoomRetryableSaveError` matches that copy. Validation, plan-gate, safe-save-start, and unknown-outcome errors do not offer that Retry.
- **Unknown.** The page records the attempt and tells the grower to refresh before adding another room item. Further submits stop until that flag clears. The visible test id is `start-room-create-outcome-unknown`.

The shared retry sentence is still `START_YOUR_ROOM_SAVE_RETRY_COPY`: "Retry saves this same step once." Per-entity errors say "this grow", "this tent", or "this plant". The word "step" is the current copy.

## Sibling: Quick Log observation draft

The same session-form store keeps the first Quick Log observation. Form id: `quick-log-v2-observation`. Rules: `src/lib/quickLogObservationDraftRules.ts`. The sheet is `src/components/QuickLogV2Sheet.tsx`. The canonical persist path is unchanged: `docs/specs/one-tent-loop-quicklog-single-write-path.md`.

`restorableQuickLogObservationDraft` restores a draft only for the explicit or route-derived target it was typed for (`selectedKey` equal to that target). With no target, the words return, `selectedKey` is null, `saveFailed` is false, and the idempotency key is left behind. A draft never selects a plant or tent. The notice is `QUICK_LOG_OBSERVATION_DRAFT_RESTORED_COPY` when a target matches, and `QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY` when it does not. The Feed note uses the same restored notice as the other actions.

## Pitfalls

- Tests that mount Start Your Room need `sessionStorage.clear()` in `beforeEach`. The draft survives across cases in one jsdom window. `src/test/start-your-room-one-step.test.tsx` does this.
- Old per-step test ids (`start-room-grow-submit` and its tent/plant siblings) are gone. The submit control is `start-room-submit`. Field ids include `start-room-plant-name`, `start-room-plant-stage`, `start-room-grow-name`, and `start-room-tent-name`.
- Do not add another `saveIdempotencyKeyRef.current = newQuickLogSaveKey()` assignment. `src/test/quicklog-manual-idempotency-static.test.ts` counts those assignments.
- Do not persist a confirmed grow, tent, or plant name back into the draft.
- A failed grow-roster read must not hydrate. An empty list and an error are different: hydrating on the error would reset a tent or plant draft and overwrite it.
- While one save is in flight, `busy` stays true on that page instance until `finally`, including when the signed-in user changes before the attempt returns. No row is written for the new user; the old attempt checks the captured owner.
- `newHierarchyCreateAttemptId` throws when `crypto.randomUUID` is missing or not a UUID. The page catches that per entity and asks for a refresh. It does not invent an id.

## Checks

```text
bunx vitest run src/test/start-your-room-one-step.test.tsx src/test/start-your-room-partial-save-names.test.tsx src/test/start-your-room-refresh-continuation.test.tsx src/test/start-your-room-deleted-tent-hydration.test.tsx src/test/start-room-quick-log-draft-p2-rules.test.ts src/test/quick-log-observation-draft-scope.test.tsx
```

A wider pass used by the setup work is every test under `src/test` whose name starts with `start-your-room` or `start-room`, plus `src/test/hierarchy-create-response-loss.test.tsx`.

## Out of scope

Schema, row-level security, published migrations, Edge Functions, the Quick Log RPC allow-list, Action Queue creation, and device commands. Public `/quick-log` remains a local draft and a signup CTA.
