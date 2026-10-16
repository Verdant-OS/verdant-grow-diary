# Spec — Tent Garden: tap a pot → Quick Log for that plant

**Author:** Claude (specification; no application code in this slice)
**Date:** 2026-10-16
**Status:** PROPOSED — awaiting owner approval and a Codex/Grok holder. Prototype-only today.
**Scope:** the isolated prototype under `spikes/tent-garden-prototype/` and, if the owner later
promotes it, one explicit navigation affordance in the app. No Quick Log write-path change.

Claims are labelled per the Sentinel evidence discipline.

---

## 1. Why

The Tent Garden diorama currently answers "where is what". The product spine is
Grow → Tent → Plant → Quick Log; the diorama earns its place only if a grower can go from a pot
they can see to a log for that plant in one explicit step. `established fact` (AGENTS.md,
Product Context).

## 2. Fences that bind this slice

- Quick Log persists through the single `quicklog_save_manual` path only.
  `established fact`: `docs/specs/one-tent-loop-quicklog-single-write-path.md` §1;
  CLAUDE.md "Repository operating facts".
- Target selection is **explicit or route-derived only**; remembered-target and only-plant
  auto-selection are banned and test-pinned. `established fact`: CLAUDE.md.
- A Plant Detail route carries a route-derived `plant:<uuid>` target; malformed ids fail closed.
  `established fact`: `src/lib/quickLogRouteTargetRules.ts` `resolvePlantQuickLogRouteTarget`.
- Tent Detail publishes target evidence to the shell through `TentQuickLogTargetContext`;
  the shell resolves it with `resolveMobileQuickLogTarget`. `established fact`:
  `src/context/TentQuickLogTargetContext.ts`, `src/components/AppShell.tsx` L103–128.
- The prototype never writes to a diary: its events are `source: "simulated"`.
  `established fact`: `spikes/tent-garden-prototype/src/rules/saveRules.js`.

## 3. Decision

**A tap is an explicit selection, and the affordance is navigation, not a write.**

The diorama shows, for the selected plant, one button: **"Log for <shortName>"**. Activating it
navigates to that plant's Plant Detail route. The existing route-derived target rule then
supplies `plant:<uuid>` to Quick Log. Nothing new reads or sets a target; no remembered state is
introduced; the write path is untouched.

Rejected alternatives:

- _Set the Quick Log target directly from the tent scene._ Adds a third target source beside
  "explicit form choice" and "route"; the ban on remembered targets exists because such sources
  drift. `inference` from CLAUDE.md fence history.
- _Open the Quick Log sheet in place over the diorama._ Needs tent-scoped evidence plumbing
  (`TentQuickLogTargetContext`) and a WebGL canvas under a modal on phones; defer until a real
  device run exists (see §7).

## 4. Prototype contract (fictional data, local only)

| Element          | Rule                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button placement | Details panel, under the plant name; hidden when no plant is selected or when viewing a historical snapshot (`view.point.isToday === false`).                                    |
| Label copy       | `Log for {shortName}` — pinned in `src/constants`-style `as const` export inside the spike so a test can assert the exact string.                                                |
| Action           | `onLogForPlant(id)` handler; in the prototype it shows a toast "Would open Quick Log for {shortName} ({id}) — prototype, nothing recorded." No draft, no event, no state change. |
| Keyboard         | Reachable by Tab from the details panel; Enter/Space activates.                                                                                                                  |
| Touch            | ≥ 44 px on coarse pointers (already in `styles.css`).                                                                                                                            |
| History          | Never shown for snapshots: a log is always "now", not a recorded date.                                                                                                           |
| Edit mode        | Shown but disabled while a draft has unsaved changes, with title "Save or cancel the layout draft first" — a log must not silently abandon a draft.                              |

Pure rule to add: `logAffordanceState({ selectedId, isToday, mode, hasUnsaved }) →
{ visible, enabled, reason }` in `src/rules/modeRules.js`, with node tests for each row above.

## 5. App contract (only if the owner promotes the diorama into the app)

- Route: a Tent Detail sub-view, not a new top-level route; `appRouteManifest.ts` unchanged
  until then. `inference`.
- Handler: `navigate(`/plants/${plantId}`)` through the react-router compat shim
  (`src/lib/react-router-compat.tsx`) — zero direct TanStack imports in components.
  `established fact`: CLAUDE.md "compat shim".
- Plant ids in the app are UUIDs; the prototype's `P-101` ids are fixtures and must not be
  passed to any route resolver. The promotion slice replaces fixture ids with real ids from
  the tent's plant query and keeps the fail-closed UUID check.
- No change to `quickLogRouteTargetRules.ts`, `useQuickLogV2Save.ts`, RPC enums, schema, RLS.

## 6. Acceptance

| Check                                                       | Expect                                                                                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --test spikes/tent-garden-prototype/test/*.check.mjs` | new `logAffordanceState` cases pass; red first without the rule                                                                                                                                          |
| Browser (scripted, headless Chromium)                       | select P-103 on Today → button visible + enabled; enter Edit, nudge → button disabled with reason; history snapshot → button absent; activate on Today → toast text matches; snapshot `events` unchanged |
| App promotion (later)                                       | `src/test/app-shell-mobile-quick-log-routing.test.tsx` still green; a new test proves `/plants/<uuid>` is the only side effect                                                                           |

## 7. Open before promotion

- Real-phone run of the diorama (`NOT_MEASURED`): frame time, heat, touch feel.
- Decision on three.js as a bounded, lazy-loaded dependency (lockfile change → Codex review).
- Whether "Log for" should also carry the last Quick Log timestamp on the label (recorded data
  only; "not recorded" state required).

## 8. Safety verdict

PASS as a specification: no fake data, no automation, no device control, no Action Queue
touch, no write-path change, no remembered target. The only side effect proposed is a
navigation the grower initiates on a plant they tapped.
