# Verdant — Current Operating State

**Last updated:** 2026-08-07
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

### EcoWitt real ingest — Phase 1.7 verified, Phase 1.8 not started

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
D4 needs owner re-confirmation on the corrected facts before implementation. See the
spec's D4 correction block. V1 and V4 were authorized and attempted same day: both `BLOCKED` — no `PG*`
env/`psql` on this machine and the Supabase MCP connection lacks permission on
`knkwiiywfkbqznbxwqfh`. Unblock paths and an owner-runnable V4 query are in the spec's
verification attempt record. V6 is `BLOCKED` on the same access denial as V1/V4;
V2/V3 and V5a/V5b are pending with no verification result yet. V5 is split — V5a
(invalid-provenance read fences) is mandatory and unconditional, V5b (stale fences)
conditional on D4. Spec advances to `APPROVED` only when **V1–V4, V5a, and V6 pass, V5b passes or
resolves `NOT_APPLICABLE` (fail-closed re-confirmation), and the owner re-confirms D4**
on the corrected facts — verification cannot substitute for that decision.

| Phase 2 gate item                             | Status                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1. Wrapper tests pass                         | `PASS` — 22/22 targeted tests, 2026-08-07                                                      |
| 2. Token storage/rotation/revocation policy   | `BLOCKED` — Cheek (owner-only)                                                                 |
| 3. Schema/RLS/idempotency audit (= Phase 1.8) | `BLOCKED` — spec drafted; approval blocked on verification items + owner decisions (see below) |
| 4. Live-label fencing policy                  | `BLOCKED` — D3 approved 2026-08-12; D4 re-confirmation outstanding (premise corrected)         |

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
