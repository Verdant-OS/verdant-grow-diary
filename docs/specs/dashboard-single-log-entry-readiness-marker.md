# Dashboard — one Log entry, stable readiness marker

Status: **SPEC — implementation BLOCKED only on GDP decisions D1.1 and D1.2** (see §1, §7). #1833
merged 2026-10-03 as `04a36937`.
Author: Claude, 2026-10-01. Audited at deploy tip `0107d9406` (`verdant-grow-diary`, #1836),
#1833 head `f296a953`, #1793 head `074f4349`. Updated 2026-10-01 17:35 UTC for #1849 (re-land of #1793,
head `c2d473e8`). Updated 2026-10-02 15:12 UTC: #1849 merged, #1793 closed, review findings on
#1844 addressed (routing to GDP; single-entry test counts buttons too). Updated 2026-10-02
15:39 UTC: browser-level count includes app-chrome triggers; D1 split into D1.1–D1.3. Re-stamped
2026-10-04 against deploy tip `a980489a`: #1833 merged, §1 and §3 re-checked with `git grep`.

Every claim carries a label: `established fact` (read from source at the SHAs above),
`source claim`, `inference`, `uncertainty`, `missing evidence`.

---

## 1. Preconditions

| Gate                                                             | State at 2026-10-04 (deploy tip `a980489a`)          | Label              |
| ---------------------------------------------------------------- | ---------------------------------------------------- | ------------------ |
| #1833 `feat(dashboard): One-Tent Home first fold` merged         | **MERGED** 2026-10-03 15:21 UTC as `04a36937`        | `established fact` |
| #1849 `test(e2e): … (re-land of #1793)` merged                   | **MERGED** 2026-10-01 18:38 UTC as `b5d06488`        | `established fact` |
| #1793 `test(e2e): measure signed-in readiness…` merged or closed | **CLOSED** 2026-10-01 18:38 UTC, superseded by #1849 | `established fact` |
| D1 decided by GDP (§7)                                           | OPEN                                                 | `established fact` |

#1793's work landed through #1849. The deploy branch (`80176bad`) now carries
`e2e/signed-in-performance.spec.ts:35` with `control: "dashboard-daily-grow-check-entry"`, as
#1849's owner agreed (issuecomment-5936713821), so this slice edits E1 on the deploy branch in
the same commit (§5.2). At `a980489a`, `git grep -n dashboard-daily-grow-check-entry` (excluding
`docs/agents/CURRENT_STATE.md` receipts) returns 12 lines: the producer at
`src/pages/Dashboard.tsx:509`, plus 11 consumer lines that are exactly the rows in §3 (E1 :35, E2
:1994, E3 :253, U1 :40/:44/:49, U2 :260/:266, U3 :176/:315, U4 :60). The unit is grep lines, not
rows. E4 and U4 :48 don't name the test ID, so grep doesn't count them. (Re-run 2026-10-04.)
#1799 / #1800 do not reference the header test ID (`established fact`, `gh pr diff`), so they
need nothing.

---

## 2. Problem, restated against source

- `src/pages/Dashboard.tsx:509-515` (at `a980489a`) renders a `PageHeader` action
  `<Button data-testid="dashboard-daily-grow-check-entry">` → `withGrowId("/daily-check", scopedGrowId)`,
  label `Quick Log`. It exists **only in the loaded branch** (return from line 493); the error branch
  (422-445) and loading branch (447-489) render a header with no actions. `established fact`
- #1833 (merged as `04a36937`) adds `<TonightTentHomeCard … logHref={withGrowId("/daily-check", homeTent?.growId ?? scopedGrowId)} />`
  (`Dashboard.tsx:536` at `a980489a`)
  directly below the `PageHeader`. Its `Log` link (`data-testid="tonight-tent-home-log"`,
  label `Log`) renders only when `selection.kind === "tent"`; `"none"` returns `null`,
  `"choose"` renders tent links with no Log. `established fact`
- Selection (`resolveTonightTentSelection`): 0 tents → `none`; 1 tent → `tent/only`; several
  tents → `tent/connected` if the activation tent is among them, else `choose`. `established fact`

So for a one-tent grower the first fold shows two adjacent `/daily-check` CTAs
(`Quick Log` outline + `Log` primary). This slice removes the header one.

---

## 3. Every consumer of `dashboard-daily-grow-check-entry` (deploy tip `a980489a`, re-checked 2026-10-04)

| #   | File                                                                      | Use                                                                                                            | How it breaks                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | `e2e/signed-in-performance.spec.ts:35` (#1849; #1793)                     | `control:` for `dashboard-ready`; asserts `toBeVisible()` then `toBeEnabled()`                                 | element gone → timeout → `BLOCKED` receipt                                                                                                                                                                                                                                                                                                                                                                                                    |
| E2  | `e2e/core-link-form-census.spec.ts:1994`                                  | `toHaveAttribute("href", "/daily-check")`                                                                      | element gone                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| E3  | `e2e/ui-overhaul-responsive.spec.ts:253`                                  | `readySelector`, cardinality `exact-one` + `toBeVisible()` (`expectSelectorCardinality`, line 1062)            | element gone                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| E4  | `e2e/dashboard-mobile-overflow.spec.ts:149`                               | `getByRole("link", { name: "Quick Log", exact: true }).first()` visible at 390/320 px                          | **not in the brief.** On mobile the only Dashboard link named `Quick Log` is the header link: `AppShell` `header-quick-log-trigger` is a `<button>` and `hidden md:inline-flex`; `QuickLogV2Fab` is a `<button>` and `hidden md:inline-flex`; `MobileNav`'s `Quick Log` link lives in the closed More sheet (`inference` — sheet content not mounted while closed; verify). Fixture has one tent, so the card renders `Log`, not `Quick Log`. |
| U1  | `src/test/dashboard-daily-grow-check-single-surface.test.ts:36-51`        | source pins: test ID present, `>Quick Log<`, `withGrowId("/daily-check", scopedGrowId)`, header-actions window | removed text                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| U2  | `src/test/dashboard-grow-scoped-cta-render.test.tsx:256-267`              | rendered href scoped / unscoped                                                                                | element gone                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| U3  | `src/test/daily-grow-check.test.ts:175-178`, `:312-317`                   | source pins on the test ID and `to={withGrowId("/daily-check", scopedGrowId)}>Quick Log<`                      | removed text                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| U4  | `src/test/dashboard-mobile-density-section-headings.test.ts:48`, `:57-62` | `withGrowId("/daily-check", scopedGrowId)`; header-actions window anchored on the test ID                      | expression no longer present (#1833's call passes `homeTent?.growId ?? scopedGrowId`)                                                                                                                                                                                                                                                                                                                                                         |

No `docs/**` file references the test ID except `CURRENT_STATE.md` receipts, which are
history and are **not** edited. `established fact` (repo-wide grep)

---

## 4. Decision — the readiness marker

**`data-testid="dashboard-ready"` on the existing loaded-branch `PageHeader` actions
wrapper** (`<div className="flex items-center gap-2 flex-wrap">`, `Dashboard.tsx:507` at `a980489a`).

Why this element:

1. **Same render boundary as the old control.** It is the parent of the removed button, so
   it mounts in the same React commit — present only after `tentsQuery`/`plantsQuery`
   resolve, absent in the loading and error branches. Readiness keeps its meaning ("grow
   data loaded, operating frame rendered"). `inference`: #1793's recorded production
   timings (e.g. Dashboard 1447 ms at `35e7def6`) stay comparable, because the observed
   commit is the same; they are not re-labelled.
2. **Independent of tent selection.** Renders for `none`, `choose` and `tent` alike.
   `established fact` (no conditional around the wrapper)
3. **Visible and exact-one.** Always contains the `Open tents` button (and the onboarding
   pill), so it has a non-zero box at every viewport → passes E3's `toHaveCount(1)` +
   `toBeVisible()`.
4. **Passes E1's `toBeEnabled()`.** `source claim` (Playwright docs): an element is
   enabled unless it is a native form control with `disabled` or carries
   `aria-disabled="true"`; a `div` qualifies. The owner proves this in the e2e run, not by
   assertion here.
5. **No new UI, no copy, no route.** A test ID only.

Rejected:

| Option                                      | Why not                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Move the test ID to `tonight-tent-home-log` | Absent for `none` / `choose`; href carries the tent's grow id, breaks E2. (Brief.)                                         |
| Test ID on `Open tents` link                | Couples readiness to a navigation control that may be renamed or moved for product reasons.                                |
| Attribute on `dashboard-root`               | `dashboard-root` also renders in the loading and error branches (lines 368, 401) — readiness would fire before data loads. |
| Visually hidden (`sr-only`) marker          | Readiness specs assert `toBeVisible()`; a 1 px clipped node is a fragile basis.                                            |

Add a one-line load-bearing comment on the wrapper, in the style of the `__root.tsx`
`AnalyticsShell` comment:
`{/* data-testid="dashboard-ready" is the e2e readiness marker (census, responsive, signed-in performance). Loaded branch only; keep it unconditional. */}`

---

## 5. Change list (one commit)

### 5.1 Production — `src/pages/Dashboard.tsx` (route to **Blue Dream**)

1. Delete the `<Button asChild variant="outline" data-testid="dashboard-daily-grow-check-entry">…</Button>`
   block (lines 509-515 at `a980489a`) and its comment.
2. Add `data-testid="dashboard-ready"` + the comment above to the actions wrapper.
3. Replace the stale comment at lines 558-560 (at `a980489a`) ("single Quick Log entry point
   (QuickLogV2Fab)") with one that names the home-card `Log` as the page's single primary
   Log entry. Keep it to two lines.
4. Do **not** touch `DailyGrowCheckStatusCard`, `DashboardDailyGrowCheckPanel`, `MobileNav`,
   routes, `withGrowId`, or #1833's card/view model. Touch `QuickLogV2Fab`'s Dashboard render only
   under D1.1-A, and `AppShell` only if GDP picks D1.2-B (§7); otherwise leave both alone.
5. Do not reformat the file (pins elsewhere depend on line shape).

E1 handoff (`control: "dashboard-ready"`, `toBeEnabled()` stays) is posted on #1793
(issuecomment-5935387971) and carried forward to #1849 (issuecomment-5936685946). The
owner of #1849 acknowledged it. The edit itself is in §5.2 once #1849 has landed.

### 5.2 E2E (route to **Critical Mass**)

| Spec                                                                        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2 `core-link-form-census.spec.ts:1994`                                     | Replace the href assertion with: `await expect(page.getByTestId("dashboard-ready")).toBeVisible();` and `await expect(page.getByTestId("dashboard-daily-grow-check-entry")).toHaveCount(0);`. The fixture has one tent (`TENT`, `grow_id: GROW_ID`) → selection `tent/only`, so also assert `await expect(page.getByTestId("tonight-tent-home-log")).toHaveAttribute("href", \`/daily-check?growId=${GROW_ID}\`);`—`inference`that #1833's`toTent`maps`grow_id`→`growId`; owner confirms on the landed code and drops this line if not. |
| E1 `signed-in-performance.spec.ts` (on the deploy branch after #1849 lands) | `control: "dashboard-ready"` for `dashboard-ready`; leave `toBeVisible()` / `toBeEnabled()` unchanged. If #1849 has not landed, do not edit #1849; wait or ask its owner.                                                                                                                                                                                                                                                                                                                                                               |
| E3 `ui-overhaul-responsive.spec.ts:253`                                     | `readySelector: '[data-testid="dashboard-ready"]'`. Cardinality stays `exact-one`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| E4 `dashboard-mobile-overflow.spec.ts:149`                                  | Replace with `await expect(page.getByTestId("dashboard-ready")).toBeVisible();`. Keep the `Open tents` assertion. Re-run at 390 and 320 px: the card's `size="lg"` Log button now sits in the first fold, so `expectNoOverflow` is the real check here.                                                                                                                                                                                                                                                                                 |

**Browser-level single-entry check (added to E2 and E4).** The unit test in §5.4 only sees the
page body. Growers also see app-chrome Log controls, so add a whole-page count of **visible**
controls (roles `link` and `button`) whose accessible name matches `/^(open )?(quick )?log$/i`.
That matches `Log`, `Quick Log` and `Open Quick Log`, but not `Log out` or `Start Check`. Expect
the exact set GDP's D1 answer allows (§7), named by test ID where one exists, so a new
duplicate fails:

| Viewport                                                     | Spec | Visible Log controls today, after removing the header link                                        | Under D1.1-A + D1.2-A (recommended)                                                |
| ------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Desktop (`chromium-mocked` uses `devices["Desktop Chrome"]`) | E2   | card `Log`, page `QuickLogV2Fab` (`Quick Log`), AppShell `header-quick-log-trigger` (`Quick Log`) | 2: card `Log` + `header-quick-log-trigger`, the second as a named chrome exemption |
| Mobile 390 / 320 px                                          | E4   | card `Log`, AppShell `mobile-quick-log-fab` (`Open Quick Log`)                                    | 2: card `Log` + `mobile-quick-log-fab`, the second as a named chrome exemption     |

In the mobile case, `QuickLogV2Fab` and `header-quick-log-trigger` are `hidden md:inline-flex`, and
`mobile-quick-log-fab` is `md:hidden`. `established fact` (class names in source; actual
visibility is proven by the e2e run). This check closes the gap raised on #1844 (comment
4167087657): a page-body count alone could pass while the grower still sees two controls.

Every e2e run uses `--project=chromium-mocked` **with an explicit spec filter** and
`E2E_BASE_URL=http://127.0.0.1:8080`.

### 5.3 Unit pin renegotiation (same commit)

| Pin                                                      | New assertion                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1 test "still exposes the Quick Log page entry button…" | Rename to "the page header carries the readiness marker, not a second Log CTA". Assert `not.toMatch(/dashboard-daily-grow-check-entry/)`, `toMatch(/data-testid="dashboard-ready"/)`, `not.toMatch(/>Quick Log</)`, `not.toMatch(/>Daily Grow Check</)`. Drop the `withGrowId("/daily-check", scopedGrowId)` match.       |
| U2 two cases at 256-267                                  | Replace with: header entry `queryByTestId("dashboard-daily-grow-check-entry")` is `null` (scoped and unscoped); `tonight-tent-home-log` href is `/daily-check?growId=${GROW}` in **both** cases — the harness tent carries `growId: GROW` (line 52), and #1833 prefers `homeTent.growId`. `dashboard-ready` present once. |
| U3 `:175-178`                                            | Rename to "Dashboard exposes Log through the One-Tent Home card". Assert `toMatch(/<TonightTentHomeCard\b/)` and `toMatch(/\/daily-check/)` (still true via `logHref`).                                                                                                                                                   |
| U3 `:312-317`                                            | Assert `toMatch(/logHref=\{withGrowId\("\/daily-check",\s*homeTent\?\.growId \?\? scopedGrowId\)\}/)` and `not.toMatch(/dashboard-daily-grow-check-entry/)`.                                                                                                                                                              |
| U4 `:48`                                                 | Replace with the same `logHref=…homeTent?.growId ?? scopedGrowId` pattern.                                                                                                                                                                                                                                                |
| U4 `:57-62`                                              | Anchor the window on `data-testid="dashboard-ready"` instead of the removed ID; keep `not.toMatch(/>Daily Grow Check</)`.                                                                                                                                                                                                 |

These are legacy source scans asserting presence/absence of text in a component file,
not contract tests over config, so `check-contract-test-resolution` does not apply.
`inference` from its documented scope (playwright/vitest config only).

### 5.4 New test — RED first

`src/test/dashboard-single-log-entry.test.tsx`, reusing the hook-mock harness pattern of
`dashboard-grow-scoped-cta-render.test.tsx` (copy its mocks; do not import across test
files). Render `Dashboard` and assert inside `getByTestId("dashboard-root")`:

| Case     | Tents fixture         | Expect                                                                                                                                               |
| -------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| one tent | 1                     | Log controls (below) count **per D1**; `tonight-tent-home-log` is one of them; `dashboard-daily-grow-check-entry` absent; `dashboard-ready` length 1 |
| no tent  | 0                     | `dashboard-ready` length 1; no `tonight-tent-home*`; header entry absent                                                                             |
| choose   | 2, no activation tent | `dashboard-ready` length 1; `tonight-tent-home-choose` present; no `tonight-tent-home-log`                                                           |
| loading  | tents query pending   | `dashboard-ready` absent                                                                                                                             |
| error    | tents query error     | `dashboard-ready` absent                                                                                                                             |

**Log controls** = `[...getAllByRole("link"), ...getAllByRole("button")]` inside `dashboard-root`,
filtered by accessible name `/^(Quick )?Log$/`. Counting links alone is not enough: on desktop
the page's own `QuickLogV2Fab` is a visible `<button>` named `Quick Log` (`hidden md:inline-flex`;
jsdom applies no CSS, so it is always in the count). `established fact` A link-only count would
let the one-tent case pass with two visible Log controls (finding on #1844, comment 4158072693).

Expected one-tent page-body count by D1.1 outcome:

- **D1.1-A (recommended): drop `QuickLogV2Fab` from `Dashboard`.** Count is exactly 1. The desktop
  sheet entry stays available through `AppShell`'s `header-quick-log-trigger`, which sits outside
  `dashboard-root` and whose own comment calls it the single desktop logging entry. This adds `QuickLogV2Fab` removal to §5.1 and renegotiates the pins on its Dashboard render:
  `first-plant-memory-cta.test.tsx` "retains the single Quick Log FAB entry point" (expects exactly
  one `<QuickLogV2Fab` in `Dashboard.tsx`), and the title of the `onboarding-checklist-view-model`
  case "first log step routes to Dashboard where QuickLogV2Fab opens the sheet". That case asserts
  only the href `/dashboard?open=quick-log`, and the `open=quick-log` intent is handled by
  `AppShell` (`globalSearchQuickLogFallbackRules.ts`), so first-log onboarding keeps working
  (`inference`, to be proven by the e2e run). About 20 other Dashboard render tests only
  `vi.mock` the component; an unused mock is harmless. `dashboard-mobile-layout-safety` reads
  `QuickLogV2Fab.tsx` itself, not its Dashboard render, so it is unaffected. `established fact`
  (`git grep` at `80176bad`)
- **D1.1-B: keep it, as a deliberate exemption.** Count is exactly 2: `tonight-tent-home-log` plus
  one `button` named `Quick Log`. The test names the exemption and links the GDP decision, so a
  third control still fails.

This unit count covers the page body only. App-chrome controls (`header-quick-log-trigger` on
desktop, `mobile-quick-log-fab` on mobile) are counted by the browser-level check in §5.2.
`Start Check` is not named "Log" and is outside both counts (D1.3, §7).

RED proof: run the file on the post-#1833 tree **before** §5.1. Expected: the one-tent case
fails (header `Quick Log` link + card `Log` + `QuickLogV2Fab` = 3 controls, against 1 or 2),
and every `dashboard-ready` assertion that
expects presence fails. Record the exact failing count in the PR body, then apply §5.1 and
show GREEN.

---

## 6. Acceptance

1. Signed-in Dashboard with one tent: the page-body Log controls (§5.4) and the whole-page
   visible Log controls at desktop and mobile widths (§5.2, E2 and E4) match GDP's D1 answer
   exactly. Under the recommended answer that is 1 in the page body (the home card's `Log`) and
   2 on the whole page (card `Log` plus one named chrome trigger per viewport).
2. `dashboard-ready` is the only selector E1–E4 use; it renders exactly once in the loaded
   branch for `none`, `choose`, `tent`, and never while loading/error.
3. U1–U4 renegotiated in the same commit; new test shown RED then GREEN with counts.
4. Validation: `bun run typecheck`; targeted `bunx vitest run` on U1–U4 + new file +
   `tonight-tent-home-*`; `bun run lint` on touched files; the e2e specs as in §5.2
   (E1 runs only in its credentialed lane; locally, prove it at least compiles and lists). Full suite is CI's (32 shards).
5. Diff touches only: `Dashboard.tsx`, the e2e specs E2–E4 (plus E1 once #1849 has landed), U1–U4, the new test,
   the D1.1-A pins in §5.4 if chosen, and `AppShell.tsx` only under D1.2-B. No route,
   schema, RLS, auth, edge-function, migration, dependency or copy-constant change.
6. Reviewers: Blue Dream (`Dashboard.tsx`), Critical Mass (tests/e2e). The owner does not
   self-review. Chemdawg merges only after 35/35 required checks and an independent PASS on
   the exact head (OWNERSHIP.md §2).

---

## 7. Open decisions for GDP

OWNERSHIP.md assigns product calls to GDP, and Matthew is never a blocker in the review path
(OWNERSHIP.md §1, "GDP: routing and product calls"). Earlier revisions routed these to Cheek;
that was wrong (finding on #1844, comment 4158072653).

- **D1 — which Log controls may stay visible. BLOCKING, both parts.** After the header link is
  removed, a one-tent Dashboard still shows more than one Log control (`established fact`, §5.2
  table). This slice only meets the brief's "one visible Log control" if GDP says which ones
  stay. The tests then pin exactly that set.
  - **D1.1 — the page's own `QuickLogV2Fab` (desktop).** **A (recommended):** drop it from
    Dashboard; other pages keep theirs. **B:** keep it as a named exemption. See §5.4 for the
    counts and pins.
  - **D1.2 — AppShell's chrome triggers on Dashboard** (`header-quick-log-trigger` on desktop,
    `mobile-quick-log-fab` on mobile). These are global chrome on every signed-in page and open
    the Quick Log sheet, while the card's `Log` goes to `/daily-check` for that tent.
    **A (recommended):** keep them as named chrome exemptions; the brief targets the Dashboard
    page body, and changing global chrome is a wider slice. **B:** hide them on Dashboard while
    the card shows `Log`. That puts Dashboard state into `AppShell` and widens this slice's diff
    (§6.5). **C:** keep them, but the card's `Log` opens the same sheet instead of
    `/daily-check`. That changes #1833's behavior and belongs in a separate slice.
  - **D1.3 — `Start Check`** (`DailyGrowCheckStatusCard`, below the fold, `/daily-check`).
    Non-blocking: it is not named "Log", so neither count includes it. Default: unchanged.
- **D2 — `none` / `choose` have no first-fold Log.** After removal, a grower with no tent
  or with several tents and no activation tent sees no first-fold Log; they keep the chrome
  triggers and `Start Check`. `inference`: acceptable, since logging needs a target and
  target selection must stay explicit (auto-selection is banned and test-pinned). Non-blocking. If GDP
  wants a first-fold Log in `choose`, that belongs in #1833's card, not a revived header button.

---

## 8. Risks / rollback

- `uncertainty` (partly resolved): #1833 merged 2026-10-03 as `04a36937`, so the line numbers
  above are as of `a980489a` and may drift again. The owner re-reads the landed code and adjusts U3/U4 patterns and the role-name
  regex to match; the marker design does not depend on #1833's internals.
- `uncertainty`: E4's More-sheet assumption — if a mounted `Quick Log` link exists on mobile,
  the old line 149 might have been passing on it rather than the header; switching to the
  marker removes that ambiguity either way.
- Rollback: revert the single commit; the header button and old pins return together.

## 9. Handoff

- **Owner (implementation):** Claude, per user assignment 2026-10-01, once §1 clears.
- **Independent reviewers:** Blue Dream (`.tsx`), Critical Mass (tests, e2e).
- **Coordination:** #1849's owner (a Claude session, reassigned from Codex 2026-10-01). E1 is
  handled by this slice after #1849 lands; acknowledged in issuecomment-5936713821.
- **Routing and product calls:** GDP (D1.1 and D1.2 blocking; D1.3 and D2 non-blocking).
- **Merge:** Chemdawg, after 35/35 required checks and an independent PASS on the exact head; no
  auto-merge.
