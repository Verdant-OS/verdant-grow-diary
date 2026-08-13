# Verdant — Current Operating State

**Last updated:** 2026-08-13
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

| #   | Blocker                                | Owner                  | Notes                                                                                                                                |
| --- | -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `route_runtime_structured_data: FAIL`  | Codex                  | Rendered JSON-LD does not match build-time route documents. Degrades all 51 live URLs. Root cause not yet isolated.                  |
| 2   | GA4 / GSC access `BLOCKED`             | **Cheek (owner-only)** | No agent can clear this. Every measurement decision depends on it.                                                                   |
| 3   | `/cultivars/*` has no eligibility gate | Codex + Cheek          | 10 strain pages live; `docs/seo/content-taxonomy.md` contains no strain row. Shipped outside the scoring system that governs guides. |

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
