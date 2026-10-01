# Dashboard — one Log entry, stable readiness marker

Status: **SPEC — implementation BLOCKED on preconditions** (see §1).
Author: Claude, 2026-10-01. Audited at deploy tip `0107d9406` (`verdant-grow-diary`, #1836),
#1833 head `f296a953`, #1793 head `074f4349`.

Every claim carries a label: `established fact` (read from source at the SHAs above),
`source claim`, `inference`, `uncertainty`, `missing evidence`.

---

## 1. Preconditions (unchanged from the brief)

| Gate                                                             | State at 2026-10-01                                                                                                | Label              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| #1833 `feat(dashboard): One-Tent Home first fold` merged         | OPEN, draft, head `f296a953`                                                                                       | `established fact` |
| #1793 `test(e2e): measure signed-in readiness…` merged or closed | OPEN, draft, head `074f4349`, stacked on `codex/chem-production-quicklog-fixture-001`; #1799 and #1800 stack on it | `established fact` |

If #1793 is still open when #1833 lands: the owner hands Codex the one-line change in §5.1
instead of editing #1793. #1799 / #1800 do not reference the header test ID
(`established fact`, `gh pr diff`), so they need nothing.

---

## 2. Problem, restated against source

- `src/pages/Dashboard.tsx:453-459` renders a `PageHeader` action
  `<Button data-testid="dashboard-daily-grow-check-entry">` → `withGrowId("/daily-check", scopedGrowId)`,
  label `Quick Log`. It exists **only in the loaded branch** (lines 437+); the error branch
  (366-389) and loading branch (391-433) render a header with no actions. `established fact`
- #1833 adds `<TonightTentHomeCard … logHref={withGrowId("/daily-check", homeTent?.growId ?? scopedGrowId)} />`
  directly below the `PageHeader`. Its `Log` link (`data-testid="tonight-tent-home-log"`,
  label `Log`) renders only when `selection.kind === "tent"`; `"none"` returns `null`,
  `"choose"` renders tent links with no Log. `established fact`
- Selection (`resolveTonightTentSelection`): 0 tents → `none`; 1 tent → `tent/only`; several
  tents → `tent/connected` if the activation tent is among them, else `choose`. `established fact`

So for a one-tent grower the first fold shows two adjacent `/daily-check` CTAs
(`Quick Log` outline + `Log` primary). This slice removes the header one.

---

## 3. Every consumer of `dashboard-daily-grow-check-entry` (deploy tip + #1793)

| #   | File                                                                      | Use                                                                                                            | How it breaks                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | `e2e/signed-in-performance.spec.ts:35` (#1793 only)                       | `control:` for `dashboard-ready`; asserts `toBeVisible()` then `toBeEnabled()`                                 | element gone → timeout → `BLOCKED` receipt                                                                                                                                                                                                                                                                                                                                                                                                    |
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
wrapper** (`<div className="flex items-center gap-2 flex-wrap">`, `Dashboard.tsx:451`).

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

## 5. Change list (one commit, PR stays draft)

### 5.1 Production — `src/pages/Dashboard.tsx` (route to **Blue Dream**)

1. Delete the `<Button asChild variant="outline" data-testid="dashboard-daily-grow-check-entry">…</Button>`
   block (lines 453-459 at deploy tip) and its comment.
2. Add `data-testid="dashboard-ready"` + the comment above to the actions wrapper.
3. Replace the stale comment at lines 495-497 ("single Quick Log entry point
   (QuickLogV2Fab)") with one that names the home-card `Log` as the page's single primary
   Log entry. Keep it to two lines.
4. Do **not** touch `QuickLogV2Fab`, `DailyGrowCheckStatusCard`, `DashboardDailyGrowCheckPanel`,
   `AppShell`, `MobileNav`, routes, `withGrowId`, or #1833's card/view model.
5. Do not reformat the file (pins elsewhere depend on line shape).

Handoff to Codex for #1793 (if still open), E1: `control: "dashboard-ready"`. No other change;
`toBeEnabled()` stays.

### 5.2 E2E (route to **Critical Mass**)

| Spec                                       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2 `core-link-form-census.spec.ts:1994`    | Replace the href assertion with: `await expect(page.getByTestId("dashboard-ready")).toBeVisible();` and `await expect(page.getByTestId("dashboard-daily-grow-check-entry")).toHaveCount(0);`. The fixture has one tent (`TENT`, `grow_id: GROW_ID`) → selection `tent/only`, so also assert `await expect(page.getByTestId("tonight-tent-home-log")).toHaveAttribute("href", \`/daily-check?growId=${GROW_ID}\`);`—`inference`that #1833's`toTent`maps`grow_id`→`growId`; owner confirms on the landed code and drops this line if not. |
| E3 `ui-overhaul-responsive.spec.ts:253`    | `readySelector: '[data-testid="dashboard-ready"]'`. Cardinality stays `exact-one`.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| E4 `dashboard-mobile-overflow.spec.ts:149` | Replace with `await expect(page.getByTestId("dashboard-ready")).toBeVisible();`. Keep the `Open tents` assertion. Re-run at 390 and 320 px: the card's `size="lg"` Log button now sits in the first fold, so `expectNoOverflow` is the real check here.                                                                                                                                                                                                                                                                                 |

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

| Case     | Tents fixture         | Expect                                                                                                                                                                    |
| -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| one tent | 1                     | `getAllByRole("link", { name: /^(Quick )?Log$/ })` length **1**, and it is `tonight-tent-home-log`; `dashboard-daily-grow-check-entry` absent; `dashboard-ready` length 1 |
| no tent  | 0                     | `dashboard-ready` length 1; no `tonight-tent-home*`; header entry absent                                                                                                  |
| choose   | 2, no activation tent | `dashboard-ready` length 1; `tonight-tent-home-choose` present; zero links named `/^(Quick )?Log$/`                                                                       |
| loading  | tents query pending   | `dashboard-ready` absent                                                                                                                                                  |
| error    | tents query error     | `dashboard-ready` absent                                                                                                                                                  |

Role query note: `QuickLogV2Fab` is a `<button>` (not a link) and the `AppShell` trigger is
outside `Dashboard`, so the link-role count isolates the page's primary Log link.
`established fact`

RED proof: run the file on the post-#1833 tree **before** §5.1. Expected: the one-tent case
fails (two matching links: `Quick Log` + `Log`), and every `dashboard-ready` assertion that
expects presence fails. Record the exact failing count in the PR body, then apply §5.1 and
show GREEN.

---

## 6. Acceptance

1. Signed-in Dashboard with one tent: exactly one page-body link named `Log`/`Quick Log`
   (the home card's). Proven by §5.4 + E2.
2. `dashboard-ready` is the only selector E1–E4 use; it renders exactly once in the loaded
   branch for `none`, `choose`, `tent`, and never while loading/error.
3. U1–U4 renegotiated in the same commit; new test shown RED then GREEN with counts.
4. Validation: `bun run typecheck`; targeted `bunx vitest run` on U1–U4 + new file +
   `tonight-tent-home-*`; `bun run lint` on touched files; the three/four e2e specs as in
   §5.2. Full suite is CI's (32 shards).
5. Diff touches only: `Dashboard.tsx`, the e2e specs E2–E4, U1–U4, the new test. No route,
   schema, RLS, auth, edge-function, migration, dependency or copy-constant change.
6. Reviewers: Blue Dream (`Dashboard.tsx`), Critical Mass (tests/e2e). The owner does not
   self-review.

---

## 7. Open decisions for Cheek (not resolved by this slice)

- **D1 — other Log-like entries remain.** On desktop the Dashboard still shows the
  `AppShell` `Quick Log` header trigger and the page's own `QuickLogV2Fab` (`Quick Log`),
  both opening the Quick Log sheet; the page body keeps `DailyGrowCheckStatusCard`'s
  `Start Check` → `/daily-check`. `established fact`. This slice satisfies "one primary
  Log entry" for the **page header / first fold** only. Whether the brief's "one visible
  Log control" also covers app-chrome triggers and `Start Check` is a product decision.
- **D2 — `none` / `choose` have no first-fold Log.** After removal, a grower with no tent
  or with several tents and no activation tent sees no first-fold Log; they keep the chrome
  triggers and `Start Check`. `inference`: acceptable, since logging needs a target and
  target selection must stay explicit (auto-selection is banned and test-pinned). If Cheek
  wants a first-fold Log in `choose`, that belongs in #1833's card, not a revived header button.

---

## 8. Risks / rollback

- `uncertainty`: #1833 may change before merging (line numbers, `logHref` expression, copy
  `Log`). The owner re-reads the landed code and adjusts U3/U4 patterns and the role-name
  regex to match; the marker design does not depend on #1833's internals.
- `uncertainty`: E4's More-sheet assumption — if a mounted `Quick Log` link exists on mobile,
  the old line 149 might have been passing on it rather than the header; switching to the
  marker removes that ambiguity either way.
- Rollback: revert the single commit; the header button and old pins return together.

## 9. Handoff

- **Owner (implementation):** Claude, per user assignment 2026-10-01, once §1 clears.
- **Independent reviewers:** Blue Dream (`.tsx`), Critical Mass (tests, e2e).
- **Coordination:** Codex — §5.1 one-line `control` change in #1793 if it is still open.
- **Integration:** GDP; PR stays draft, no auto-merge.
