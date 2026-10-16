# Tent Garden — interactive diorama prototype (v0)

A standalone, private, **fictional-data** prototype of a 4×4 ft grow tent a grower can
explore, arrange, and revisit through time. It is not production Grow OS code: it has no
Supabase access, no real diary writes, no sensors, no billing, no Action Queue.

- **Scene:** Three.js diorama (tent floor with a 2 in snap grid, walls, light bar, door strip
  and an upright "Door (front)" label), six stylised pots/plants, CSS2D labels that keep the
  plant id visible when long names truncate.
- **Look:** cartoon diorama — `MeshToonMaterial` with a three-step gradient, ink outlines
  (scaled back-face copies), flat saturated palette, fan-leaf silhouettes, chunky pots.
- **Rules:** `src/rules/*` are pure, deterministic, null-safe modules with `node --test`
  coverage. Nothing in the scene or UI decides whether a drop, save, undo or history
  selection is valid; the rules do.
- **State:** in-memory only. **A page refresh resets everything** (layout drafts, saved
  layout, simulated events). The one device-local setting is the Animation switch
  (`localStorage`, wrapped in try/catch).

## Run

No install step. From the repository root:

```bash
node --test spikes/tent-garden-prototype/test/*.check.mjs   # 33 checks
cd spikes/tent-garden-prototype && python3 -m http.server 8081
# open http://127.0.0.1:8081/
```

Any static file server works. Three.js `0.170.0` loads as a pinned ES module from
jsDelivr via the import map in `index.html`; nothing else is fetched.

### Why the CDN import, and the bounded dependency proposal

The root `package.json` does not declare `three`. Adding it changes `bun.lock` and
`package-lock.json`, which `AGENTS.md` places off-limits without Matthew's approval and
routes to an outside reviewer. Rather than silently substitute another engine, this
prototype stays outside `src/` and loads the same version from a CDN.

Proposal for the next slice, if the prototype is worth integrating:

- `bun add three@0.170.0` and `bun add -d @types/three@0.170.0`
- Files touched: `package.json`, `bun.lock`, `package-lock.json`
- Reviewer seat: Codex, Blue Dream, Critical Mass or Durban Poison; owner lockfile approval
  at the exact head.
- Then the scene module moves under `src/components/tent-garden/` behind the
  react-router compat shim, with the rules modules moved to `src/lib/tentGarden*Rules.ts`.

## What it demonstrates

| Behaviour                                                     | Where                                             |
| ------------------------------------------------------------- | ------------------------------------------------- |
| Bounded orbit (no below-floor, no straight-down, zoom clamp)  | `tentScene.js` OrbitControls limits               |
| Reset View, 90° rotate steps (`[`, `]`, `R` keys)             | `tentScene.js` `setCamera`, `rotateBy`            |
| Rotation changes the camera only, never recorded positions    | camera code never touches layout state            |
| View mode: no drag; Edit Layout enables drag                  | `modeRules.resolveModeChange`, `app.js` `setMode` |
| Repeated Edit Layout clicks never restart the draft           | `modeRules` noop on edit→edit (regression test)   |
| Camera locked for all of Edit mode (orbit, rotate, reset)     | `modeRules.cameraLocked`, `scene.setCameraLocked` |
| Draft notes: same Save / Cancel / Retry / Undo rules          | `saveRules.noteChanges`, `commitNoteDraft`        |
| A saved note logs exactly one simulated `note.update` event   | `eventsForSave` (intent applies to moves only)    |
| Orbit disabled while dragging                                 | `controls.enabled = false` for the drag           |
| Snap grid, bounds, overlap → named swap confirmation          | `layoutRules.resolveDrop`, `app.js` `commitDrop`  |
| Dragging across a plant does nothing (only the drop counts)   | `resolveDrop` is called on drop; drag only ghosts |
| Draft until Save; intermediate drags produce no events        | `saveRules.buildSavePreview` on net changes       |
| Save preview distinguishes Actual Physical Move / Map Only    | `app.js` `openSave`, `saveRules.eventsForSave`    |
| Round trip = no change; retry cannot duplicate events         | `netChanges`, `applySave` idempotent on `batchId` |
| Swap produces one combined simulated event                    | `eventsForSave` kind `layout.swap`                |
| Cancel asks; Keep Editing is the default                      | `dlgCancel` with `autofocus` on Keep Editing      |
| Failed save keeps the draft for Retry                         | "Simulate a failed save" checkbox, `retrySave`    |
| Undo before Save; Undo after Save marks the event **Undone**  | `popDraft`, `undoLastSave`                        |
| 3-second toast with Undo + non-timed "Undo last saved move"   | `toast`, `#undoSaved`                             |
| Three dated fictional snapshots; slider snaps to dates only   | `historyRules.timelinePoints`, `goToIndex`        |
| Historical view read-only, dated, with Return To Today        | `render` banner; `modeEdit.disabled`              |
| Membership follows the snapshot (P-107 only in history)       | `membershipFor`, sample data                      |
| Missing evidence shown, never invented                        | `evidenceFor` → "no note recorded" badges         |
| Transition labelled as an orientation aid                     | banner text when `transition && animations`       |
| Unknown stage = neutral artwork + "Stage not recorded"        | `plantVisualRules.visualForStage`                 |
| Veg grows by recorded week; flower fills clusters, not height | `visualForStage` tests                            |
| Animation switch, reduced-motion default off                  | `readAnimPref`                                    |
| Keyboard alternative to drag (arrow keys / nudge buttons)     | `nudgeSelected`                                   |
| 2D list fallback when WebGL is unavailable                    | `showFallback`, `#listView`                       |
| Phone layout: details become a bottom sheet                   | `styles.css` `@media (max-width: 820px)`          |

## Known limitations (honest)

- Refresh resets all state; there is no persistence by design.
- Phone performance and the portrait layout were **NOT_MEASURED** on a real device in
  this slice; only desktop Chrome was exercised.
- Draft notes are per plant, plain text, 280 chars, no photo attach (Preview Only).
- The swap confirmation currently snaps the dragged pot back to its origin while the
  question is open, then applies the swap; a ghost preview of the post-swap layout would
  be nicer.
- Stylised plants are deliberately simple geometry; no textures.
- No React integration yet (see the dependency proposal above).

## One extra idea (proposal, not built)

"What changed since last visit": on opening the tent, highlight pots whose recorded stage
or position differs from the last snapshot the grower viewed. Roughly half a day on top
of this slice; both inputs (a diff of two recorded layouts, a per-device "last viewed"
marker) already exist here. It must stay strictly recorded-vs-recorded and never imply
growth between dates.
