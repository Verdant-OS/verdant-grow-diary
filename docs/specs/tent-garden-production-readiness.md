# Spec — Tent Garden: from isolated prototype to a production page

**Author:** Claude (specification only; no application code in this slice)
**Date:** 2026-10-17
**Status:** PROPOSED. Needs four owner decisions (§3), then a holder per slice (§11).
**Prototype measured:** `claude/tent-garden-prototype-v0` at `5b612885b22c82aac5dc60168539a883c162b531`.
**Deploy branch measured:** `verdant-grow-diary` at `6fba63c` (2026-10-17).
**Related, not merged:** `docs/specs/tent-garden-tap-to-plant-detail.md` on local branch
`claude/tg-spec-plant-detail-affordance` (`0208208`). Its decision (tap opens **Plant Detail**, never Quick
Log) is folded into §4 so this file stands alone.

Claims carry the Sentinel labels. "Production" means `https://verdantgrowdiary.com`; nothing here is true
for production until a live `/version.json` reports a SHA that contains it.

---

## 1. Verdict on the prototype

**Not production ready.** It is a reviewed, isolated prototype on fictional data. The gap is integration,
not polish, so further work inside `spikes/` cannot close it.

| Requirement                   | State at `5b61288`                                                                                                                         | Label                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Runs in the app               | Standalone `spikes/tent-garden-prototype/index.html`. No file under `src/routes/`, no `appRouteManifest.ts` entry                          | `established fact`                                           |
| Real grower data              | Reads only `src/data/sampleGarden.js` (fictional by design). No Supabase read                                                              | `established fact`                                           |
| 3D library shipped by the app | Loads `three@0.170.0` from cdn.jsdelivr.net through an import map. `three` is not in `package.json`                                        | `established fact`                                           |
| CI                            | No workflow runs its 89 unit checks or its browser matrix. They ran only in a Claude workspace                                             | `established fact`                                           |
| App conventions               | Plain JS modules and DOM, not React components, the react-router compat shim, Tailwind or shadcn                                           | `established fact`                                           |
| Selection and labels          | Emulated desktop and phone, 4×4 and 5×5, four rotations: 403 PASS, 0 FAIL; visible pots 104/104 select their own plant; 0 leader crossings | `established fact` (headless SwiftShader; not a real device) |
| Real-phone performance        | Scene draw calls about 2.7k (4×4) and 5.3k (5×5) per frame; zero idle draws in the probe windows                                           | `NOT_MEASURED` on any real phone                             |
| Independent review            | None                                                                                                                                       | `NOT_MEASURED`                                               |

## 2. What the real data does and does not provide

All `established fact` from `src/integrations/supabase/types.ts` and `src/lib/*` on the deploy branch.

- **No plant positions exist anywhere.** `plants` has `tent_id`, `pot_size`, `stage`, `strain`, `name`,
  `health`, `is_archived`, `created_at`; `tents` has `size`, `name`, `stage`. No table holds a layout,
  slot or coordinate. The prototype's drag-to-arrange and saved layouts therefore have nowhere to live.
- **Tent size is free text** (`"4x4"`, `"5' x 5'"`, `"120x120 cm"`), validated by
  `tentSizeValidationMessage` in `src/lib/tentManagementRules.ts`; the dimension parser there
  (`tentSizeDimensions`) is not exported. Many tents have no size.
- **Pot size is free text** (`"3 gal"` appears in tests). It may be null.
- **Stages are six**, from `STAGES` in `src/lib/grow.ts`: `seedling`, `veg`, `flower`, `flush`,
  `harvest`, `drying`, labelled by `stageLabel()`. Test fixtures also show legacy spellings
  (`vegetative`, `flowering`, `vegetation`). The prototype knows only seedling/veg/flower/unknown.
- **No stage week.** Only `plants.started_at` exists. "Flower · week 5" in the prototype has no real source.
- **Reads:** `usePlants()` / `fetchPlants()` in `src/hooks/use-plants.ts` read non-archived plants through
  the RLS-scoped client. RLS is the boundary; the route guard is presentation only.

## 3. Owner decisions needed before any code (Matthew)

| #   | Decision                                                                    | Recommendation                                                                                                                | Why it is the owner's                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Add `three` as a runtime dependency (changes `package.json` and `bun.lock`) | Approve, pinned exact, loaded only by the new route's lazy chunk                                                              | Lockfile changes need Matthew to name the action (CURRENT_STATE fences; AGENTS.md off-limits list)                                                                                                                                                                                                                       |
| D2  | Where the page lives                                                        | New route `/tents/$id/garden`, linked once from Tent Detail                                                                   | Twelve open PRs (of 119 checked on 2026-10-17) edit Tent Detail or Plant Detail files: `src/pages/TentDetail.tsx` in #1986, #2078, #2114, #2148, #2186; `src/pages/PlantDetail.tsx` or its components and hooks in #2076, #2081, #2115, #2151, #2193, #2217, #2220. A separate route keeps the new code out of their way |
| D3  | Layout source                                                               | **V1: deterministic auto-placement, read-only.** Saved arrangements wait for a schema decision                                | Persisted positions need a migration; migrations and production database changes are Matthew's                                                                                                                                                                                                                           |
| D4  | Stages without a prototype look (`flush`, `harvest`, `drying`)              | Draw `flush` like flower; draw `harvest`/`drying` as an empty pot with the stage label; legacy spellings normalise to the six | It decides what growers see for real plants                                                                                                                                                                                                                                                                              |

Until D1 is approved, slice S1 (pure rules, no dependency) can still proceed.

## 4. V1 scope: a read-only Tent Garden page

**In:**

1. Route `/tents/$id/garden` (`access: "auth"` in `appRouteManifest.ts`), rendering a page component.
2. Data: the tent row and that tent's non-archived plants (`tent_id = $id`), from the existing reads.
   No new query surface, no writes, no RPC.
3. Deterministic auto-placement (§5) inside the tent footprint.
4. The approved storybook look: toon materials, ink outlines, lime buds, amber hairs, rounded pots, plant
   proportions, label cards and leader lines, exactly as in the prototype.
5. View controls: rotate ±90°, Reset View, Animation toggle (default off under `prefers-reduced-motion`),
   List view.
6. Selection: tap or click a pot or its label; Enter on a focused label; Escape anywhere clears it
   (except in dialogs and form fields). The details panel shows recorded facts only, with one explicit
   action **"Open Plant Detail"** → `/plants/<id>`. It never opens Quick Log and never writes.
7. Fallbacks: if WebGL is unavailable, or the 3D chunk fails to load, show List view with the reason.
   Zero plants: an empty-tent message with a link back to Tent Detail.

**Out (each needs its own spec and approval):** Edit Layout and saved positions (D3), the history slider and
dated snapshots, simulated events and notes, the pot-size picker, the tent picker, any write, Action Queue,
device control, sensor overlays.

## 5. Data truth rules (pure, typed, tested)

- **Placement:** sort plants by `created_at`, then `id`. Fill a near-square grid sized to the plant count
  inside the footprint, clamped so pots never overlap (reuse the prototype's `potsOverlap` and
  `clampToTent`). Same input gives the same layout on every device. Positions are not saved.
- **Footprint:** parse `tents.size` with a newly **exported** parser beside `tentSizeValidationMessage`
  (moved, not duplicated). Unparseable or missing size: draw a square footprint fitted to the plants
  and show "Tent size not recorded — layout is approximate". Never print an invented size.
- **Pot size:** parse gallons or litres from `plants.pot_size`. Missing or unparseable: draw the default pot
  and label it "Pot size not recorded". Never show the default as recorded.
- **Stage:** normalise through `STAGES`; label with `stageLabel()`. Unknown: "Stage not recorded",
  drawn as the prototype's unknown plant, never as healthy.
- **No week numbers.** Do not derive a stage week from `started_at`; it would be a guess.
- **The page header says "Auto-arranged — not your real layout"**, so no one mistakes placement for
  their room.
- **Untrusted input:** names and strains render as text only (no HTML), truncated with a full value in the
  details panel and List view.

## 6. Architecture and file plan

All new; nothing in `supabase/`, migrations, auth, RLS, Edge functions or the Action Queue.

| Path                                            | Layer             | Content                                                                                                                      |
| ----------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/tentGarden/tentGardenLayoutRules.ts`   | Rules             | Auto-placement, footprint, overlap (from `layoutRules.js`)                                                                   |
| `src/lib/tentGarden/tentGardenLabelRules.ts`    | Rules             | Label layout, leader routing, inset, no-crossing (from `labelLayoutRules.js`)                                                |
| `src/lib/tentGarden/tentGardenVisualRules.ts`   | Rules             | Stage/pot normalisation and labels (from `plantVisualRules.js`, extended per D4)                                             |
| `src/lib/tentGarden/tentGardenRenderRules.ts`   | Rules             | Render-on-demand, hardware fading, Escape rule (from `renderScheduleRules.js`, `hardwareVisibilityRules.js`, `modeRules.js`) |
| `src/lib/tentGarden/tentGardenViewModel.ts`     | ViewModel         | Tent + plants → scene items, labels, fallback state                                                                          |
| `src/lib/tentManagementRules.ts`                | Rules (edit)      | Export the existing size parser; no behaviour change                                                                         |
| `src/components/tentGarden/TentGardenScene.tsx` | Component         | Owns the Three.js renderer; dynamic `import("three")` only here                                                              |
| `src/components/tentGarden/TentGardenList.tsx`  | Component         | List view and the WebGL fallback                                                                                             |
| `src/pages/TentGarden.tsx`                      | Page              | Presenter; reads via existing hooks; navigation through `@/lib/react-router-compat`                                          |
| `src/routes/_app/tents_.$id.garden.tsx`         | Route             | File route                                                                                                                   |
| `src/lib/appRouteManifest.ts`                   | Data (edit)       | Add `/tents/:id/garden` as `auth`                                                                                            |
| `src/pages/TentDetail.tsx`                      | Page (edit, last) | One "Open Tent Garden" link, landed after the open TentDetail PRs settle                                                     |
| `src/test/tent-garden-*.test.ts(x)`             | Tests             | §8                                                                                                                           |
| `e2e/tent-garden.spec.ts`                       | E2E               | §8, `chromium-mocked`, explicit spec filter                                                                                  |

Conventions that bind (`established fact`, CLAUDE.md): all `*Rules.ts` pure with injected time and no
`Math.random`; copy in `src/constants/tentGardenCopy.ts`; tests in `src/test/`; no direct
`@tanstack/react-router` imports in components or pages.

## 7. Performance and accessibility budgets

- **Bundle:** `three` in the route's lazy chunk only; the first load of every other route must not grow.
  The measured gzipped chunk size is recorded in the PR (`NOT_MEASURED` today).
- **Rendering:** render on demand (as the prototype); no frames while idle.
- **Draw calls:** target under 600 per frame for nine plants. This needs instancing or merged geometry
  (the prototype's pending "proposal #3"). Measure before and after with the prototype's GL probe; do
  not claim a reduction without both numbers.
- **Real phone gate:** one mid-range Android and one iPhone, 5×5 sample: first interactive frame and
  rotate smoothness recorded. Until measured, the page stays unlinked from Tent Detail.
- **Accessibility:** every plant reachable without the canvas (List view and focusable labels); 44 px
  touch targets; visible focus; Escape behaviour per §4; contrast AA for labels on the scene background;
  reduced motion respected; the canvas has an accessible name and the List view link is announced.

## 8. Acceptance tests (each must be seen failing before its fix)

1. **Placement:** deterministic; no overlap for 1–12 plants in 2×2, 4×4, 5×5 and unknown footprints;
   archived plants and plants of other tents excluded.
2. **Truth labels:** missing tent size, pot size and stage each produce their "not recorded" text; no
   test fixture value is rendered as recorded when the field is null.
3. **Labels:** the prototype's 300-scene checks ported as-is: no card on another plant's pot or within
   22 px of it; no leader through a card or the Door card; no two leaders crossing (covered-pot last
   resort flagged); 8 px edge inset; a label is hidden only when no chip position is free.
4. **Selection (E2E, `chromium-mocked`):** for each rotation on desktop and 390×844 touch emulation, every
   visible pot selects its own plant, verified against the scene's visible-surface probe; every plant
   reachable by pot or label/chip; Open Plant Detail navigates to `/plants/<id>`.
5. **No writes:** the page issues only `GET`s; asserted by request interception in the E2E spec.
6. **Fallback:** WebGL unavailable → List view with all plants and the reason text.
7. **Route policy:** the manifest cross-check test passes with the new `auth` entry.

## 9. CI and release

- Unit tests land in `src/test/`, so the existing 32 Vitest shards run them; the E2E spec joins the
  `chromium-mocked` project. No new workflow.
- Merge gate unchanged: 35/35 required checks and an independent exact-head PASS. `.tsx` product files
  route to **Blue Dream**; the dependency/lockfile slice needs **Codex** (not on a PR Codex authored),
  Blue Dream, Critical Mass or Durban Poison.
- A merge is not a release. Production verification on `verdantgrowdiary.com` uses the disposable
  fixture account and its own grow only; the page is read-only, so no smoke write is needed.

## 10. Risks and rollback

- **Misread layout:** growers may read auto-placement as their real arrangement. Mitigation: the
  "auto-arranged" header label; the saved-layout feature is a separate decision (D3).
- **Heavy chunk on low-end phones:** mitigated by lazy loading and the real-phone gate; fallback to List.
- **Rollback:** remove the Tent Detail link (one line) to hide the page; revert the route PR to remove it.
  No data is written, so there is nothing to undo in the database.

## 11. Slices

| Slice | Content                                                              | Needs          | Review                                             |
| ----- | -------------------------------------------------------------------- | -------------- | -------------------------------------------------- |
| S1    | Port the pure rules + tests (§6 rules files, export the size parser) | Nothing new    | Critical Mass                                      |
| S2    | Add `three` (pinned)                                                 | D1             | Codex / Blue Dream / Critical Mass / Durban Poison |
| S3    | Scene, list, page, route, manifest, E2E                              | S1, S2, D2, D4 | Blue Dream                                         |
| S4    | Draw-call reduction with before/after GL probe numbers               | S3             | Blue Dream                                         |
| S5    | Real-phone measurement, then the Tent Detail link                    | S3, S4         | Blue Dream; Matthew publishes                      |

## 12. Known unknowns

- `NOT_MEASURED`: real-phone frame cost; gzipped size of the `three` chunk under this Vite build.
- `uncertainty`: how many production tents have a parseable `size` (needs a read-only count Matthew can run).
- `uncertainty`: whether growers want saved arrangements enough to justify a schema change (D3).

**Calibrated verdict:** the prototype is a sound basis for the look and the interaction rules, but it is
not production code. V1 as specified is a small, read-only, reversible page; it becomes production ready
only after D1–D4, slices S1–S5 with their tests, an independent PASS, and a real-phone measurement.
