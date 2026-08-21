# One-Tent Loop — Tranche A Specification (Codex handoff)

**Status:** APPROVED — Cheek, 2026-08-19 ("approved by all"; approval also ratifies the
copy strings in §8).
**Author:** Claude (Knowledge Library & Product Specification Architect).
**Implementer:** Codex.
**Verified against:** deploy branch `verdant-grow-diary`, tip
`f3b3fc49eacc48def4d366236229b31001242241` (2026-08-18). Every file:line anchor below
was read directly at that tip and adversarially re-verified (3-lens review: 0 blockers,
0 refuted anchors).
**Scope class:** context-threading wiring. No schema, no migrations, no new routes, no
new Quick Log write paths, no UI rewrites.

This tranche is the first implementation slice of the One-Tent Loop Efficiency Program
(engagement 1 audit: 11 surfaces, 119 findings, 67 high/medium adversarially verified,
0 refuted). It extends the approved `ONE_TENT_LOOP_OPERATING_ORDER` slice — it is not a
competing rewrite. Headline audit conclusion this tranche acts on: **the tired-grower
contract (3-tap chip save) is already shipped in `PlantQuickLog`; the product routes
growers away from it and drops context at seams.** Tranche A fixes the wiring.

---

## 0 · HANDOFF

```text
HANDOFF
from_agent: Claude (Knowledge Library & Product Specification Architect)
to_agent: Codex
sentinel_version: 2026-08-09.3
date: 2026-08-19

completed:
  - Verified friction audit of the One-Tent Loop (11 surfaces, 67 hi/med findings, 0 refuted)
  - Precision extraction for all 5 Tranche A items: exact current code, minimal change
    design, edge cases, per-file test-pin inventory
  - This specification, including rulings on every judgment call; Cheek approval 2026-08-19

verified_by:
  - All anchors read from a detached checkout pinned at deploy tip f3b3fc49e
  - Adversarial verification passes: audit 62 CONFIRMED / 5 ADJUSTED / 0 REFUTED;
    spec review 3 lenses, 0 blockers, all corrections folded in
  - Consumer verification for every threaded param (quoted in §3)

not_done:
  - No code written or tested; no vitest/tsc run occurred (read-only extraction)
  - Sensors→/doctor context carry (owner decision D4) — excluded, see §10
  - Tranches B/C/D — out of scope

unknowns:
  - Whether any e2e job in current ci.yml runs Playwright against PR source rather
    than the deployed app (repo docs say deployed; verify before treating e2e copy
    regexes as same-commit gates)
  - Runtime pass counts for new/updated tests — NOT_MEASURED until Codex runs them

blocked:
  - Live verification of grower-visible changes remains owner-gated (managed e2e
    session BLOCKED; signup incident #969 unapplied) — ship on CI + unit proof

assumptions:
  - Deploy tip may move past f3b3fc49e before implementation. Codex must branch from
    current origin/verdant-grow-diary, re-verify each anchor region (and re-run
    `rg "verdant:entry-created" src` for A5d) before editing. If an anchor region has
    materially changed, hand back rather than adapt silently.

next_slice:
  - Codex implements PR-A1 first (smallest, highest user value); the five PRs are
    independent and may land in any order

files_touched:
  - none (specification only)
```

---

## 1 · Ground rules & fences (every PR)

- **Branch discipline:** branch from current `origin/verdant-grow-diary`, never `main`.
  Verify base freshness. The merge queue rejects `BEHIND` PRs — update-branch and wait
  for fresh checks before enqueue.
- **Scope:** no schema, no migrations, no new routes (verified: nothing here adds a
  route — the manifest is untouched), no new Quick Log write paths
  (`quicklog_save_manual` single-write-path spec is frozen), no UI rewrites, no copy
  changes beyond §8.
- **PR slicing:** five independent PRs — PR-A1 … PR-A5. Every PR lands its test
  renegotiations **in the same commit** as the behavior change (PR #630 class). A5's
  sub-items (a)–(d) ship in one PR: (b)'s listeners double-fire until (d) removes the
  duplicate dispatch.
- **Static-pin discipline:** never whole-file-Prettier a legacy file. Never loosen a
  pinned regex — update it to pin the new exact shape. Write new source pins with
  `\s+`/`[\s\S]` tolerance across wrap points.
- **No-go vocabulary** in every edited file (existing fences scan them): `pi_bridge`,
  `mqtt`, `webhook`, `relay`, `actuator`, `device_command`, `home_assistant`,
  `service_role`, `raw_payload`, auto-approve/auto-execute variants,
  `navigator.sendBeacon`; additionally the literal `action_queue` anywhere in
  `src/pages/Alerts.tsx` (code **or comments** — `alert-events.test.ts:334`), and the
  literals `alerts`/`action_queue`/`ai_doctor_sessions` anywhere in
  `quickLogV2RefreshRules.ts`.
- **Proximity-window pins:** `mobile-quick-log-single-fab.test.ts` uses
  `{0,300}`–`{0,400}` windows around AppShell anchors and
  `dashboard-mobile-layout-safety.test.ts:47` a `{0,400}` window around the FAB
  classes — do not insert large blocks between pinned anchors even without changing
  either anchor.
- **Early CI stop-ship step** (`ci.yml:406`) runs `route-manifest-sync` +
  `alerts-route-quick-link-contract` on every PR — an Alerts.tsx pin miss fails fast.
  First checklist item for PR-A5.
- **Local validation:** the deploy branch's typecheck gate is `bun run typecheck`
  (= `tsc -p tsconfig.json --noEmit`; root tsconfig is `strict: true` here, and
  `tsconfig.app.json` does **not** exist on this branch — that is a main-branch
  convention; verified at ci.yml:232/:611). Also run `bun run typecheck:tsgo` as a
  fast second opinion (it has caught union errors tsc missed on this branch).
  Windows-local full-suite vitest carries ~22 known machine-local failures unrelated
  to any diff; CI is the gate.

---

## 2 · A1 — Route the mobile "+" FAB through the plant resolver (PR-A1)

**Objective:** on `/plants/:uuid`, the global mobile FAB opens the legacy Quick Log
**plant-scoped** with exactly the guarantees the shipped `?open=quick-log` intent path
provides, instead of unscoped. Everywhere else: byte-identical to today.

**Mechanics you inherit (do not rebuild):** the intent path passes only `{ plantId }`;
the legacy QuickLog owns resolution — `resolveQuickLogPrefillTarget`
(`quickLogTargetIntegrityRules.ts:162-196`) derives growId/tentId from the grower's own
plant rows and fails closed to a held-empty editor with calm blocked copy for every
unprovable case (plant not found / archived / merged / no grow / no tent / tent
archived / tent-grow mismatch / queries pending). An explicit grower Select change
releases the hold.

**The change (one edit point)** — `src/components/AppShell.tsx:331`, FAB `onClick`
else-branch; replace `setPrefill(null);` with route-derived conditional prefill (keep
statement order — scoped-close first, open last):

```tsx
} else {
  const routePlantId = resolvePlantQuickLogRouteTarget(location.pathname);
  setOpenScopedLog(false);
  setStructuredOpenIntent(null);
  setPrefill(routePlantId ? { plantId: routePlantId } : null);
  setOpenLog(true);
}
```

No import changes (resolver already imported at AppShell.tsx:27-30). Do **not** bump
`legacyQuickLogSession` here. Do **not** modify either resolver in
`quickLogRouteTargetRules.ts`.

**Behavior:** proven plant → dialog opens plant-preselected. Unprovable plant →
held-empty + blocked copy (inherited). `/plants/new`, non-UUID, encoded junk,
sub-paths → resolver null → today's exact unscoped dialog. `/tents/:uuid` → unchanged
(tent branch fires first; regexes disjoint). V2 sheet open → closed first (existing
single-modal guarantee). Cross-grow plant → prefill hold switches activeGrowId
(existing behavior).

**Doctrine:** route-derived context matches the sanctioned tent-FAB precedent; nothing
remembered or inferred is introduced — `quicklog-plant-default.test.tsx` pins "prefill
plantId wins" while banning last-target/only-plant auto-selection. Rejected
alternatives (V2-sheet FAB target, PlantQuickLog from the shell, AppShell fetching the
row, event round-trip) are documented in the session extraction record; the V2-sheet
question is a Tranche B owner decision.

**Tests — same commit:**

| File | Action | Content |
| --- | --- | --- |
| `src/test/app-shell-mobile-quick-log-routing.test.tsx` | add 2 (+1 optional) | (1) renderAt `/plants/${PLANT_ID}` (const exists at :15), click `mobile-quick-log-fab`, expect legacy mock with `data-plant-id=PLANT_ID`, scoped sheet absent. (2) renderAt `/plants/new`, click FAB, expect legacy with `data-plant-id=""`. (3, optional) plant-route variant of the V2-close-first case at :212. |
| `src/test/mobile-quick-log-single-fab.test.ts` | add 1 static fence | `expect(APP_SHELL).toMatch(/setPrefill\(routePlantId \? \{ plantId: routePlantId \} : null\)/)`. Do **not** pin `resolvePlantQuickLogRouteTarget\(location\.pathname\)` alone — it already matches the intent effect (vacuous). |
| Existing suites | no edits | Verified: zero existing case clicks the FAB on a plant route; all pins in the A1 closure (§7) survive. Run them anyway. |

PR body release note: on mobile, the "+" button on a plant's page now opens Quick Log
with that plant selected (or a calm confirm-target hold) instead of an empty picker.

---

## 3 · A2 — Thread grow scope through the loop rules' back half (PR-A2)

**Objective:** the ai-doctor and alert steps of `OneTentLoopNextStepCard` carry
`?growId=` when known; the tent step's latent "Open plant"→tent-self-link bug is closed
the way the grow step's identical bug was closed. **One file; zero page edits** — both
producer pages already pass growId into the card, and both destinations verifiably
consume it (Alerts: `useScopedGrow` at `Alerts.tsx:89-90`, fail-closed, feeding
`useAlertsList` at :120-124; ActionQueue: `effectiveGrowId = urlGrowId ?? activeGrowId`
defined at `ActionQueue.tsx:384`, scoping the query at :548-551).

**Explicitly excluded:** the `sensor-snapshot → "/doctor"` branch (owner decision D4 —
untouched) and the action-queue step's bare `"/actions"` (self-referential card on
/actions itself; `action-queue-landing-one-tent-loop.test.tsx:189` pins it in a
full-page render).

**Edit points — `src/lib/oneTentLoopNavigationRules.ts` only:**

| Line | Change |
| --- | --- |
| 16 | `import { actionsPath, alertsPath, timelinePath } from "@/lib/routes";` |
| 144 | After the ids destructure: `const normalizedGrowId = typeof growId === "string" && growId.trim().length > 0 ? growId.trim() : null;` + comment: normalization only (blank → null → bare index path), never validation — validation stays on the consuming pages. Name must be `normalizedGrowId`, not `scopedGrowId`. Leave the quick-log branch's own inline guard untouched. |
| 154–155 | Tent branch: **delete** `if (tentId) return enable(base, \`/tents/${tentId}\`);` so the branch is plantId-or-disabled, plus a grow-step-style never-self-link comment. Precedent: rules:147-151 + regression test :55-61. The fallback is unreachable from the app (TentDetail is the sole `current="tent"` mount and never passes tentId). |
| 188 | ai-doctor fallback: `return { ...enable(base, alertsPath(normalizedGrowId)), ctaLabel: "Review alerts" };` — alertId branch at :187 verbatim; the relabel spread is load-bearing (pinned). |
| 195 | alert fallback: `return enable(base, actionsPath(normalizedGrowId));` — actionId branch and the approval-required comment block (:190-193) verbatim. |

`alertsPath(null)`/`actionsPath(null)` return bare paths (routes.ts:12-27), so every
existing bare-path pin passes unchanged; both helpers URL-encode; both destinations
fail closed on unknown/archived scope — threading raw `urlGrowId` grants no new trust.
Deep-link branches deliberately do not carry growId.

**Tests — same commit:**

| File | Action | Content |
| --- | --- | --- |
| `one-tent-loop-navigation-rules.test.ts:79` | replace | The tentId-only pin protects the bug. Replace with: tentId-only → `disabled:true`, href null, `disabledReason === ONE_TENT_LOOP_DISABLED_COPY`, and `ctaLabel "Open plant"` pinned together with destination-absence; tentId+plantId → `"/plants/p1"`; plus `expect(r.href ?? "").not.toMatch(/^\/tents\//)`. |
| `one-tent-loop-navigation-rules.test.ts` (:153, :164 areas) | add | ai-doctor: `{growId:"g1"}` → `"/alerts?growId=g1"` + `"Review alerts"`; `{growId,alertId}` → `"/alerts/a1"`; whitespace growId → bare `"/alerts"`. alert: `{growId:"g1"}` → `"/actions?growId=g1"` + `"Add to Action Queue"` + not `^/alerts`; `{growId,actionId}` → `"/actions/x1"`. Existing bare pins untouched. |
| `one-tent-loop-next-step-card.test.tsx:19` | update | Switch fixture to `ids={{ plantId: "p1" }}` → `"/plants/p1"` + "Open plant"; add sibling: tentId-only renders `-disabled` testid + `queryByTestId(…-cta)` null. |
| `tent-detail-one-tent-loop-card.test.tsx:60` | rewrite | Invert into the disabled assertion (tentId-only → disabled, no cta testid). Siblings :109-132 already encode post-fix behavior — untouched. |
| `ai-doctor-one-tent-loop-card.test.tsx` · `alerts-one-tent-loop-card.test.tsx` | add | One card-level regression each: `ids={{growId:"g1"}}` → `"/alerts?growId=g1"` + /Review alerts/i; `"/actions?growId=g1"` + /Add to Action Queue/i + not `^/alerts`. Keep the pinned literal "Action Queue items are approval-required." untouched. |
| `one-tent-loop-static-safety.test.ts` | no edits | The added routes import trips none of its six scans (verified pattern-by-pattern). |

---

## 4 · A3 — Plant/tent names instead of raw UUIDs at decision moments (PR-A3)

**Objective:** Action Queue pending rows and the Explain drawer identify their target
tent/plant by name; Alert Detail and Action Detail label tent/plant links with
sanitized names, never UUIDs. The drawer/view-model chain already supports this and is
test-pinned — the gap is page-side wiring plus two small modules. **Do not modify**
`actionQueueViewModel.ts`, `ActionQueueDetailDrawer.tsx`, or `IdField`.

### New modules

**`src/lib/tentPlantDisplayLabel.ts`** (new, pure) — the `growDisplayLabel` analog.
Imports `{ looksLikeUuid }` from `@/lib/growDisplayLabel` (do not redefine the regex).
Exports `TENT_DISPLAY_FALLBACK = "View tent"`, `PLANT_DISPLAY_FALLBACK = "View plant"`,
`formatTentDisplayLabel(name, _id?)`, `formatPlantDisplayLabel(name, _id?)` — same body
shape as `formatGrowDisplayLabel`: trimmed non-empty non-UUID name, else fallback.
Header comment mirrors: "Never returns a raw UUID-shaped string." Fallback rationale
(ruled): "View tent" states the affordance without claiming the row's state — a failed
name fetch is not evidence the tent is gone.

**`src/lib/actionContextNameLookup.ts`** (new, never-throw I/O) —
`fetchTentNamesByIds(ids: ReadonlyArray<string | null | undefined>)` →
`Record<string, { name: string }>`;
`fetchPlantNamesByIds(ids: ReadonlyArray<string | null | undefined>)` →
`Record<string, { name: string; strain: string | null }>` (nullable inputs required —
call sites pass `list.map(r => r.tent_id)`). Supabase client import:
`@/integrations/supabase/client`. Body: dedupe + `isUuid` pre-filter (from
`@/lib/isUuid`; non-UUID ids never trigger a query — this keeps the ~24 existing
rendering suites with fixture ids like `t1` passing unmodified); empty → `{}`; whole
builder chain inside try/catch: `.from("tents").select("id,name").in("id", unique)`
(plants: `"id,name,strain"`); error/miss/throw → `{}`; skip rows whose name is empty or
`looksLikeUuid`. Deliberately **no** `is_archived` filter — archived targets keep their
honest names. Never reuse `growRepo.fetchTent/fetchPlant` (they throw).

**`src/lib/actionQueueRowView.ts`** (append) — `ActionRowContextLookups` (a **local**
structurally-compatible type — do not import `DrawerContextLookups` from
`actionQueueViewModel`: import cycle; precedent `StatusControlKind` at :99-104) +
`buildActionRowContextLabel(row: { tent_id?: string | null; plant_id?: string | null },
lookups: ActionRowContextLookups | undefined)` → `"Tent: <name>"` / `"Plant: <name>"` /
`"Tent: X · Plant: Y"` / `null` when nothing resolves (rows never showed UUIDs; the
drawer owns the calm no-context copy). Plant precedence nickname→strain mirroring
`plantLabelFor`; guard every segment with `looksLikeUuid`.

### Page wiring

| File:line | Change |
| --- | --- |
| `ActionQueue.tsx:409` | Add `tentNamesById` / `plantNamesById` state (typed per the helpers). |
| `ActionQueue.tsx:559` | Inside `load()` after `setRows(list)`: `Promise.all([fetchTentNamesByIds(list.map(r => r.tent_id)), fetchPlantNamesByIds(list.map(r => r.plant_id))])` → set both maps. Must stay OUT of the load's error/toast path — a name failure can never block the approval queue. (tent_id/plant_id already in the row select — verified at :540; no query widening.) |
| `ActionQueue.tsx:~930` | `contextLookups` useMemo: `{ growsById: Object.fromEntries(grows.map(g => [g.id, { name: g.name }])), tentsById: tentNamesById, plantsById: mapped }` where plants map `name→nickname` (+ strain) — the plants table has no nickname column; the viewModel's contract is nickname-first. |
| `ActionQueue.tsx:1623` | Pending rows only, between the reason paragraph and the links div: `{(() => { const ctx = buildActionRowContextLabel(row, contextLookups); return ctx ? (<p className="text-xs text-muted-foreground mt-1" data-testid="action-queue-row-context-names">{ctx}</p>) : null; })()}`. Reviewed rows deliberately get none (decision, not oversight). |
| `ActionQueue.tsx:2001` | Drawer: `lookups={contextLookups}`. |
| `AlertDetail.tsx` | Imports (formatters, fetchers, `useGrows`); `tentName`/`plantName` state; one cancellation-guarded effect keyed on `[alert]` after the load callback (~:158), mirroring ActionDetail :303-322. **Constraint:** effect body must not contain the substring `action_queue` and must sit away from the idempotency-probe effect (`v0-operating-loop-contract.test.ts:191` scans an 800-char window). Line 547: real grow name — `formatGrowDisplayLabel(grows.find(g => g.id === alert.grow_id)?.name ?? null, alert.grow_id)` (ruled in scope; severable). Lines 559/572: link text → `formatTentDisplayLabel(tentName, alert.tent_id)` / `formatPlantDisplayLabel(plantName, alert.plant_id)`; keep `to=` expressions byte-identical (pinned); add `data-testid="alert-detail-tent-label"` / `"alert-detail-plant-label"`. |
| `ActionDetail.tsx` | Same imports/state; effect keyed on `[row]` after :322. Lines 745-750: append `displayLabel={formatTentDisplayLabel(tentName, row.tent_id)}` + `data-testid="action-detail-tent-label"` (plant analog) — **attribute order strictly AFTER `to=`**: `action-detail-context-links.test.ts` pins `<IdField[^>]*to=\{tentDetailPath…` and `[^>]*` spans newlines, so Prettier wrapping is safe but reordering is not. IdField unchanged — `displayLabel` both replaces the text and drops the mono-UUID styling. |

**Misses:** null id → element not rendered / segment omitted. Fetch miss or
RLS-invisible → "View tent"/"View plant" link text; drawer omits the line or shows the
pinned "No related diary context found yet." UUID-shaped stored name → treated as
unresolved everywhere. First paint shows the fallback for one frame — calm, mirrors the
shipped `sourceAlertStatus` pattern.

**Tests — same commit:** new `tent-plant-display-label.test.ts` (mirror
`grow-display-label.test.ts`); new `action-context-name-lookup.test.ts` (mocked
supabase: happy path; error → {}; malformed chain → {}; non-UUID ids → {} with **no
query issued**; UUID-shaped/empty names dropped; dedupe into one `.in()`); new
`action-queue-context-names.test.tsx` (mock skeleton from
`action-queue-focus-deep-link.test.tsx:74-114`: row context line renders; raw UUIDs
nowhere in textContent; drawer names resolve; empty fixtures → calm miss; static pin
that ActionQueue passes `lookups={contextLookups}`); extend
`action-detail-context-links.test.ts` + `alert-detail.test.ts` with displayLabel pins
and negative UUID-link-text pins. Existing suites: expected zero edits (non-UUID
fixture ids short-circuit the fetch) — verified statically; run the full glob closure
(§7) before trusting it.

---

## 5 · A4 — Five trust fixes (PR-A4)

**(a) Sensors source summary counts aged live rows as Live.** `Sensors.tsx:22` add
`import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";` ·
`Sensors.tsx:766` add `options={{ staleMs: LIVE_CURRENT_STATE_STALE_MS }}` to
`SensorSourceSummaryWidget`. Nothing else changes — the widget/rules no-options default
is pinned (`sensor-source-summary-widget.test.tsx:38`), which is why the fix is
call-site-only. Only live ages out (pinned contract); `now` not threaded;
`PlantSensorSourceBreakdownCard` deliberately unchanged (§10). Add a Prettier-tolerant
static pin: `/SensorSourceSummaryWidget[\s\S]{0,400}?staleMs:\s*LIVE_CURRENT_STATE_STALE_MS/`.

**(b) Persisted `stale`/`invalid` sources render "Unavailable — not recognized".**
`growDataSourceLabelRules.ts:11` extend the union with `"Invalid"`; after the Simulated
branch (:147) insert two explicit branches (explicit provenance wins before
value/timestamp checks): `source === "stale"` → `{ label: "Stale", severity: "warning",
message: "Reading is labeled stale — older than the freshness window.",
shouldDisplayBadge: true, isTrustedForAi: false, reasons: ["source persisted as
stale"] }`; `source === "invalid"` → same shape, `label: "Invalid"`, message
`"Reading is labeled invalid — not treated as healthy data."`.
`GrowDataSourceBadge.tsx:20` add `Invalid: "destructive"` to `VARIANT_BY_LABEL`
(exhaustive Record — compile error if missed). A persisted stale label is never
re-promoted by a fresh timestamp. Tests: add behavior cases to
`grow-data-source-label.test.ts` + one badge render case (`data-label='Invalid'`).

**(c) PlantDetail "Updated X ago" stamps the plant's start date.** Ruling: **delete
the caption** — no truthful per-activity timestamp exists on the plant row
(`mapPlantRow` drops `updated_at`, which bumps on any row edit), and truthful diary
`entry_at` timestamps already render twice on the page. Delete the caption `<p>` at
`PlantDetail.tsx:625-627`; change :80 to `import { format } from "date-fns";`
(`formatDistanceToNow`'s only use is the caption — remove the dead import for hygiene;
nothing forces it: deploy's tsconfig has `noUnusedLocals: false`). Verified: no test
pins the removed literal; run the `plant-detail-*` closure.

**(d) Timeline snapshot chip hardcodes °F.** `Timeline.tsx:147` add
`import { formatTemperatureDisplay } from "@/lib/temperatureUnitPreference";` ·
:2487-2491 replace the chip body with `{formatTemperatureDisplay(sensor.temp,
{ valueUnit: "C", unit: temperatureUnit, digits: 1 })}` (guard stays; `temperatureUnit`
in scope at :345; NaN now renders "Unknown"). **Caution:** do not touch the
`sensor_snapshot ?? e.details?.sensor` marker (:2226) or the "Manual snapshot" literal
(:2484) — both pinned. Add static pins: matches
`/formatTemperatureDisplay\(sensor\.temp,/`, does NOT match `/\* 9\) \/ 5 \+ 32/`.

**(e) "Notes" filter chip is a no-op.** Ruling: **fallback-only semantics** (mirrors
the shared `classifyTimelineEntry` fallback-to-notes contract). `Timeline.tsx:271` →
`const kinds: EventFilter[] = [];` · immediately before `return kinds;` (:298) insert
`if (kinds.length === 0) kinds.push("note");` + one-line comment. Every entry still
belongs to ≥1 bucket. Semantics note for the PR body: photo/measurement entries leave
the Notes bucket — deliberate. New `timeline-notes-filter-fallback.test.ts`: static
pins on both new lines and absence of `= ["note"]`.

**(f) Bridge testbench panel renders ungated on the snapshot page.** Ruling:
**collapse, do not role-gate** — token minting is documented grower EcoWitt onboarding
(the panel's own doc, `TentBridgeTokensCard` precedent, bridge docs; every ingest path
is bearer-authenticated), so a role gate would break real setup. At `Sensors.tsx:780-784`
replace the wrapper div with a closed-by-default disclosure:
`<details className="mt-4 max-w-2xl" data-testid="sensors-testbench-setup-disclosure">`
+ `<summary className="cursor-pointer text-sm font-medium text-muted-foreground">EcoWitt
bridge setup & testbench</summary>` + unchanged `<SensorsTestbenchPanel … />`
(outer condition stays). **Do not modify `SensorsTestbenchPanel.tsx`** — 5+ static-scan
suites pin that file. The closed panel still mounts and runs its three small read-only
queries — accepted for minimality (lazy-mount deferred, §10). Add a static pin that the
panel renders inside the disclosure testid.

PR body release note: tents with a dead live feed will honestly show Live: 0 / Stale: N
— labels tightened, no rows changed. "Invalid" is a new badge word.

---

## 6 · A5 — Post-save freshness parity, Alerts filter persistence, single dispatch (PR-A5)

**(a) All-activities save route performs zero invalidation.** Placement ruling: **the
host component, never the hook** — 16 bare `renderHook(() => useQuickLogActivitySave())`
sites across three suites (picker-and-routing: 12, success-telemetry: 3,
manual-rpc-contract: 1) have no QueryClientProvider and would crash; the hook's header
pins it as a thin routing hook. Edits in `QuickLogAllActivitiesSection.tsx`: imports
(`useQueryClient`, `applyQuickLogV2Refresh`); `const queryClient = useQueryClient();`
at :217; at both confirmed-success points — immediately before the photo-branch
dispatch (:606) and immediately after `savedGrowEventId = result.growEventId ?? null;`
(:649):

```ts
const refreshScope = capturedTarget.plantId
  ? { targetType: "plant" as const, targetId: capturedTarget.plantId, tentId: capturedTarget.tentId }
  : { targetType: "tent" as const, targetId: capturedTarget.tentId ?? "", tentId: capturedTarget.tentId };
applyQuickLogV2Refresh(queryClient, refreshScope);
```

Grow-only saves (both ids null) hit the refresh rules' defensive branch → broad
ALWAYS_KEYS refresh, never a wrong-target refresh. Failure paths early-return before
the new calls. **Same commit:** wrap every render in these **four** suites in a
QueryClientProvider (`new QueryClient({ defaultOptions: { queries: { retry: false,
gcTime: 0 } } })`): `quick-log-all-activities-integration.test.tsx`,
`quick-log-harvest-form.test.tsx`, `quick-log-harvest-form-vocab-a-wiring.test.tsx`,
`quick-log-harvest-stage-section-integration.test.tsx`.
(`quick-log-harvest-stage-callsite-wiring.test.ts` is a pure readFileSync scan —
nothing to wrap; stays in the verify-only closure. Verified: no other suite renders the
section without a provider.) **Fence:** do not add keys to `quickLogV2RefreshRules.ts`
— and never the literals `alerts`/`action_queue`/`ai_doctor_sessions` there (two
static-safety twins ban them).

**(b) Dashboard + GrowDetail recent-activity never refresh in place.** Copy Timeline's
listener verbatim into both hooks — after the mount effect in
`useDashboardScopedData.ts` (:216) and `useGrowDetailData.ts` (:591):

```ts
useEffect(() => {
  const h = () => load();
  window.addEventListener("verdant:entry-created", h);
  return () => window.removeEventListener("verdant:entry-created", h);
}, [load]);
```

Do **not** add a `verdant:sensor-reading-created` listener (neither hook's read set
includes sensor rows). No debounce. Hook return shapes unchanged; the named export
`fetchDashboardDiaryRows` keeps its name (test import at collection time).

**(c) Alerts filters into the URL.** Pattern ruling: **searchParams-as-source-of-truth**
(the AiDoctorSessionsIndex pattern — two enum Selects, no debounced text, no
pagination). In `Alerts.tsx`: extend the react-router-compat import with
`useSearchParams`; replace the two useState lines (:117-118) with URL-derived values
allow-listed against `STATUS_OPTIONS`/`SEVERITY_OPTIONS` (absent/invalid → `"all"`),
plus:

```ts
const setFilterParam = (key: "status" | "severity", value: string) => {
  const next = new URLSearchParams(searchParams);
  if (value === "all") next.delete(key); else next.set(key, value);
  setSearchParams(next, { replace: true });
};
```

Wire the two Select `onValueChange` handlers (:269, :283). Param names
`status`/`severity` (collision-free — /alerts consumes only `growId`; `alertId` is a
path param). "all" never written; replace-history; copying `searchParams` preserves
`growId`. **First checklist item:** `alerts-route-quick-link-contract.test.tsx` (early
CI stop-ship step) pins `useScopedGrow`/`urlGrowId` reads — they survive (the rewrite
doesn't touch :89-90). The `'Filter by status'`/`'Filter by severity'` label literals
are pinned separately by `alerts-foundation.test.ts:150-151` (in the closure) — they
also survive (only the onValueChange handlers change). If filter taps visibly
scroll-jump, add `preventScrollReset: true` same commit. **Add tests (mandated):**
`/alerts?status=open&severity=critical&growId=g-1` → `useAlertsList` receives those
values; `?status=bogus` → "all"; selecting "all" deletes the param and preserves
`growId`.

**(d) One save, one event.** Removal-site ruling: **delete `AppShell.tsx:358`** — the
`onCreated={() => window.dispatchEvent(new Event("verdant:entry-created"))}` prop on
the AppShell QuickLog mount. `QuickLog.tsx` is **not touched at all**: its
detail-carrying dispatch is canonical — pinned by two static suites, and DailyCheck
reads `detail?.createdAt`. AppShell's bare-Event duplicate is pinned by zero tests
(verified), the prop is optional, GrowRoomMode already mounts without it, and every
listener either ignores detail or null-guards it. Restores the documented exactly-once
contract. **Add** a negative static pin in `app-shell-quick-log-consolidation.test.ts`:
AppShell.tsx does NOT match `/verdant:entry-created/`. Before landing, re-run
`rg "verdant:entry-created" src` at your base.

---

## 7 · Cross-cutting pin inventory — the same-commit contract

Three pin classes, three moves: **exact-shape source pins** → update to the new exact
shape same-commit, never loosen; **occurrence counts** (exactly one `<QuickLogV2Sheet>`
in AppShell ×2 suites; `.is("retracted_at", null)` lower-bounds: Timeline 2,
useDashboardScopedData 1, useGrowDetailData 3 — additions safe, removals break) → keep
true; **fences** → never edited, simply not tripped.

Verify-only closures per PR (run, expect green, fix in-commit if not):

| PR | Closure (beyond the named edits) |
| --- | --- |
| A1 | mobile-quick-log-single-fab · app-shell-quick-log-consolidation · plant-detail-quicklog-handoff · structured-water-routing-static · quick-log-route-target-rules · quicklog-plant-default · app-shell-mobile-quick-log-routing · dashboard-mobile-layout-safety · global-search-quick-log-fallback-rules · funnel-events-wiring |
| A2 | one-tent-loop-static-safety · action-queue-landing-one-tent-loop · timeline-one-tent-loop-card · grow-detail-one-tent-loop-card · plant-detail-one-tent-loop-card · plant-detail-one-tent-loop-quick-log-handoff · sensors-one-tent-loop-card |
| A3 | full action-queue* + alert-detail* + action-detail* families — **enumerate by glob, not count** (~89 files at the pinned tip; incl. v0-operating-loop-contract, action-queue-raw-token-leak-guard, action-queue-ux-static-safety, alert-detail-a11y, action-queue-view-model, action-queue-detail-drawer, scoped-grow-navigation-contract, grow-display-label) |
| A4 | sensor-source-summary-widget · sensor-source-summary-rules · sensor-source-ux-phase2-static-safety · sensors-data-source-badge · aud-003-sensors-stale-label-rules · simulated-source-disclosure · legacy-sensor-provenance-fence · sensors-tent-selection-wiring · stage-aware-temp-rh-routes-wiring · sensors-operator-diagnostics-wiring · manual-sensor-active-tent-handoff · operator-visibility-wiring-static-safety · all sensors-testbench-* static suites · plant-detail-* family · timeline-entry-classification · quicklog-timeline-manual-label · sensor-snapshot-ui-evidence-audit · action-followup-visibility-ui · action-response-memory-surfaces · quicklog-corrections-static-safety · timeline-date-range-filter · temperature-unit-preference-hardening |
| A5 | alerts-route-quick-link-contract (**first** — early CI step) · alert-events · alerts-foundation · alerts-route-polish · alerts-center-real-generation · daily-check-entry-source · daily-check-post-submit · daily-check-refresh · daily-check-real-quicklog-target-remount · plant-timeline-invalidation · v0-loop-bug-fixes · timeline-merge-wireup · quick-log-v2-refresh-rules (+ twins) · quick-log-v2-refresh-static-safety (+ hardening twin) · quick-log-timeline-confirmation · quick-log-activity-save-manual-rpc-contract · quick-log-activity-picker-and-routing · quick-log-success-telemetry-hooks · symptom-guide-static-safety · quick-log-harvest-pre-persistence-gate · quick-log-harvest-stage-callsite-wiring · quicklog-target-contract · dashboard-scoped-activity · dashboard-grow-data-boundary · grow-activity-spine-merge · grow-detail-* family · diary-reader-retraction-compat · action-follow-up-quicklog-handoff |

Out-of-scope confirmations: `action-queue-empty-state-next-steps.test.tsx` pins
ActionQueue's empty-state `/timeline` and `/sensors` links — those links are NOT part
of this tranche; leave code and test alone. `sensors-metric-state-*` testids are pinned
by zero tests — free for new assertions, no renegotiation. No `appRouteManifest.ts`
change anywhere in this tranche.

---

## 8 · Copy ratified (approved with this spec, 2026-08-19)

| Where | String |
| --- | --- |
| A3 link fallbacks | "View tent" · "View plant" |
| A3 row context line | "Tent: \<name>" · "Plant: \<name>" · "Tent: \<name> · Plant: \<name>" |
| A4(b) badge label + messages | "Invalid" · "Reading is labeled stale — older than the freshness window." · "Reading is labeled invalid — not treated as healthy data." |
| A4(f) disclosure summary | "EcoWitt bridge setup & testbench" |
| A4(c) | (removal only — "Updated X ago" caption deleted) |

---

## 9 · Validation & reporting (per PR)

```bash
bun run typecheck        # = tsc -p tsconfig.json --noEmit (this branch's CI gate; strict:true)
bun run typecheck:tsgo   # recommended second opinion (has caught union errors tsc missed)
bunx vitest run <every edited/added test file> --reporter=dot
bunx vitest run <the PR's §7 closure> --reporter=dot
bunx vitest run --reporter=dot   # full suite; expect only known local noise, CI gates
```

Report per the constitution's format — exact counts; never "all green" unless
everything relevant ran:

```text
Targeted tests:
Full suite:
Type-check:
Runtime harness: NOT_APPLICABLE (no RLS/billing surface in this tranche)
Skipped:
Introduced failures:
Pre-existing failures:
```

e2e note: `quicklog-smoke` and the golden-path spec run against the deployed app /
managed session — post-deploy signals, not same-commit gates. Do not claim live
verification; it is owner-gated.

---

## 10 · Deferred ledger (explicitly not in this tranche)

- Sensors→/doctor context carry — owner decision D4; branch stays bare `"/doctor"`.
- Action-queue step growId threading — self-referential card, pinned full-page test.
- Alerts passing validated `scopedGrowId` (vs raw `urlGrowId`) into the loop card —
  safe as-is; one-line tightening for a later slice.
- `PlantSensorSourceBreakdownCard` staleMs — different provenance path; deliberately
  unchanged.
- Reviewed-rows context line (A3) — excluded by decision; same one-liner after
  ActionQueue.tsx:1850 if later wanted.
- Lazy-mount for the testbench disclosure — must first handle the panel's reveal-reset
  effect so a just-minted token can't be lost mid-reveal.
- "Last activity" block hidden when lastNote is empty — pre-existing cosmetic.
- V2-sheet vs legacy dialog as the plant-route capture surface — Tranche B owner
  decision (D2); A1 deliberately mirrors the shipped intent path.

---

## 11 · Safety verdict & rollback

**Safety verdict: SAFE.** Every change is presentation, navigation, or client-cache
wiring. No schema, no RLS, no edge functions, no new write paths; no auto-creation or
auto-approval surface touched; approval-required posture, calm copy, canonical source
labels, and fail-closed provenance preserved verbatim and in several places newly
test-fenced. The only trust-label semantic changes are in the honest direction.

**Rollback:** each PR independently revertible with no data migration and no cross-PR
coupling (A5's sub-items travel and revert together). A1/A2 alter emitted hrefs and
prefill only.

**Calibrated verdict:** fully specified against deploy tip `f3b3fc49e` with every edit
point, edge case, and test renegotiation enumerated and adversarially cross-checked.
Residual risk: anchor drift if deploy moves before implementation (mitigated by the
re-verify instruction in HANDOFF) and statically-unprovable suite surprises, which the
per-PR closures catch in-commit. **APPROVED — proceed to implementation (Codex).**
