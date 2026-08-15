# Knowledge library — status audit and scaling plan

**Status:** `HOLD — approvable, sequencing decision needed from Cheek`
**Author:** Claude (Knowledge Library & Product Specification Architect)
**Audited ref:** `origin/verdant-grow-diary` (fetched via `git show`/`git grep`, not checked out).
This spec's own branch (`claude/vibrant-liskov-22927f`, based on `main`) does not carry
`docs/knowledge-library/`. Same branch-mismatch pattern already documented for
`funnelAnalytics.ts` — see [funnel-analytics-sanitizer-enum-hardening-specification.md](funnel-analytics-sanitizer-enum-hardening-specification.md).
**Trigger:** Cheek granted "full authority to scale the knowledge library and product
spec architect"; confirmed scope was spec/architecture depth, not a shipping-gate override.

## Executive summary

A complete, CI-governed knowledge-library system already exists on the deploy branch —
`docs/knowledge-library/`: a README defining mission/SLOs/authority order, a site map, a
knowledge graph contract, pillar-page teaching contracts, an internal-linking contract, a
content-standards doc, an editorial-workflow state machine with ten review roles and
zero-tolerance gates, four JSON Schemas, and a 500-record roadmap with its own validator
scripts wired into CI. This is not something to re-architect; it needs to be read, audited
for current status, and scaled forward inside its own rules.

Three things this audit found that nobody had assembled before:

1. **`docs/knowledge-library/` is entirely absent from `docs/agents/CURRENT_STATE.md`.**
   A 500-record, digest-pinned, CI-gated system with its own validators does not appear in
   the shift-report every agent reads first. That is a real staleness gap in the
   coordination layer.
2. **The real bottleneck is 7 missing pillar pages, not 490 missing briefs.** Only 3 of
   the 10 canonical pillars are live. All 24 `blocked_parent` records trace back to that.
   Authoring child briefs before their pillar ships is out-of-order work under the
   system's own prerequisite rule.
3. **CURRENT_STATE.md's blocker #3 ("`/cultivars/*` has no eligibility gate") is stale.**
   It is not ungated — it's gated by `roadmap-500.json`, a different artifact than the one
   that blocker cites (`docs/seo/content-taxonomy.md`). All 10 live cultivar pages already
   have roadmap records (`KL-017`, `KL-027`, `KL-037`, `KL-047`, `KL-057`, `KL-067`,
   `KL-077`, `KL-087`, `KL-097`, `KL-107`); they're metadata-only, same as everything else
   blocked behind the genetics pillar. The gate exists; it just hasn't advanced past
   `needs_editorial_brief`.

## What was NOT done, and why

I did not author 32 editorial/search/link briefs in this pass. Two hard blockers apply
equally to every one of them:

- **No worktree access to validate against.** `roadmap-500.json` carries a pinned identity
  digest and an append-only brief lifecycle ("once a brief reaches its final state, its
  evidence payload cannot be rewritten in place"). `scripts/knowledge/validate-roadmap.mjs`,
  `validate-governance.mjs`, and `validate-schemas.mjs` exist only on `verdant-grow-diary`.
  Hand-editing that JSON blind, from a `main`-based worktree with no way to run its own
  validator, is the highest-risk edit available in this repo.
- **No search brief is currently producible.** `editorial-workflow.md`'s search-research
  receipt requires a reproducible query family, tool, collection date, region, and observed
  SERP intent. `docs/agents/CURRENT_STATE.md` records `gsc_access_status: BLOCKED` and
  `ga4_access_status: BLOCKED`, and the only authorized keyword dataset is the
  owner-supplied Semrush US lighting snapshot — which doesn't cover fundamentals, health,
  nutrition, genetics, or equipment. Writing `searchBriefStatus: needs_research -> draft`
  for any of these 32 records today would mean inventing a receipt. This blocks authoring
  by anyone, human or agent, not just me.

Writing 32 briefs from a title and slug, with a fabricated search receipt, would be exactly
the invented-content failure this system's ten review gates exist to reject. What follows
instead is the audit, the sequenced work-list, and one grounded example.

## Current state by the numbers

Read from `docs/knowledge-library/roadmap-500.json` (version 1, generated 2026-08-01):

| Metric | Value |
|---|---|
| Total roadmap records | 500 (50 per pillar × 10 pillars) |
| Records with an authored brief (`briefStatus` past `needs_editorial_brief`) | 10 — the pillar records only |
| Records still metadata-only (`needs_editorial_brief`) | 490 |
| Live routes (`routeStatus: live`) | 35 |
| Live pillar routes | **3 of 10** (`fundamentals`, `sensors`, `stages`) |
| Live non-pillar routes with no brief yet | **32** |
| `libraryReadiness: blocked_parent` | 24 |
| `libraryReadiness: unassessed` | 11 |
| `libraryReadiness: backlog` | 465 |
| Page-family distribution | `reference` 296, `protocol` 88, `diagnostic` 45, `worked-example` 29, `entity` 20, `comparison` 12, `pillar` 10 |

CI wiring confirmed present: `knowledge:validate` is referenced in both
`.github/workflows/ci.yml` and `package.json` on the deploy branch — this is not a dormant
proposal, it is a live gate. I did not re-run it (no worktree access); its actual current
pass/fail status is `NOT_MEASURED` by this audit.

## The critical-path finding: pillars, not briefs, are the bottleneck

| Pillar | Path | `routeStatus` |
|---|---|---|
| P1 fundamentals | `/guides/grow-diary-app` | **live** |
| P2 environment | `/guides/grow-room-environment-fundamentals` | planned |
| P3 sensors | `/guides/sensor-truth-grow-room` | **live** |
| P4 irrigation | `/guides/cannabis-root-zone-and-irrigation-fundamentals` | planned |
| P5 nutrition | `/guides/cannabis-nutrition-and-solution-management-fundamentals` | planned |
| P6 health | `/guides/cannabis-plant-health-and-ipm-fundamentals` | planned |
| P7 genetics | `/guides/cannabis-genetics-provenance-and-propagation-fundamentals` | planned |
| P8 stages | `/guides/grow-stage-care-guide` | **live** |
| P9 harvest | `/guides/cannabis-harvest-and-post-harvest-fundamentals` | planned |
| P10 equipment | `/guides/grow-room-equipment-and-integration-fundamentals` | planned |

`site-map.md`'s own rule: "a pillar cannot launch until... every L1 label... the beginner,
active-problem, optimization, and commercial-SOP paths each reach a useful answer."
`pillar-pages.md` gives each pillar a full anatomy (reader outcomes, mental model,
measure-before-acting, start paths, failure modes, deep topic map, original assets,
sources/review, practice step) and a pillar-specific acceptance gate. Publishing the 7
missing pillars is real authoring work — a mental model, failure-mode catalog, and topic
map per domain, reviewed by cultivation + evidence + product-truth roles — not a brief
that can be filled from metadata. **This is the actual unlock.** Every child brief authored
before its pillar ships stays governed-blocked regardless of its own quality.

## The `current_route_remediation` cohort (32 records)

These are **already-live pages** carrying no roadmap brief — governance debt on pages
serving traffic today, not new page families. This is the named next cohort
(`priorityLane: "current_route_remediation"` is already a field in the data model — this
work was anticipated, not invented here), ordered by roadmap priority. Per
`editorial-workflow.md`'s own cohort-planning rule (max 20 pages per cohort), this splits
into two:

**Sub-cohort A — blocked on a pillar that must ship first (22 records):** cannot legitimately advance past brief authoring until their pillar publishes.

| Priority | ID | Pillar | Path | Blocked on pillar |
|---|---|---|---|---|
| 11 | KL-012 | environment | `/guides/grow-room-vpd-tracker` | P2 |
| 12 | KL-014 | irrigation | `/guides/plant-watering-log` | P4 |
| 13 | KL-016 | health | `/guides/bud-rot-prevention-identification` | P6 |
| 14 | KL-105 | nutrition | `/guides/cronk-nutrients-grow-diary` | P5 |
| 15 | KL-115 | nutrition | `/guides/athena-nutrients-grow-diary` | P5 |
| 16 | KL-125 | nutrition | `/guides/jacks-nutrients-grow-diary` | P5 |
| 17 | KL-135 | nutrition | `/guides/house-and-garden-nutrients-grow-diary` | P5 |
| 18 | KL-145 | nutrition | `/guides/canna-nutrients-grow-diary` | P5 |
| 19 | KL-225 | nutrition | `/guides/cannabis-nutrient-schedule` | P5 |
| 21 | KL-427 | genetics | `/guides/oreoz-vs-gelonade-comparison` | P7 |
| 22 | KL-476 | health | `/guides/cannabis-light-stress-light-burn-bleaching-or-heat` | P6 |
| 24 | KL-496 | health | `/guides/cannabis-plant-care` | P6 |
| 38 | KL-017 | genetics | `/cultivars/sour-diesel` | P7 |
| 40 | KL-027 | genetics | `/cultivars/og-kush` | P7 |
| 42 | KL-037 | genetics | `/cultivars/blue-dream` | P7 |
| 44 | KL-047 | genetics | `/cultivars/gg4` | P7 |
| 46 | KL-057 | genetics | `/cultivars/lemon-cherry-gelato` | P7 |
| 48 | KL-067 | genetics | `/cultivars/oreoz` | P7 |
| 49 | KL-077 | genetics | `/cultivars/do-si-dos` | P7 |
| 50 | KL-087 | genetics | `/cultivars/blue-cookies` | P7 |
| 51 | KL-097 | genetics | `/cultivars/jack-herer` | P7 |
| 52 | KL-107 | genetics | `/cultivars/sour-stomper` | P7 |
| 53 | KL-110 | equipment | `/guides/ac-infinity-data-logging` | P10 |
| 54 | KL-120 | equipment | `/guides/spider-farmer-data-logging` | P10 |

**Sub-cohort B — parent pillar already live, brief can start now (10 records):** these sit
under `fundamentals` (P1, live), `stages` (P8, live), or record `libraryReadiness:
unassessed` for reasons other than a missing pillar — no pillar-publication dependency
blocks brief authoring.

| Priority | ID | Path | Parent (live) |
|---|---|---|---|
| 20 | KL-288 | `/guides/cannabis-grow-light-distance-and-schedule` | `/guides/grow-stage-care-guide` |
| 23 | KL-481 | `/guides/ai-grow-doctor` | `/guides/grow-diary-app` |
| 37 | KL-011 | `/guides/how-to-start-a-grow-journal` | `/guides/grow-diary-app` |
| 39 | KL-021 | `/guides/what-to-log-in-a-grow-journal` | `/guides/grow-diary-app` |
| 41 | KL-031 | `/guides/daily-grow-log-checklist` | `/guides/grow-diary-app` |
| 43 | KL-041 | `/guides/grow-journal-template` | `/guides/grow-diary-app` |
| 45 | KL-051 | `/guides/grow-log-app-vs-grow-journal` | `/guides/grow-diary-app` |
| 47 | KL-061 | `/guides/grow-journal-app-without-account` | `/guides/grow-diary-app` |

**This is the smallest credible next tranche: sub-cohort B, 8 records.** Even these are
still blocked on the search-brief problem above (no GSC/GA4, no authorized demand data for
non-lighting topics) — but their editorial and link briefs can legitimately advance today,
grounded in the actual live page content, with `searchBriefStatus` explicitly held at
`needs_research` and annotated `BLOCKED — no authorized demand source` rather than
fabricated.

## Exemplar brief — format demonstration, not a submittable record

Drafted after reading the actual live content of `/guides/how-to-start-a-grow-journal`
(`src/constants/verdantSeoContent.ts:761-802`, deploy branch) so the `decision` /
`applicability` / `informationGain` fields describe what the page really does, not what
its title implies. This is **one page, hand-verified**, offered to show the target shape —
not a template to mechanically repeat across the other 31.

```json
{
  "id": "KL-011",
  "editorialBrief": {
    "decision": "Use this page to decide how to start a grow journal today without being blocked by wanting a complete system first.",
    "applicability": "Applies to a grower who has not started logging yet, or who abandoned a prior journal and is deciding how to restart without repeating the same overhead.",
    "informationGain": "Resolves the false choice between 'log everything' and 'log nothing' by naming the minimum viable first entry (one plant, one note) and explaining why smaller starts survive past week two.",
    "assetMethod": "n/a — this page teaches a starting habit, not a worked calculation; its 'asset' is the linked 30-second Quick Log starter itself, which is a shipped product route, not an original editorial asset",
    "assetInputs": [],
    "assetOutput": "A grower can name their first log entry (nickname + one action or observation) and knows where to make it (/quick-log, no account required)."
  },
  "searchBrief": {
    "queryFamily": [],
    "serpIntent": "BLOCKED — no authorized demand source. gsc_access_status and ga4_access_status are both BLOCKED per docs/agents/CURRENT_STATE.md; this topic is outside the only authorized dataset (owner-supplied Semrush US lighting snapshot). Do not invent a query family or SERP intent for this record.",
    "distinctInformationGain": "NOT_ASSESSABLE without the receipt above.",
    "competingCanonical": null,
    "consolidationTrigger": "n/a — cannot evaluate collision without a search receipt."
  },
  "linkBriefNotes": "Per internal-linking.md's instructional-reference slot rules: breadcrumb -> /guides/grow-diary-app (live, correct). Prerequisite: not required (page is itself an entry point). Contextual laterals: page's own `related` array already lists what-to-log-in-a-grow-journal, daily-grow-log-checklist, grow-diary-app — daily-grow-log-checklist and what-to-log-in-a-grow-journal are BOTH themselves in this same remediation cohort (KL-031, KL-021) with no brief yet, so their edges cannot render as live knowledge links per internal-linking.md's publishable-edge rule until they publish too, unless released in the same atomic cohort. Next step: product action to /quick-log already present and product-truth-plausible (matches shipped Quick Log starter behavior described in docs/agents/CURRENT_STATE.md's product context), but requires product-truth re-verification against current code before this could pass review, not assumed from copy alone.",
  "status_if_submitted": "Would still fail editorial-workflow.md's definition-of-ready: 'search intent is at least researched with a reproducible receipt' is not met. This record cannot legitimately advance to `draft` today."
}
```

This demonstrates two things worth generalizing: (1) even a page with clean, honest,
well-written existing copy cannot get a valid brief past the search-brief gate right now,
and (2) the internal-link laterals inside sub-cohort B mostly point at *each other* — which
means sub-cohort B's own children are naturally suited to an atomic co-release cohort per
`editorial-workflow.md`'s "independently `ready` children in the same atomic cohort"
allowance, once the search-brief blocker clears.

## Proposed addition to `docs/agents/CURRENT_STATE.md`

For Cheek's approval — I did not apply this myself; it is a live multi-agent shift-report
file edited by convention, not unilaterally by one agent's audit. Proposed new subsection
under "Unrelated work in flight":

> ### Knowledge library — 500-page v1 roadmap (governance built, content not authored)
>
> `docs/knowledge-library/` (deploy branch only) is a complete, CI-wired governance system
> for a 500-page cultivation reference: README (mission/SLOs/authority), site map,
> knowledge graph, pillar-page contracts, internal-linking contract, content standards,
> editorial workflow, 4 JSON Schemas, and roadmap validators (`knowledge:validate` in CI).
> Status as of 2026-08-13 audit: 10 pillar records briefed, 490 records metadata-only; only
> 3 of 10 pillars are live (`fundamentals`, `sensors`, `stages`) — the other 7 gate 24
> `blocked_parent` records, including all 10 live cultivar pages (**this resolves blocker
> #3 above** — the cultivar gate exists in `roadmap-500.json`, not `content-taxonomy.md`,
> and is metadata-only pending its P7 genetics pillar). 32 live routes carry no roadmap
> brief at all. Full audit + sequenced work-list:
> `docs/knowledge-library-status-audit-and-scaling-plan.md`. No brief can legitimately
> advance past `needs_research` today — the search-research receipt requires GSC/GA4,
> both `BLOCKED`. This is a distinct workstream from the SEO repair-and-measurement slice
> above; it shares the same GA4/GSC blocker but is otherwise independent.

## Recommended sequencing

1. **Cheek decision needed:** does clearing GA4/GSC access (owner-only, already blocking
   the SEO slice above) get treated as a shared prerequisite for both workstreams? It
   blocks every search brief in both.
2. Once unblocked: author search-research receipts for sub-cohort B (8 records) first —
   they need no pillar to ship first.
3. In parallel, scope the P1/P8-adjacent pillar work needed to fully qualify `fundamentals`
   and `stages` past `unassessed` (they're live but not yet marked `libraryReadiness:
   ready` either — worth a follow-up read of what `unassessed` is specifically waiting on).
4. Only after that: prioritize authoring the 7 missing pillars themselves (P2, P4, P5, P6,
   P7, P9, P10) by `blocked_parent` count — P7 genetics unlocks the most (11 records: 1
   comparison + 10 cultivars), P5 nutrition unlocks 6, P6 health unlocks 3.
5. Do not hand-author briefs for sub-cohort A (the 22 pillar-blocked records) before their
   pillar ships — that is out-of-order work under the system's own prerequisite rule, and
   would produce briefs that sit un-reviewable regardless of quality.

## Appendix: the 7 missing pillars, by impact

Read from `pillar-pages.md`'s full anatomy for each pillar (reader jobs, L1 collections,
required original assets, high-risk review scope, pillar-specific acceptance gate) plus
`roadmap-500.json` counts. Ordered by direct `blocked_parent` unlock — i.e., records whose
`parentPath` is the pillar itself, not a not-yet-published L1 cluster beneath it (shipping
the pillar page does not automatically unblock every one of its 50 records; L1 clusters
are their own separately reviewed gate per `site-map.md`).

| Pillar | Unlocks now | R3 (needs qualified human safety reviewer) | R2 | What makes it hard |
|---|---:|---:|---:|---|
| **P7 Genetics, cultivars, propagation** | **11** (1 comparison + all 10 live cultivar pages) | 0 | 17 | Provenance/lineage schema, mother→batch→plant traceability graph, pheno-hunt bias/confounder methodology. No R3 — the hard part is structural rigor, not safety sign-off. |
| **P5 Nutrition and solution management** | 6 | 1 | 48 | 5 of its 6 blocked records are vendor-specific pages (Cronk, Athena, Jack's, House & Garden, Canna) — the pillar's own high-risk rule is explicit: "Cronk or any other nutrient line is recorded as a source/program, never used to invent dosage claims." Real risk of drifting into uncited dosage guidance. |
| **P6 Plant health, IPM, biosecurity** | 3 | 4 | 46 | Heaviest safety surface: pesticide label compliance, pathogen testing/false-result limits, quarantine, REI/PHI. Diagnostic pages require ≥2 competing causes + confirmation/disconfirmation — not skippable, not waivable. |
| **P10 Equipment and read-only integrations** | 2 | 3 | 12 | Electrical/structural/HVAC installation guidance needs a qualified reviewer; integration-status pages must prove capability state against actual shipped Verdant behavior (product-truth review, not just editorial). |
| **P2 Environment, climate, light** | 1 | 4 | 44 | Highest R3 density relative to size (4 of 50). CO2, HVAC sizing, condensate, structural — real professional-boundary content, not just measurement reference. |
| **P4 Root zone and irrigation** | 1 | 0 | 46 | No R3, but wide L1 surface (7 collections) and a hard rule against prescribing changes from one reading — evidence-discipline-heavy even without safety sign-off. |
| **P9 Harvest and post-harvest** | 0 | 0 | 45 | Nothing currently blocked on it directly, but it's a full 50-record pillar in its own right (mass-balance, dry-room environment, lab/sensory claim limits) and post-harvest microbial/contamination review still needs a qualified reviewer per its high-risk rule even though no roadmap record is flagged R3 yet. |

**Resourcing note:** 12 records across these 7 pillars are pre-classified `R3` and cannot
skip `safety_review` — `editorial-workflow.md` names that role's scope as "electrical,
fire, structural, HVAC, compressed CO2, pesticide, laboratory, or legal," explicitly a
qualified human, not an agent. Shipping P2, P5, P6, or P10 means lining up that reviewer
before those specific pages can pass, independent of the search-brief/GA4-GSC blocker
above — a second, parallel resourcing gate worth surfacing to Cheek now rather than at
review time.

**If forced to sequence by unlock-per-effort:** P7 genetics is the standout — highest
unlock (11), zero R3 records, and its hard part (lineage schema, bias methodology) is
exactly the kind of structural specification work suited to spec-first authoring rather
than safety sign-off. It's also the only pillar whose immediate unlock is dominated by
already-live pages (all 10 cultivars) rather than net-new content. P9 harvest is the
opposite case: nothing unlocks today, but it's needed for coverage-floor completeness and
has no R3 blocker either — a reasonable second target once P7 is moving.

**Update 2026-08-13, same day:** acted on this. A full Author-role draft of the P7 pillar
page now exists — [docs/knowledge-library-pillar-p7-genetics-draft.md](knowledge-library-pillar-p7-genetics-draft.md),
following `pillar-pages.md`'s nine-part anatomy, grounded in 8 real peer-reviewed/extension
sources (hop latent viroid transmission and asymptomatic carriage, cannabis-specific
rooting/tissue-culture research, genotype×environment chemotype variation, germplasm
accession recordkeeping standards, general plant-breeding trial design). It also surfaces
a load-bearing finding for the 10 cultivar entity pages: `src/constants/strainReferenceLibrary.ts`
already provides real, source-cited, appropriately-hedged cultivar data
("breeder: null," "commonly reported," confidence-scored claims) — the gap for those 10
pages is reconciling that existing dataset against `cultivar.schema.json`, not inventing
lineage content from scratch. No lineage/genotype claims were written for any named
commercial cultivar beyond what that existing file already states. Still `HOLD` — this
draft has not passed evidence, cultivation, or product-truth review.

## Update 2026-08-13, later same day: worktree validation + a corrected authoring-contract finding

Cheek's instruction: "The draft hasn't passed evidence, cultivation, or product-truth
review, and can't be validated from this worktree. Open a new work tree and scale each
feature." Acted on the first half; the second half needs a correction before it should be
generalized to the other 6 pillars.

**Worktree opened and validated.** `C:/dev/vgd-wt-knowledge-library-scale`, branch
`claude/knowledge-library-scale`, created via `git worktree add` against a clean
non-OneDrive clone (per [[project-project-onedrive]]'s founder directive), tracking
`origin/verdant-grow-diary` at `fb42ce00e`. `bun install` succeeded cleanly (876 packages,
~51s — this worktree is outside the OneDrive corruption zone, unlike this one). This
closes the `NOT_MEASURED` unknown from the handoff below: **`node --run knowledge:validate`
is `PASS`, 224/224, at `fb42ce00e`.** `validate-roadmap.mjs` and `validate-governance.mjs`
individually confirmed green too. **Nothing in this worktree is committed or pushed** —
it's local proof-of-mechanism state only, and this doc is the record of what was in it.

**Correction: search briefs are not stuck at `needs_research`.** The "Recommended
sequencing" section above states GSC/GA4 "blocks every search brief in both [workstreams]."
That's wrong, proven by evidence already sitting in the roadmap: KL-007 (the P7 pillar
record) has `searchBriefStatus: "draft"` with a real written `queryFamily`, not
`needs_research`. `editorial-workflow.md`'s own state machine is
`needs_research -> draft -> validated` — three states, not two. "Draft" is a good-faith,
author-written query-family hypothesis; it does not require GSC/GA4 access. Only advancing
to `validated` requires the reproducible search-research receipt that access unblocks. This
means sub-cohort A and B's search briefs are not actually blocked from `draft` today — only
from `validated`. The KL-011 exemplar brief above therefore undersold itself: its
`serpIntent: "BLOCKED — no authorized demand source"` framing was more conservative than
the system's own precedent already permits.

**Proved the mechanism on one record, then reverted.** Per the advisor's guidance — a local
`validate-*` pass without `--base-revision` on `validate-governance.mjs` doesn't prove
append-only/no-skip history the way a real PR's CI would; a local green is evidence the
patch shape is structurally valid, not evidence it would clear CI as-is — I hand-authored a
full `brief` + `searchBrief` patch for KL-011 in the new worktree, advanced its three status
fields to `draft`, ran all three validators plus the full test suite, then **reverted the
file** (`git checkout --`) rather than leave edits sitting uncommitted. Two things this
proved, both material to whoever does this for real:

1. **Advancing `briefStatus` to `draft` is a much bigger authoring surface than the compact
   `brief` object alone.** `validate-roadmap.mjs`'s `validateAuthoredBrief()` additionally
   requires, once brief status leaves the pending branch: a `readerOutcome` string (exact
   prefix `"After this page, the reader can "`, ≥16 words, must contain one of a fixed verb
   list, must share a meaningful token with the page's title/pillarName after stopword
   filtering — note `"grow"` and `"fundamentals"` are themselves stopwords in this checker,
   so a title built entirely from those words needs a different shared token, e.g.
   `"journal"`); a `nonProductNextStep` string (prefix `"Next, "`, ≥14 words, must NOT
   contain `/quick-log`, `/pricing`, or `/tools/`); an `originalAsset` string that must
   equal, byte-for-byte, `${assetMethod}. Inputs: ${assetInputs.join("; ")}. Output:
   ${assetOutput}.` derived from the brief's own fields; and exactly two `relatedPaths`
   (real roadmap paths, neither the page's own path nor its parent). `searchBrief.
   competingCanonical.relationship` is also a closed enum — only `hub_child`,
   `differentiate`, `none_identified` — KL-007's own `hub_child` doesn't generalize to a
   sibling relationship, which needs `differentiate` instead. This is real, useful
   discovery for whoever lands sub-cohort B for real: budget for the full field set, not
   just the two-object `brief`/`searchBrief` shape the KL-007 example suggested.
2. **`scripts/knowledge/validate-roadmap.test.mjs` pins KL-011 by ID as a fixture for
   "pending record" behavior** (it asserts that giving KL-011 a `searchBrief` while pending
   throws `"KL-011 pending search brief must omit searchBrief"`). A structurally valid edit
   to KL-011's real record collided with that fixture and failed the full suite even after
   the validators alone passed clean. **Any real authoring pass on a specific record ID
   needs a check against the test suite's own fixtures first, not just the validators** —
   this generalizes beyond KL-011 and should be checked per-record before landing any of
   sub-cohort A/B for real.

**Not done:** the other 6 missing pillars (P2, P4, P5, P6, P9, P10) — no drafts, no
research, no worktree work yet. The corrected draft-vs-validated understanding above should
inform that work when it happens (search briefs can reach `draft`, not just page-content
drafts), but nothing has been produced for them. This is a status report on the mechanism,
not a claim that "scale each feature" is complete.

## Handoff

```text
HANDOFF
from_agent: Claude
to_agent: Codex (roadmap/pillar authoring), Cheek (GA4/GSC + sequencing decision)
sentinel_version: 2026-08-01.2
date: 2026-08-13

completed:
  - Full audit of docs/knowledge-library/ against origin/verdant-grow-diary (README,
    site-map.md, editorial-workflow.md, pillar-pages.md, internal-linking.md,
    roadmap-500.json structure and status distribution)
  - Identified the critical-path bottleneck (7/10 pillars unpublished) and traced all 24
    blocked_parent records to it
  - Enumerated and split the current_route_remediation cohort (32 live-but-unbriefed
    records) into pillar-blocked (22) vs. startable-now (8) sub-cohorts
  - Cross-referenced and resolved CURRENT_STATE.md's blocker #3 (cultivar gate) against
    the actual roadmap-500.json records
  - Confirmed knowledge:validate CI wiring exists (did not re-run it — no worktree access)
  - Drafted one hand-verified exemplar brief (KL-011) grounded in live page content

verified_by:
  - git show/git grep against origin/verdant-grow-diary (fetched, not checked out)
  - roadmap-500.json parsed and aggregated via a local Node script (counts in this doc are
    computed, not estimated)
  - KL-011's brief fields checked against its actual live copy in
    src/constants/verdantSeoContent.ts:761-802

not_done:
  - No brief was written into roadmap-500.json. No code changed. CI was not re-run.
  - content-standards.md, knowledge-graph.md, and the 4 JSON Schemas were read for context
    but not exhaustively audited line-by-line — flagged as a gap, not silently skipped

unknowns:
  - What specifically blocks fundamentals/sensors/stages (the 3 live pillars) from
    libraryReadiness: ready instead of unassessed — worth a follow-up read
  - Whether knowledge:validate is currently green or red on verdant-grow-diary — NOT_MEASURED

blocked:
  - Every search brief for every one of the 32 records: GSC/GA4 BLOCKED (owner-only,
    same blocker already tracked for the SEO slice)
  - Any direct edit to roadmap-500.json from this environment: no worktree on
    verdant-grow-diary, no access to its validator scripts

assumptions:
  - None beyond what's cited — every number in this document was computed from the actual
    JSON file, not inferred from the README's prose claims alone

next_slice:
  - Cheek: approve or amend the proposed CURRENT_STATE.md addition above
  - Cheek: decide whether GA4/GSC clearance is sequenced as a shared blocker for both the
    SEO slice and this workstream
  - Codex (once search-brief blocker clears, on a verdant-grow-diary worktree): author
    editorial + link briefs for sub-cohort B (8 records), running validate-roadmap.mjs and
    validate-governance.mjs against each

files_touched:
  - docs/knowledge-library-status-audit-and-scaling-plan.md (this file, main-based
    worktree — audit documentation of a deploy-branch-only system, same precedent as
    docs/agents/CURRENT_STATE.md and the funnel-analytics spec)
  - docs/agents/CURRENT_STATE.md (pending — proposed addition above, not yet applied)
```

**Addendum, 2026-08-13 later same day** (see "Update... worktree validation" section
above for full detail — this only patches the specific lines this addendum supersedes):

- `unknowns`: "Whether knowledge:validate is currently green or red" is resolved, not
  `NOT_MEASURED` — confirmed `PASS`, 224/224, at `fb42ce00e` in
  `C:/dev/vgd-wt-knowledge-library-scale`.
- `blocked`: "Every search brief... GSC/GA4 BLOCKED" is corrected — only advancing
  `searchBriefStatus` to `validated` needs GSC/GA4. `draft` (an authored query-family
  hypothesis) does not, per `editorial-workflow.md`'s own three-state machine and KL-007's
  existing precedent. "Any direct edit to roadmap-500.json... no worktree access" is also
  resolved — a worktree now exists and a full-field patch was proven structurally valid
  there (then reverted; nothing is committed).
- `next_slice` addition: before Codex lands sub-cohort A/B for real, check each target
  record ID against `scripts/knowledge/validate-roadmap.test.mjs`'s own fixtures —
  KL-011 specifically is pinned there as a "pending record" example and cannot be authored
  without first updating or relocating that fixture.
