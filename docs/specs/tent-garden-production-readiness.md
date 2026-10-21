# Spec — Tent Garden: from isolated prototype to a production page

**Author:** Claude (specification only; no application code in this slice)
**Revision:** 2, 2026-10-21. Supersedes revision 1 (`cc4dca26`, 2026-10-17). Change list: PR body.
**Status:** PROPOSED. D1–D4 decided by Matthew on 2026-10-21, each as recommended (§3). No slice (§13)
has a holder or a start instruction yet.

Claims carry the Sentinel labels. "Production" means `https://verdantgrowdiary.com`; nothing here is true
for production until a live `/version.json` reports a SHA that contains it.

---

## 0. Baseline and edit ownership

### 0.1 Exact baseline (`established fact`, read 2026-10-21 ~01:00 UTC)

| What                          | Ref / SHA                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| Deploy branch                 | `verdant-grow-diary` at `ac8c20fa14abe6f2d522b2988ed40d914d404887` (#2294, merged 23:54:15 UTC)  |
| Live build                    | `/version.json` reports commit `ac8c20fa14ab…`, `buildTime` 2026-10-20T23:54:41.644Z             |
| This spec's branch            | `claude/tg-production-readiness-spec`, PR #2232, head `cc4dca26b0ed`, 2 ahead / 61 behind deploy |
| Prototype (Claude)            | `claude/tent-garden-prototype-v0`, PR #2231, head `67bc60eff04b`, 24 ahead / 73 behind deploy    |
| Prototype refinements         | `cursor/tent-garden-ui-refinements-a243`, PR #2240 (stacked on #2231), head `29e0dc38e0e8`       |
| Prototype figures in this doc | Measured by Claude at `5b612885b22c` (revision 1). Not re-run since; see §1                      |

Every code fact in §2 and §6 was re-read at `ac8c20fa`. Line numbers move; re-verify before citing on
another ref.

### 0.2 Edit ownership

One holder per branch (AGENTS.md, "One task, one branch, one holder"). No Tent Garden block exists in
`docs/agents/HANDOFF_LOG.md` on the deploy branch, and no `claimed_by:` or `released_by:` comment exists
on #2231, #2232 or #2240 (`established fact`, 2026-10-21). Holders below come from each PR body. Before
anyone else edits one of these branches, the holder posts a claim (or release) comment.

| Branch / PR                                                  | Holder | Who may edit                                                                                |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| #2232 spec (`claude/tg-production-readiness-spec`)           | Claude | Claude only. A peer posts findings as review comments                                       |
| #2231 prototype (`claude/tent-garden-prototype-v0`)          | Claude | Claude only. Frozen as reference: no further prototype work is planned                      |
| #2240 refinements (`cursor/tent-garden-ui-refinements-a243`) | Cursor | Cursor only. Draft, "do not merge" by its own body; it targets #2231, not the deploy branch |
| Future S1–S5 branches                                        | none   | Each gets one holder when the owner assigns it (§13). Claude holds none of them by default  |

Lines that other open PRs edit (§0.3) stay **locked to those PRs' holders**. Tent Garden slices add
lines to three shared files (manifest, `package.json` script, feature flags), none of which an open PR
touches. The one riskier edit, the Tent Detail link in S5b, waits until no open PR edits
`src/pages/TentDetail.tsx`, or until that PR's holder agrees.

### 0.3 Overlapping open PRs

101 open PRs checked on 2026-10-21 (`established fact`; file lists from the GitHub API). Those touching
files this plan reads or edits:

| Planned edit (slice)                                        | Open PRs on the same file                                  | Same lines?                                     | Rule for the slice                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/pages/TentDetail.tsx` link (S5b)                       | #1986, #2114, #2186                                        | Not measured (the link's line is chosen in S5b) | Wait until these settle, or get the holder's yes                                        |
| `src/lib/appRouteManifest.ts` new entry (S3)                | #2023, #2028, #2287                                        | No: none touches a `/tents` entry               | Add one line; merge from base if one lands first                                        |
| `package.json` `e2e:mocked-closure` (S3)                    | #1879, #2086, #2216, #2290                                 | No: none touches that script                    | Same                                                                                    |
| `src/lib/featureFlags.ts` (S3)                              | none                                                       | —                                               | —                                                                                       |
| `src/lib/tentManagementRules.ts`, `src/lib/grow.ts`         | none                                                       | —                                               | Read only; not edited                                                                   |
| Plant Detail (read only: the target of "Open Plant Detail") | #2193, #2262, #2285 edit Plant Detail components and hooks | —                                               | Not edited by any slice                                                                 |
| `spikes/tent-garden-prototype/` (porting source)            | #2231 (Claude), #2240 (Cursor, stacked on #2231)           | —                                               | S1 ports from #2231's head, plus #2240's leader fix only if #2240 has merged into #2231 |

Revision 1 listed twelve overlapping PRs; #2076, #2078, #2081, #2115, #2148, #2151, #2217 and #2220 are no
longer open.

## 1. Verdict on the prototype

**Not production ready.** It is a reviewed, isolated prototype on fictional data. The gap is integration,
not polish, so further work inside `spikes/` cannot close it.

| Requirement                   | State                                                                                                                   | Label                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Runs in the app               | Standalone `spikes/tent-garden-prototype/index.html`. No file under `src/routes/`, no `appRouteManifest.ts` entry       | `established fact` at `ac8c20fa`                                                   |
| Real grower data              | Reads only `src/data/sampleGarden*.js` (fictional by design). No Supabase read                                          | `established fact` at `67bc60ef`                                                   |
| 3D library shipped by the app | Loads `three@0.170.0` from cdn.jsdelivr.net through an import map. `three` is not in `package.json`                     | `established fact` at `ac8c20fa`                                                   |
| CI                            | No workflow runs the prototype's checks                                                                                 | `established fact`                                                                 |
| App conventions               | Plain JS modules and DOM, not React, the react-router compat shim, Tailwind or shadcn                                   | `established fact`                                                                 |
| Unit checks                   | 89 pass / 0 fail at `5b612885`; #2240 reports 98 / 0 on its head                                                        | `source claim` (author-reported); independent re-run `NOT_MEASURED`                |
| Selection and labels          | Emulated desktop and phone, 4×4 and 5×5, four rotations: 403 PASS / 0 FAIL; visible pots 104/104 select their own plant | `source claim` from `5b612885`, headless SwiftShader; `NOT_MEASURED` independently |
| Draw calls                    | About 2.7k (4×4) and 5.3k (5×5) per frame; zero idle frames in the probe windows                                        | `source claim` from `5b612885`                                                     |
| Real-phone performance        | None                                                                                                                    | `NOT_MEASURED`                                                                     |
| Independent review            | Codex and Copilot reviewed #2232 rev 1 (findings folded in here); no PASS on any Tent Garden PR                         | `established fact`                                                                 |

## 2. What the real data does and does not provide

`established fact` at `ac8c20fa`, from `src/integrations/supabase/types.ts` and `src/lib/*`.

- **No plant positions exist anywhere.** No table holds a layout, slot or coordinate. The prototype's
  drag-to-arrange and saved layouts have nowhere to live.
- **`tents.size`** is `string | null`, free text (`"4x4"`, `"5' x 5'"`, `"120x120 cm"`). The save-side
  check `tentSizeValidationMessage` (`src/lib/tentManagementRules.ts`) rejects negative, zero or absurd
  dimensions but **accepts** text that does not describe one rectangle: a range (`"2-3 ft"`), a bare
  fraction (`"4x.5"` reads as 4 and 5), three numbers, or a number with no unit. Its helper
  `tentSizeDimensions` extracts numeric tokens for that check; it is not a footprint parser and stays
  unexported and unchanged.
- **`plants.pot_size`** is `string | null`, free text (`"3 gal"`).
- **`plants.stage`** is a non-null `string`; an empty or whitespace-only value is possible. `STAGES` in
  `src/lib/grow.ts` holds six values: `seedling`, `veg`, `flower`, `flush`, `harvest`, `drying`. Test
  fixtures also show legacy spellings (`vegetative`, `flowering`, `vegetation`).
- **No stage week.** Only `plants.started_at` exists.
- **Reads:** `fetchPlants()` / `usePlants()` (`src/hooks/use-plants.ts`) return every non-archived plant
  the RLS-scoped client can see; the page filters by `tent_id` on the client. No new query surface.
  RLS is the boundary; the route guard is presentation only.

## 3. Decisions D1–D4 (decided 2026-10-21)

Matthew keeps four decisions: production database changes, spend, anything that gates a publish, and the
publish decision (AGENTS.md). D1 is a named lockfile action and S5a and S5b each gate a publish; those
are his. D2 and D4 are product choices that are not among the four; they are decided by whoever Matthew
names for Tent Garden product calls, recorded on the PR. Until someone is named, they wait for Matthew.

**Recorded decision:** on 2026-10-21 Matthew approved all four as recommended, in the Claude Code
session that produced this revision: **D1 (a), D2 (a), D3 (a), D4 (a)**. D1 is the named lockfile
action for S2 only: add `three` pinned exact. It does not approve any other dependency or lockfile
change. Any later change to a decision is recorded here with its date.

| #   | Decision                                                          | Options                                                                                                                                                                                                                                                                                         | Recommendation (decided)                                          | Decider                                                                                              | Blocks          |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------- |
| D1  | Add `three` as a runtime dependency (`package.json` + `bun.lock`) | (a) pinned exact, lazy route chunk only; (b) no 3D: ship List-only                                                                                                                                                                                                                              | **(a) — decided**                                                 | Matthew (named lockfile action)                                                                      | S2, S4          |
| D2  | Page location and exposure                                        | (a) `/tents/$id/garden`, linked once from Tent Detail; (b) a tab inside Tent Detail; (c) List-first release, 3D later                                                                                                                                                                           | **(a) — decided**; keeps new code out of the open Tent Detail PRs | Named product decider, else Matthew                                                                  | S3, S5a, S5b    |
| D3  | Saved arrangements                                                | (a) none in V1: deterministic auto-placement, read-only; (b) saved positions (schema + migration)                                                                                                                                                                                               | **(a) — decided**. V1 needs no schema. (b) is a separate spec     | Matthew for (b), since it is a database change. (a) needs no decision beyond accepting this V1 scope | Nothing in V1   |
| D4  | What growers see per stage                                        | (a) **neutral visuals**: same pot and plant form for every stage, stage shown as text; (b) **illustrative stage art** (prototype look) with a persistent "Illustration — not your plant" label; (c) mixed: neutral for `flush`/`harvest`/`drying`/unknown, illustrative for seedling/veg/flower | **(a) — decided** for V1; (b) only with the label rule in §8      | Named product decider, else Matthew                                                                  | S4 visuals only |

**What D3/D4 no longer block.** Revision 1 put auto-placement (D3) and stage visuals (D4) inside S1. In
this revision S1 contains only rules that hold under every D1–D4 outcome (§13). Auto-placement is needed
in every outcome: it is the only layout source in V1 and the fallback for any later saved layout.
Stage **normalisation** (raw text → one of the six stages, missing or invalid) is needed in every outcome;
the stage **→ artwork** mapping is a separate data table that S4 fills after D4.

**Decision-independence is not permission to start.** A slice starts only when Matthew or the assigning
agent names a holder and says go (§13).

## 4. Release and rollback model

`practical observation`, 2026-10-20: merges to `verdant-grow-diary` have triggered a production deployment
automatically. #2294
merged at 23:54:15 UTC and live `/version.json` reported its build at 23:54:41 UTC; #2277 showed the same
pattern earlier the same day. Which publisher performs it is operating state recorded in
`docs/agents/CURRENT_STATE.md`, not here (`uncertainty` for this document).

Consequences that bind every slice:

1. **Treat every merge as reaching users.** A merge triggers the observed deployment path, so each
   slice must be safe to be live on its own. "Unlinked" is not hidden: a mounted route is reachable by
   URL. A merge **counts as released only when live `/version.json` reports a SHA that contains it**
   (AGENTS.md, release rules); until then the release, and any rollback step, is pending, not done. If
   the publisher is delayed or fails, nothing in this plan treats the code as live.
2. **Unfinished functionality stays inaccessible until acceptance** by a build-time flag,
   `tentGardenEnabled = false as const`, in `src/lib/featureFlags.ts` (the file's existing rule: flags
   default `false` until enabled after live verification). While it is `false`:
   - the Tent Garden route renders the same not-found page as the catch-all and returns before any data
     read; it never imports the 3D chunk;
   - no link to it exists anywhere;
   - an E2E test asserts both (§12, T12).
3. **Release in two steps, both on production** (Verdant has no other verification host; AGENTS.md,
   release rules). Each step gates a publish, so each merges only on Matthew's explicit yes with a
   release packet (live SHA, target SHA, commits, checks at the target, rollback target):
   - **S5a, dark launch:** set the flag `true` with **no link anywhere**. The page is then reachable only
     by typing its URL: the one exception to item 2, chosen by Matthew on 2026-10-21 because acceptance
     has to run on production. Acceptance (P1–P9, A1–A9) runs on `https://verdantgrowdiary.com` once live
     `/version.json` reports the S5a SHA. Any failure that cannot be fixed in place triggers the flag
     rollback below.
   - **S5b, link:** add the one Tent Detail link, only after every S5a receipt passes. The release is
     complete when live `/version.json` reports the S5b SHA and the link check in §13 passes.
4. **Rollback, in order of speed.** Agents never roll back; they prepare the step.
   - Flip `tentGardenEnabled` back to `false` (and remove the link if S5b landed): one PR through the
     normal merge gate. Use this for any Tent Garden defect. It is done only when live `/version.json`
     reports the rollback SHA and the route shows the not-found page again.
   - Revert the slice PR: same path, same verification.
   - Promote the previous production deployment on the publisher: Matthew's action, for a build-level
     failure that blocks merging.
   - No data is written, so there is nothing to undo in the database.
5. **Shared-chunk check per slice.** Every slice that changes `src/` records the first-load JS of three
   unrelated routes (`/`, `/dashboard`, `/tents/:id`) before and after, from the build output. Growth
   above 1 KB gzipped fails the slice.

## 5. V1 scope: a read-only Tent Garden page

**In:**

1. Route `/tents/$id/garden`, flag-gated (§4).
2. Data: the tent row and that tent's non-archived plants, from existing reads. No writes, no new RPC.
3. **List view, always available** (§9). It is the complete, accessible representation; the 3D scene is
   an optional view of the same data.
4. 3D scene: deterministic auto-placement (§7), visuals per D4 (§8).
5. View controls: rotate ±90°, Reset View, Animation toggle (off under `prefers-reduced-motion`),
   Scene/List switch.
6. Selection: tap or click a pot or its label; Enter on a focused label or list row; Escape clears it
   (except in dialogs and form fields). The details panel shows recorded facts only, with one action,
   **"Open Plant Detail"** → `/plants/<id>`. It never opens Quick Log and never writes.
7. Zero plants: an empty-tent message with a link back to Tent Detail; no scene is loaded.

**Out (each needs its own spec and approval):** Edit Layout and saved positions (D3b), history slider,
dated snapshots, simulated events and notes, pot-size picker, tent picker, any write, Action Queue,
device control, sensor overlays.

## 6. Data truth rules: missing versus invalid

Three states per field, never merged:

| State        | Meaning                                                           | Shown as                                                                                    | Drawn as                                                    |
| ------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Recorded** | Present and parses under the rules below                          | The normalised value                                                                        | To scale                                                    |
| **Missing**  | `null`, empty, or whitespace only                                 | "Tent size not recorded" / "Pot size not recorded" / "Stage not recorded"                   | Neutral default, marked approximate                         |
| **Invalid**  | Present but does not parse, or parses outside the plausible range | "Recorded as "‹raw text›" — can't be drawn" (raw text shown escaped, truncated at 40 chars) | Neutral default, marked approximate, plus an invalid marker |

A missing or invalid value is never rendered as recorded, never replaced by a guess, and never shown as
healthy. Raw text is always plain text, never HTML.

**Footprint (`tents.size`).** A new rendering-side parser, `parseTentFootprint`, in
`src/lib/tentGarden/tentGardenFootprintRules.ts`. Save-side validation in `tentManagementRules.ts` is not
touched. Grammar (case-insensitive, surrounding whitespace ignored):

- `W × D [unit]` or `W [unit] × D [unit]`, separator `x`, `X`, `×` or `*`, exactly two numbers;
- a number is digits with an optional decimal part (`4`, `4.5`, `4,5`); a leading `.` or `,` is invalid;
- units: `ft`, `'`, `′`, `feet`, `foot`, `in`, `"`, `″`, `cm`, `m`, `mm`; one unit applies to both; none
  means feet;
- plausible range after conversion: 30 cm to 600 cm per side.

Recorded: `4x4`, `5' x 5'`, `120x120 cm`, `2 x 4 ft`, `1.2 m x 1.2 m`. Invalid: `2-3 ft` (range),
`4x.5`, `4x4x6`, `4`, `four by four`, `0x4`, `100x100 ft`. Missing: `null`, `""`, `"  "`. When missing
or invalid, the footprint is a square fitted to the pots (§7) and the header says "Tent size not
recorded — layout is approximate" or "Tent size can't be drawn — layout is approximate".

**Pot (`plants.pot_size`).** `parsePotVolume`: one number with `gal`/`gallon(s)` or `l`/`L`/`litre(s)`/
`liter(s)`; no unit means invalid. Plausible range 0.25–100 gal (1–380 L). `"3 gal"`, `"11 L"`,
`"7.5 gallons"` are recorded; `"3"`, `"big"`, `"3-5 gal"`, `"500 gal"` are invalid.

**Stage (`plants.stage`).** `normaliseStage`: lower-case and trim; exact `STAGES` values are recorded;
`vegetative`/`vegetation` → `veg`, `flowering` → `flower`; empty is missing; anything else is invalid
and labelled "Stage "‹raw›" not recognised". `stageLabel()` supplies the visible label for recorded
values.

**No week numbers.** Nothing derives a stage week from `started_at`.

**Layout disclaimer.** The page header always reads "Auto-arranged — not your real layout".

## 7. Placement, crowding and oversized pots

- **Order:** `created_at`, then `id`. Same input, same layout on every device. Positions are not saved.
- **Pot diameter** comes from the recorded volume through one fixed table (`gal → cm`), or the 3 gal
  default when missing or invalid.
- **Fit test:** pots go on the most-square grid with `cols × rows ≥ n` and a 4 cm gap. The layout
  **fits** if every pot is fully inside the footprint and no two pots overlap.
- **Fits:** draw to scale.
- **Crowded** (the recorded pots do not fit the recorded footprint): do not overlap pots, do not clamp
  them on top of each other, and do not resize the footprint. Draw every pot at one uniform scale factor
  `s < 1` that makes the grid fit, and show the notice "Crowded: N pots of these sizes don't fit a
  ‹W × D› tent as recorded. Pots are drawn smaller than recorded." Each crowded pot's details say
  "Drawn at ‹s×100›% size".
- **Oversized pot** (one pot's diameter exceeds the shorter footprint side): same rule as crowded, and
  that pot's details say "Larger than the recorded tent".
- **Scene limit:** if `s < 0.5`, or `n > 25`, the scene is not drawn; the page opens in List view with
  the reason ("Too many plants to draw clearly — showing the list"). The List still shows every plant.
- **Footprint missing or invalid:** the fitted square sizes to the pots, so crowding cannot arise from
  the footprint; the approximate-layout header applies.

## 8. Visuals: neutral by default, illustrative only when labelled

The prototype draws buds, hairs and plant proportions per stage. Those are drawings, not observations of
the grower's plant. Rules:

- **Neutral (D4a, recommended):** every plant uses the same form; the stage appears only as text on its
  label card and in the details panel. Missing and invalid stages use the same form with their text.
- **Illustrative (D4b/c):** where stage art is used, the scene carries a persistent, non-dismissable
  caption "Illustrations show a typical ‹stage› plant, not your plant", and each label card and details
  panel names the stage in text. Art for a missing or invalid stage is the neutral form, never a
  healthy-looking plant.
- In both, no colour, glow or form implies health, vigour, yield or a problem. Plant health is not
  shown in V1.

## 9. List access is guaranteed

- A **List** control is the first focusable control in the page's main region, visible at every width,
  and works before, during and without the 3D chunk.
- The List renders from the view model alone; it never imports `three`.
- The page opens in List view when: WebGL is unavailable; the 3D chunk fails or takes more than 8 s;
  the scene limit (§7) applies; or the URL has `?view=list`. Each case shows its reason in text.
- `prefers-reduced-motion` does not force List view; it disables animation only.
- Every plant in the tent appears in the List exactly once with name, stage text, pot text, and any
  missing, invalid, crowded or oversized notes. Rows are buttons that open the same details panel.

## 10. Architecture and file plan

All new unless marked. Nothing in `supabase/`, migrations, auth, RLS, Edge functions or the Action
Queue.

| Path                                              | Layer            | Slice  | Content                                                                                                                                         |
| ------------------------------------------------- | ---------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/tentGarden/tentGardenFootprintRules.ts`  | Rules            | S1     | `parseTentFootprint`, `parsePotVolume`, `normaliseStage` (§6)                                                                                   |
| `src/lib/tentGarden/tentGardenLayoutRules.ts`     | Rules            | S1     | Order, fit test, crowding scale, scene limit (§7)                                                                                               |
| `src/lib/tentGarden/tentGardenLabelRules.ts`      | Rules            | S1     | Label layout and leader routing, ported from the prototype's `labelLayoutRules.js` with #2240's pot-obstacle fix, if #2240 lands first in #2231 |
| `src/lib/tentGarden/tentGardenRenderRules.ts`     | Rules            | S1     | Render-on-demand and Escape rules (from `renderScheduleRules.js`, `modeRules.js`)                                                               |
| `src/lib/tentGarden/tentGardenViewModel.ts`       | ViewModel        | S1     | Tent + plants → list rows, scene items, notices, fallback state                                                                                 |
| `src/constants/tentGardenCopy.ts`                 | Copy             | S1     | Every user-facing string in §6–§9                                                                                                               |
| `src/lib/featureFlags.ts`                         | Flag (edit)      | S3     | `tentGardenEnabled = false as const`                                                                                                            |
| `src/routes/_app/tents_.$id_.garden.tsx`          | Route            | S3     | File route. `$id_` opts out of the `tents_.$id` layout, which renders Tent Detail with no `<Outlet/>` (pattern: `grows_.$growId_.learning.tsx`) |
| `src/lib/appRouteManifest.ts`                     | Data (edit)      | S3     | `/tents/:id/garden`, `access: "auth"`                                                                                                           |
| `src/pages/TentGarden.tsx`                        | Page             | S3     | Presenter; flag check; existing hooks; navigation through `@/lib/react-router-compat`                                                           |
| `src/components/tentGarden/TentGardenList.tsx`    | Component        | S3     | List view and details panel                                                                                                                     |
| `src/components/tentGarden/TentGardenScene.tsx`   | Component        | S4     | Three.js renderer, instanced geometry; the only `import("three")`                                                                               |
| `src/lib/tentGarden/tentGardenArtRules.ts`        | Rules            | S4     | Stage → artwork table per D4                                                                                                                    |
| `src/pages/TentDetail.tsx`                        | Page (edit)      | S5b    | One "Open Tent Garden" link, after the S5a receipts pass                                                                                        |
| `src/test/tent-garden-*.test.ts(x)`               | Tests            | each   | §12                                                                                                                                             |
| `e2e/tent-garden.spec.ts`                         | E2E              | S3, S4 | §12, `chromium-mocked`, explicit spec filter                                                                                                    |
| `package.json` (`e2e:mocked-closure` script only) | CI wiring (edit) | S3     | Append `e2e/tent-garden.spec.ts` to that script's explicit spec list                                                                            |

The `e2e:mocked-closure` script is what the "Mocked E2E closure" job runs, a `mustBeGreen` context
path-filtered on `src/**`, `e2e/**` and `package.json`. Appending one spec path changes no dependency
and no workflow. The job's display name still says "15 previously unrun specs"; renaming it is a
workflow edit and is out of scope.

Conventions that bind (CLAUDE.md): `*Rules.ts` pure, clock injected, no `Math.random`; copy in
`src/constants/`; tests in `src/test/`; components and pages never import `@tanstack/react-router`.

## 11. Measurable acceptance: phone performance and accessibility

All are `NOT_MEASURED` today. A metric passes only with the device, OS, browser, build SHA and raw numbers
recorded in the PR. Three runs per metric; the median must pass.

**Reference devices:** one mid-range Android (Pixel 6a or Galaxy A54 class, Chrome stable) and one iPhone
(iPhone 12 or 13 class, current iOS, Safari). Fixtures: 9 plants in a 4×4 tent and 25 plants in a 5×5
tent (§12, T10).

| ID  | Metric                                                                               | Pass                             |
| --- | ------------------------------------------------------------------------------------ | -------------------------------- |
| P1  | List view interactive (all rows rendered and focusable), cold cache, from navigation | ≤ 2.0 s Android, ≤ 1.5 s iPhone  |
| P2  | First interactive 3D frame, cold cache / warm (chunk cached)                         | ≤ 3.5 s / ≤ 1.5 s, both fixtures |
| P3  | Lazy 3D chunk (three + scene), gzipped, from the build output                        | ≤ 200 KB                         |
| P4  | First-load JS of `/`, `/dashboard`, `/tents/:id` versus the base build               | growth ≤ 1 KB gzipped each       |
| P5  | Frame time during a 2 s rotation, 25 plants                                          | median ≤ 20 ms, p95 ≤ 33 ms      |
| P6  | Frames rendered in a 10 s idle window                                                | 0                                |
| P7  | Draw calls per frame (renderer info), 9 / 25 plants                                  | ≤ 300 / ≤ 600                    |
| P8  | Tap on a pot or label → details panel visible                                        | p95 ≤ 100 ms over 20 taps        |
| P9  | JS heap after 20 rotate-and-select cycles versus after the first                     | growth ≤ 10 MB                   |

P3, P4, P6 and P7 are also measured in CI or locally per slice; P1, P2, P5, P8 and P9 need the reference
devices and run on production during S5a. If P2 or P5 fails on a reference device and cannot be fixed, the release choice reverts to
D2(c), List-first.

| ID  | Accessibility criterion                                                                          | Pass                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | axe-core (already a devDependency) on the page in List view and Scene view, 390×844 and 1440×900 | 0 serious, 0 critical violations                                                                                                                                                    |
| A2  | List completeness, 25-plant fixture                                                              | 25 rows; each has name, stage text, pot text and its notes                                                                                                                          |
| A3  | Keyboard                                                                                         | Every control and row reachable with Tab in visual order; Enter opens details; Escape clears; no trap                                                                               |
| A4  | Target size at 390×844 and 320×568                                                               | Every interactive element ≥ 44×44 CSS px (bounding box)                                                                                                                             |
| A5  | Contrast                                                                                         | Text ≥ 4.5:1; focus indicator and control boundaries ≥ 3:1; label cards have an opaque background so the scene behind them cannot lower contrast                                    |
| A6  | Reduced motion                                                                                   | With `prefers-reduced-motion: reduce`, 0 animation frames except a user-initiated rotate, which snaps without animation                                                             |
| A7  | Reflow                                                                                           | At 320 px width and 200% zoom, no horizontal page scroll; List fully usable                                                                                                         |
| A8  | Screen readers (manual: VoiceOver on iOS Safari, TalkBack on Chrome Android)                     | The canvas is announced as "Tent illustration, N plants. Use the list for details."; each list row announces name, stage, pot and notes; any illustrative caption (§8) is announced |
| A9  | Not by colour or form alone                                                                      | Missing, invalid, crowded, oversized and illustrative states each have visible text                                                                                                 |

## 12. Acceptance tests (each seen failing before its fix)

1. **Footprint, pot and stage parsing:** every recorded, missing and invalid example in §6 is a test
   case, including `2-3 ft`, `4x.5`, `4x4x6`, `0x4`, `100x100 ft`, `null`, `""`, `"  "`, `3-5 gal`,
   `vegetative`, empty stage.
2. **Missing versus invalid rendering:** for each field, a missing fixture shows its "not recorded"
   text. An invalid tent size or pot size shows "Recorded as "‹raw›" — can't be drawn"; an invalid stage
   shows "Stage "‹raw›" not recognised" (§6). Neither state shows a default as recorded.
3. **Placement:** deterministic across runs; no overlap and every pot inside the footprint for 1–25
   plants in 2×2, 4×4, 5×5, missing and invalid footprints; archived plants and other tents' plants
   excluded.
4. **Crowded and oversized:** ten 7 gal pots in a 2×2 tent → crowded notice, uniform `s < 1`, no
   overlap; one 100 gal pot in a 2×2 → oversized note; `s < 0.5` → List view with reason.
5. **Labels:** the prototype's label checks ported (no card on another pot or within 22 px; no leader
   through a card or another pot; no crossing leaders; 8 px edge inset).
6. **Selection (E2E, `chromium-mocked`):** each rotation, desktop and 390×844 touch emulation: every
   visible pot selects its own plant; every plant reachable by pot, label or list row; Open Plant Detail
   navigates to `/plants/<id>`.
7. **No mutations (E2E):** request interception fails the test on any `POST`, `PATCH`, `PUT` or `DELETE`
   to `/rest/v1/*` (other than `rpc/*`), any `/rest/v1/rpc/*` call other than an allow-list of existing
   read-only shell calls (`has_role`), any `/functions/v1/*` call, and any `/storage/v1/*` write. The
   authenticated shell's `has_role` read-RPC (a POST, from `AppSidebar` via `useHasRole`) is allowed.
8. **Fallbacks:** WebGL unavailable, 3D chunk aborted, 3D chunk delayed past 8 s, and `?view=list` each
   open List view with all plants and the reason text.
9. **Visual truth (D4):** under neutral visuals, two plants with different recorded stages render the
   same form; under illustrative visuals the caption is present, and a missing or invalid stage renders
   the neutral form.
10. **25 plants:** a 25-plant fixture in a 5×5 tent: List has 25 rows (A2); the scene draws 25 pots or
    takes the scene-limit path per §7; P7 draw calls recorded; selection test 6 passes for all 25; a
    26-plant fixture opens List view.
11. **Route policy:** the manifest cross-check passes with `/tents/:id/garden`.
12. **Flag off (E2E):** with `tentGardenEnabled = false`, `/tents/<id>/garden` shows the not-found page,
    issues no plant read, loads no 3D chunk, and no page links to it. **Dark launch (E2E, S5a):** with
    the flag `true` and before S5b, the page renders and still no page links to it.
13. **Accessibility:** A1–A7 automated in the E2E spec; A8 as a recorded manual receipt.

**Where they run.** Unit tests live in `src/test/`, so the 32 Vitest shards run them. The E2E spec runs
through the `e2e:mocked-closure` script (§10), so the "Mocked E2E closure" context executes it on every
PR touching `src/**`, `e2e/**` or `package.json`. Until S3 lands that wiring, each slice attaches an
exact-head receipt of the spec run. The real-phone metrics and A8 are S5a production receipts, not CI.

## 13. Slices

Each slice: one holder, named by Matthew or the assigning agent; one branch; draft PR before code; an
independent exact-head PASS from a reviewer who did not touch it; 35/35 required checks; merged by
Chemdawg. Every merge triggers the deployment path (§4), so each slice must be safe to be live alone;
it counts as live only once `/version.json` reports it.

| Slice | Content                                                                                                                             | Live effect after merge                                                                                             | Needs                                        | Review                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| S1    | Pure rules, view model, copy and their unit tests (§10 S1 rows)                                                                     | None: nothing imports them                                                                                          | Holder + go. No D1–D4                        | Critical Mass (no `.tsx`)                                                                    |
| S2    | Add `three`, pinned exact, nothing imports it yet                                                                                   | None; P4 check proves no chunk changes                                                                              | D1                                           | Codex (not if Codex authored or repaired it), Blue Dream, Critical Mass or Durban Poison     |
| S3    | Flag (`false`), route, manifest, page, List view and details panel, E2E spec and its wiring; no 3D                                  | None for users: route renders not-found while the flag is off (T12)                                                 | S1, D2                                       | Blue Dream (`.tsx`)                                                                          |
| S4    | 3D scene with instancing, meeting P3, P6 and P7 on first landing; art table per D4                                                  | None for users: still behind the flag                                                                               | S2, S3, D4                                   | Blue Dream                                                                                   |
| S5a   | Dark launch: set the flag `true`, no link. Then take P1–P9 and A1–A9 on production with the QA account, at the live S5a SHA (below) | Page reachable by URL only; complete only when live `/version.json` reports the SHA                                 | S4, D2, Matthew's publish yes                | Blue Dream reviews; Matthew decides the publish; the merge triggers the configured publisher |
| S5b   | Add the one Tent Detail link                                                                                                        | The feature becomes discoverable; complete only when live `/version.json` reports the SHA and the link check passes | All S5a receipts pass, Matthew's publish yes | Blue Dream reviews; Matthew decides the publish; the merge triggers the configured publisher |

**How S5 is measured.** With the flag `false` (every head before S5a), the route returns before
rendering, so no earlier build can exercise the page, and Verdant has no non-production host to measure
on. S5a therefore turns the page on without a link, and the receipts are taken on
`https://verdantgrowdiary.com` after live `/version.json` reports the S5a SHA. They use the reference
devices and the disposable QA account on its own fixture tent (read-only page, so no writes). Each receipt
names the live SHA; a later deploy voids receipts taken before it. A failing receipt is fixed in a new PR
(re-measured at its live SHA) or answered with the flag rollback in §4. S5b merges only after every
receipt passes; after S5b is live, the link check confirms Tent Detail shows the link and it opens the
page.

Revision 1 split the scene (S3) from its draw-call reduction (S4) and measured phones only afterwards
(S5). That would have merged a scene known to run at 2.7k–5.3k draw calls. Here the scene lands only
once it meets the budgets, nothing is reachable before S5a, and nothing is linked before S5b.

## 14. Risks

- **Misread layout:** growers may read auto-placement as their room. Mitigation: the header disclaimer;
  saved layouts are D3(b).
- **Misread artwork:** stage art may look like a picture of the plant. Mitigation: neutral visuals by
  default; illustrative art only with the caption (§8).
- **Heavy chunk on low-end phones:** lazy loading, P2/P3/P5 gates, and the List fallback.
- **Auto-deploy exposure:** handled by the flag (§4); T12 proves it per slice.

## 15. Known unknowns

- `NOT_MEASURED`: every P and A metric; the gzipped `three` chunk under this Vite build.
- `uncertainty`: how many production tents have a `size` that `parseTentFootprint` accepts, and how
  many plants have parseable `pot_size`. A read-only count needs a production read, which is Matthew's.
- `BLOCKED` for S5a until it exists: a disposable QA login with its own fixture tent (owner item, pending
  since VER-216). The S5a receipts and the S5b link check need it.
- `uncertainty`: whether the publisher always deploys on merge; observed for two merges on 2026-10-20,
  not a contract.
- `uncertainty`: whether growers want saved arrangements enough to justify a schema change (D3b).

**Calibrated verdict:** the prototype is a sound basis for the interaction and label rules; with D4(a)
decided, V1 does not use its stage artwork. It is not production code. V1 as specified is a read-only,
flag-gated, reversible page with a guaranteed List. With D1–D4 decided, it is production ready only after
S1–S5b with their tests and independent PASSes, the S5a device and accessibility receipts taken on
production, and Matthew's publish decision for each of S5a and S5b.
