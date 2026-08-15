# Verdant — Current Operating State

**Last updated:** 2026-08-15
**Updated by:** Claude (Knowledge Library & Product Specification Architect)

This is the shift report. It changes often. Permanent rules live in `/AGENTS.md` and must
not be edited to record operational detail.

Every agent reads this file before acting. If it is stale enough to mislead, say so and
update it rather than working from it.

---

## Branch topology — read this before auditing anything

| Branch               | Role                                                   |
| -------------------- | ------------------------------------------------------ |
| `verdant-grow-diary` | **Deploy branch. The live site ships from here.**      |
| `main`               | Integration branch. **Does not reflect what is live.** |

This distinction is not cosmetic. As of this writing `main` carries a 4-URL sitemap and a
single shared `index.html`; the deploy branch carries a 51-URL sitemap and route-local
head documents. An audit run against `main` will produce confidently wrong conclusions
about the public site. Verify which ref you are reading.

Supabase project: `knkwiiywfkbqznbxwqfh`.

---

## Production status

| Axis                     | Status                                             |
| ------------------------ | -------------------------------------------------- |
| Production deploy        | `PASS` — live commit matches deploy-branch head    |
| Unpublished source delta | none                                               |
| Public sitemap           | 51 URLs                                            |
| robots.txt               | declares production sitemap; protects app prefixes |

---

## SEO measurement status

Source: `artifacts/seo/seo-readiness-status.json` (deploy branch), generated 2026-07-31.

| Axis                               | Status                                   |
| ---------------------------------- | ---------------------------------------- |
| `technical_seo_status`             | **FAIL**                                 |
| ├─ `direct_load_indexability`      | `PASS`                                   |
| ├─ `robots`                        | `PASS`                                   |
| ├─ `sitemap`                       | `PASS`                                   |
| ├─ `protected_route_exclusion`     | `PASS`                                   |
| ├─ `lighting_pages`                | `FAIL`                                   |
| └─ `route_runtime_structured_data` | **`FAIL`**                               |
| `ga4_access_status`                | **`BLOCKED`**                            |
| `gsc_access_status`                | **`BLOCKED`**                            |
| `day_0_status`                     | `UNSET`                                  |
| `four_week_clock_status`           | `NOT_STARTED`                            |
| Overall verdict                    | `BLOCKED — GA4/GSC OWNER SETUP REQUIRED` |

**No agent may state page-level traffic, impressions, clicks, position, or CTR while GA4
and GSC are blocked.** The only authorized keyword dataset is an owner-supplied Semrush US
lighting snapshot, recorded with provenance in `docs/seo/content-taxonomy.md`. Everything
else is `UNKNOWN`.

`config/seo-last-gsc-finding.json` is an intentional placeholder. Do not fill it with an
invented finding.

---

## Known blockers

| #   | Blocker                                                              | Owner                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `route_runtime_structured_data: FAIL`                                | Codex                  | Rendered JSON-LD does not match build-time route documents. Degrades all 51 live URLs. Root cause not yet isolated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2   | GA4 / GSC access `BLOCKED`                                           | **Cheek (owner-only)** | No agent can clear this. Every measurement decision depends on it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3   | `/cultivars/*` has no eligibility gate                               | Codex + Cheek          | 10 strain pages live; `docs/seo/content-taxonomy.md` contains no strain row. Shipped outside the scoring system that governs guides.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 4   | `main` missing the Account Preferences feature that's live on deploy | Codex                  | `verdant-grow-diary` has `/account/preferences` registered in `appRouteManifest.ts` (a Settings page for marketing opt-in + agreement-acceptance history); `main`'s `App.tsx` doesn't mount the route and `Settings.tsx` has no such tile — `main`'s settings-tile-count test currently pins **4** tiles, not 7. Found 2026-08-13 while triaging a stray local branch (`fix/consent-auth-hardening`, not pushed to origin) for a cherry-pick; its lone route-manifest commit is not a safe isolated fix on its own — the whole feature needs backporting, not just the manifest line. Whoever picks this up needs the branch handed off manually or re-derives the feature from the deploy-branch source, since the branch exists only on the owner's machine. |
| 5   | Deploy's AI Doctor→Action Queue back-pointer token is spoofable | Codex (security)       | `verdant-grow-diary`'s `src/lib/aiDoctorSessionToActionQueueRules.ts:176-185` builds `reason = ${reasonBody} — Review and approve before acting. ${backPointer}`, placing unsanitized model-derived `action.reason` text **before** the trusted `[session:id]` token — no `stripTokensOfKind`-equivalent sanitization call. `src/lib/actionQueueProvenanceRules.ts`'s `extractSourceAlertId` / `extractSourceAiDoctorSessionId` extract via a non-global `reason.match(REGEX)` (first-match semantics), so an AI-generated reason string containing a forged `[session:...]` / `[alert:...]` token earlier in the text would be read instead of the real trailing one. This is the identical vulnerability class a Copilot review flagged on `main` and PR #754 fixed there (via `stripTokensOfKind` + last-match extraction) — but it is **not a backport candidate**: deploy never built the alert-prefill feature #754 hardens, so the fix doesn't transplant directly. The vulnerability exists independently in deploy's own provenance/back-pointer code and needs its own fix. Found 2026-08-15 as a side-finding of the main/deploy divergence audit below, `evidence tier: code-level static finding`, not a confirmed exploited-in-the-wild incident. |

---

## Main / deploy divergence audit (2026-08-15)

**Corrects the framing from earlier the same day.** A raw commit-graph diff was read as
"70 unshipped commits" and reported that way in conversation. That overstated the real gap
— see below. Treat this section as authoritative over anything said before it.

Merge-base of `main` and `verdant-grow-diary`: `7048273bc` (2026-06-25, PR #111, the last
sync merge). Since then: **117 commits exist on `main` that never reached deploy** (70 of
them touch `src/`; the rest are docs/CI/scripts), and **~5,530 commits exist on deploy that
aren't on `main`** — but 4,687 of those are `gpt-engineer-app[bot]` (Lovable's
per-micro-edit auto-commit bot), not 4,687 distinct features. Raw commit counts overstate
divergence in both directions.

To find the real gap, 8 parallel agents each read **deploy's current code directly**
(not git ancestry) for one thematic cluster of the 70 `src/`-touching main-only commits,
searching for differently-named or differently-architected equivalents before concluding
anything was missing. Verdicts:

| Cluster                                              | Verdict     | Residual gap on deploy                                                                    |
| ----------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| AI Doctor output safety evaluator (#230)               | `SHIPPED`   | None. Landed via PR #229 the same day (that PR's title is misleading — it's a consent PR that also carried the full evaluator tree). Deploy is at parity or ahead (later safety hardening, broader static-scanner suite, CI wiring confirmed live). |
| Photo strip signed-URL handling (3 commits)            | `SHIPPED`   | None. Deploy solved it independently **3 weeks before** main, via a shared `useDiaryPhotoDisplayRows` hook — arguably more robust (react-query loading/error state vs. hand-rolled effects). |
| Breeding / genetics fixes (6 commits)                  | `SHIPPED`   | None. Deploy's independent implementation is more advanced (extra breeding-program layer, stricter fail-closed grow-binding state machine, dedicated regression tests main doesn't have). |
| Verdant Grow OS MCP server + sensor snapshot (2 commits) | `SHIPPED`   | None. Explicitly dual-shipped by design — deploy mirror PR #256 landed the same week as main's #255 — and deploy has since gone further via the fold-helper work already tracked above (PR #917). |
| Quick Log v2 data-integrity hardening (13 commits)     | `PARTIAL`   | **Real gap:** trichome percentages can still sum over 100% — `quickLogMaturityEvidenceRules.ts` caps each of clear/cloudy/amber individually at 0–100 but has no sum check anywhere in the chain. Everything else (pH/EC/runoff-volume bounds, duplicate-save-on-retry prevention, orphaned-photo cleanup) is independently shipped — the bounds check is even server-side RPC-enforced (`quicklog_save_event` in `20260725023000_core_schema_forward_repair.sql`), stronger than main's client-side fix. |
| `alerts.tent_id` / alert-prefill (4 commits)           | `PARTIAL`   | `tent_id` population is shipped independently (plus a dedicated regression test main doesn't have). The alert-prefill-to-Coach race condition doesn't apply — deploy never built that feature; it solved the underlying UX goal with a plain context-free deep link instead of a prefilled chat box. See blocker #5 for the security finding this comparison surfaced. |
| AI Doctor credits-exhausted teaser (3 commits)         | `PARTIAL`   | **Real gap:** the *proactive* "credits running low" warning is computed (`AI_DOCTOR_CREDITS_LOW_COPY`) but has zero UI consumers on deploy — only exhaustion-time interception ships, and only inside the tent-alerts panel CTA, not as a general Plant Detail marker like main's #758. Cache-refresh-after-spend is shipped independently. Low safety relevance — reads as a scope decision, not an oversight. |
| Pheno Comparison Pro features (8 commits)              | `PARTIAL`   | **Real gap:** no general Plant Detail lab/COA panel with partial-total THC/CBD honesty math (acid-form × 0.877 + neutral-form, flagged as a lower bound when only one form is reported). Deploy's independent "Pheno Hunt Tracker Pro" product (150+ files) ships a real-data comparison page, Pro-gating, photo/sensor enrichment, and a structured trait scorecard — all superior to or at parity with main's version — but its lab-results panel is Pheno-Hunt-scoped only, with a flat schema that can't express "partial" evidence. |

**Net: of the 70 `src/`-touching commits, roughly 4 clusters are fully covered, 4 are
partially covered, and the genuinely actionable gaps are three specific items** — the
trichome-percentage sum cap, the proactive AI-Doctor-credits-low warning, and the
general-Plant-Detail lab/COA partial-total honesty math — plus the unrelated security
finding logged as blocker #5. This is a small, scoped punch list, not a 70-commit backport
project. `docs/ecowitt-*` items already tracked above (Phase 1.7/1.8) were not
re-verified here — they're deliberately staged and already exhaustively documented.

Full per-agent evidence (file:line citations, exact code quoted) is in this session's
workflow transcript, not reproduced here — ask the implementing agent to re-run the same
verification pattern (`git show origin/verdant-grow-diary:<path>` against deploy's current
tip) rather than trusting this table's one-line summaries once deploy has moved further.

---

## PR merge-readiness sweep (2026-08-13)

Cheek asked for a repo-wide "merge on green only" pass across all 32 open PRs. Two
findings that generalize beyond this one sweep — read before trusting a green rollup:

**1. CI-green + `reviewDecision: APPROVED` does not mean mergeable.** `reviewDecision`
reflects that an Approve event was submitted, not that every inline finding was
addressed. Check `reviewThreads` for `isResolved: false` separately — e.g.
`gh api graphql -f query='query{repository(owner:"Verdant-OS",name:"verdant-grow-diary"){pullRequest(number:N){reviewThreads(first:50){nodes{isResolved comments(first:1){nodes{body}}}}}}}'`.
Of 8 open PRs whose CI rollup showed `SUCCESS`, 7 had a real blocker underneath:

| PR               | Looked green because | Actually blocked by                                                                                                                                                                                                                                                            |
| ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #803             | CI pass, approved    | 5 unresolved review threads incl. 1 **P1** — broken `test:sentinel-governance` script reference, a version-parity check that accepts stale versions, a doc pointing at nonexistent config, `CURRENT_STATE.md` misclassified under the constitution's own `docs/agents/**` rule |
| #910             | CI pass, approved    | 2 unresolved threads (1 P1, 1 P2)                                                                                                                                                                                                                                              |
| #853             | CI pass, approved    | 1 unresolved P2                                                                                                                                                                                                                                                                |
| #813, #913, #933 | CI pass, approved    | real merge conflicts (`mergeable: CONFLICTING`) — GitHub rejects these outright regardless of instruction                                                                                                                                                                      |
| #936             | CI pass, approved    | base is `#933`'s branch, not `main`/deploy — stacked, can't land until #933's conflicts resolve                                                                                                                                                                                |

**2. `verdant-grow-diary`'s merge queue rejects `BEHIND` PRs even when their own CI is
green.** The queue ruleset sets `strict_required_status_checks_policy: true`, so it will
not trust check results captured against a stale base. `enqueuePullRequest` then fails
with a misleading `"35 of 35 required status checks are expected"` — reads like pending,
is actually a rejection. Fix: `PUT /repos/{owner}/{repo}/pulls/{n}/update-branch` to merge
current base into the PR branch, wait for the fresh full-check run, then retry enqueue.

Only **#764** (Playwright/census-harness fix) was genuinely clean end to end —
branch-updated 2026-08-13 to unblock the queue; merge-queue re-attempt pending the fresh
CI run it triggers. This sweep is a process/hygiene pass, orthogonal to the SEO slice
below — it does not change or supersede the approved slice.

**Update (2026-08-13, later same day, live re-check before landing this doc):** #764 and
#853 have since merged/closed. #813 has been rebased and is no longer conflicting — it now
shows `mergeable: MERGEABLE` but still carries 4 unresolved review threads, so it stays
blocked, just by a different mechanism than the table above records. #943 (opened after
the original sweep, not one of the original 8) shows the identical pattern: `BEHIND` + 2
unresolved review threads despite `reviewDecision: APPROVED`. Net still holds: nothing here
is a same-day-safe merge target except this doc PR itself. `mergeable`/`mergeStateStatus`
are live and recomputed — re-run the `reviewThreads` query above per PR immediately before
acting on any claim in this file, including this update.

**Correction to the note above (still 2026-08-13):** "merged/closed" was imprecise —
verified separately, the two are not equivalent here. #764 **merged** at
`2026-08-13T07:17:09Z`, confirming the original "genuinely clean end to end" read held up.
#853 was **closed without merging** — deliberately, because its content (a point-in-time
SEO production/deploy lineage snapshot) had gone factually stale, not because its 1
unresolved P2 finding got addressed; no code landed. If that P2 still matters, it needs
fresh work, not assumed coverage from #853's branch. Also: this doc PR (#953) has itself
since merged, so the "except this doc PR itself" line above is now historical, not a
live caveat.

---

## Next approved slice

**Repair and measurement. No new page families.**

1. Isolate and fix `route_runtime_structured_data` across all 51 sitemapped URLs.
2. Cheek clears GA4/GSC access and supplies one real finding.
3. Start Day 0 and the four-week clock.
4. Apply page-type contracts to the 51 live pages.
5. Re-verify the 10 cultivar pages against the programmatic gate.
6. Only then decide cluster 2, from measured evidence.

Grok's research feeds step 6, not step 1.

---

## Agents currently assigned

| Agent  | Status                                                                               |
| ------ | ------------------------------------------------------------------------------------ |
| Claude | SEO: architecture delivered, verdict `HOLD`. EcoWitt: Phase 1.7 verified (see below) |
| Codex  | Not yet started — awaiting slice 1                                                   |
| Grok   | Not yet started — research feeds slice 6                                             |
| Others | Not yet engaged                                                                      |

---

## Unrelated work in flight

### EcoWitt real ingest — Phase 1.7 verified; Phase 1.8 spec on `HOLD — approvable`

Branch `claude/ecowitt-sensor-verify-98f1bd` (based on `main`). Records:
`docs/ecowitt-real-ingest-phase-1-7-verification-record.md`,
`docs/ecowitt-ingest-topology-and-schema-gaps.md`, and — authoritative for Phase 1.8 —
`docs/ecowitt-real-ingest-phase-1-8-grounding-audit.md` (deploy-branch-verified; corrects
stale schema claims in the earlier two).

Phase 1.8 specification: `docs/ecowitt-real-ingest-phase-1-8-specification.md`, verdict
`HOLD — approvable`. **Owner ruled 2026-08-12** (at frozen head `15e161885`): D2 APPROVED
(designated channel now, per-plant binding later), D3 APPROVED (fail-closed unknown
transport → `invalid`), D4 APPROVED (stale persists as evidence only) — fences recorded in
the spec. **D4 premise corrected later same day:** both deployed handlers already fail
closed on stale (reject before upsert, deliberately — verified at deploy tip `cb98fe4e4`);
**D4 re-confirmed FAIL-CLOSED 2026-08-13** — stale stays rejected, never stored; V5b
`NOT_APPLICABLE`; gate 4 fully `APPROVED`. V1 and V4 were authorized and attempted same day: both `BLOCKED` — no `PG*`
env/`psql` on this machine and the Supabase MCP connection lacks permission on
`knkwiiywfkbqznbxwqfh`. Unblock paths and an owner-runnable V4 query are in the spec's
verification attempt record. V3 and V6 are `BLOCKED` on the same access denial as
V1/V4 (re-attempted later 2026-08-12). **V2 passed 2026-08-12**: channel collision
reproduced against deploy-branch modules — a tent with two channels of one class loses
half its rows to `ignoreDuplicates`; safe at ≤1 channel per class per tent, which D2
Option A must enforce. **V5a passed 2026-08-13** — PR #917 merged (`e077a0ba0`): fold
helpers eliminate every else→`live` fallthrough across 11+ read models with pinning
tests; active-writer transport tags (`pi_bridge`, `ecowitt`) map to `live` deliberately
via an explicit compat set. V5 is split — V5a
(invalid-provenance read fences) is mandatory and unconditional, V5b (stale fences)
conditional on D4. All owner decisions are ruled.

**V1 and V4 PASSED 2026-08-13** — owner-run `psql` against production, outside the agent
environment. V1: the live `validate_sensor_reading` matches migration `20260617164759`
with no diff (9 metrics, 4 qualities, 19 sources, NaN guard, +5-min bound, soil_temp_c
−20..80); both duplicate triggers exist and are enabled; `sensor_readings_dedupe_uidx` is
non-partial in the pinned column order. V4: **29,743** `source='live'` EcoWitt rows
enumerated exhaustively, **0 defects**, legacy `source='ecowitt'` count **0**.

**Spec now advances to `APPROVED` on just V3 + V6.** V3 needs one read of the deployed
Edge function bodies/versions (dashboard, Management API, or a production-scoped MCP
connector). V6 needs a role permitted to `SET ROLE authenticated` — the owner's `psql`
role was refused; Studio's `postgres` connection qualifies, or drive the four assertions
through PostgREST with a real user JWT. Turnkey run sheet:
`docs/ecowitt-phase-1-8-studio-verification-prompt.md`.

**Three findings carried out of the 2026-08-13 run** (full evidence in the spec's second
attempt record): **F1** — no row in `sensor_readings` is attributable to the current
`ecowitt-ingest` build (`passkey_fingerprint` absent on all 29,743 rows; vendor is not the
type-pinned literal), so V3 has **no** runtime corroboration and the deployed body is the
only remaining evidence of that endpoint's behavior. **F2 (owner)** — 29,738 of those
`live` rows are testbench traffic (`vendor='ecowitt_windows_testbench'`) and none is newer
than 2026-07-14, so production carries **no verified real live EcoWitt telemetry**;
relabeling is not authorized (source is a dedupe-key column). **F3** — **zero** tents
carry `hardware_config ? 'ecowitt'`, so the deployed passkey→tent routing can resolve no
gateway POST today, and D2 Option A's designation surface is unpopulated.

Access note (2026-08-13): the Supabase MCP connector still reaches only the sandbox
(`bzatgtgjvuojpoxcknaa`), and the dashboard account on the owner's machine is not a member
of production org `wpczgwxsriezaubncuom` — Studio redirects away from the project. That is
an org-membership gap, not a connector-scope one.

| Phase 2 gate item                             | Status                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1. Wrapper tests pass                         | `PASS` — 22/22 targeted tests, 2026-08-07                                                      |
| 2. Token storage/rotation/revocation policy   | `APPROVED` — 2026-08-12, `docs/ecowitt-bridge-token-policy.md` (T1–T5)                         |
| 3. Schema/RLS/idempotency audit (= Phase 1.8) | `BLOCKED` — spec drafted; approval blocked on verification items + owner decisions (see below) |
| 4. Live-label fencing policy                  | `APPROVED` — D3 2026-08-12; D4 re-confirmed fail-closed 2026-08-13                             |

Persistence remains blocked **on the Phase 1.7 path**: `source='live'` is unreachable via
the validation-only `ecowitt-real-ingest` wrapper by design — it has no database client. A
live row claiming to come from **that endpoint** would be a defect, and a Sensor Snapshot
screenshot is not a valid Phase 1.7 exit artifact. This does **not** apply to the
separately deployed `ecowitt-ingest` custom-upload path — bearer-authenticated, so it is
reached via a bridge hop, never by the gateway alone — which checks freshness and
legitimately upserts canonical `source='live'` rows (deploy branch). Do not
classify those as defects when auditing production.

Two cautions for anyone picking this up:

- A verification guide circulating outside the repo names Supabase project
  `bzatgtgjvuojpoxcknaa`. That ref exists in **no** file here. The project is
  `knkwiiywfkbqznbxwqfh`. The same guide describes `~/verdant-testbench` as a copy of
  Verdant; it is not a git repository.
- Phase 1.8 idempotency drafts produced without repo access assume a wide
  one-row-per-sample table. `public.sensor_readings` is **long format — one row per
  `(tent, metric, ts)`**. Start 1.8 from the real cardinality.

**This is not the approved slice.** The approved slice above remains SEO repair and
measurement. Whether EcoWitt supersedes it is Cheek's call, not an agent's.

### Skill Runtime v1

`PR #616` — Skill Runtime v1 Build 7 (evaluation harness), branch
`build/07-skill-evaluation-harness`. CI green at `22d9054d3`. Five findings open. This is
internal AI-skill infrastructure and does not touch public content, SEO, or the routes
above. Do not conflate the two workstreams.

---

## Unrelated work resolved

`PR #779` — Quick Log v2: asserts the retry success path (`applyQuickLogV2Refresh` +
`verdant:entry-created` dispatch) fires exactly once, and stays silent on a half-committed
retry. Test-only, **merged to `main`** at `b6d74794` (2026-08-07).

A companion fix, `PR #777`, was opened for what looked like a live duplicate-save-on-retry
bug, then found redundant: `main` already carried a more complete fix in `PR #317`
(`11adbd4e1`, merged 2026-07-18 — `committedMainLogRef` + `saveInFlightRef`, which also
closes a concurrent-double-tap race #777 only flagged as deferred). `#777` was closed
without merging. `#779` salvaged the one real coverage gap #317's own tests missed.

Neither PR touches public content, SEO, or the routes above — do not conflate with the
slice tracked in this file. Local full-parallel `vitest` closure runs on the implementing
agent's machine were noisy (nondeterministic 5000ms timeouts, zero assertion failures) —
a known local-only artifact, not a regression. The isolated single-file run and GitHub
Actions CI (8 shards, green) are the trustworthy signals, not the noisy parallel run.
