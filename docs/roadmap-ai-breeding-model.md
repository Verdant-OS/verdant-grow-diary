# Roadmap — Extending Verdant Toward the AI & Data-Driven Breeding Model

Status: draft · Owner: product · Last updated: 2026-07-07

This roadmap maps the five-step **AI & Data-Driven Breeding Model** onto Verdant's
current architecture and sequences the work to close the gaps. It is grounded in a
capability audit of the codebase (see the comparison that produced it).

## Framing: what software can and cannot build

Verdant today is a **cultivation / grow-operations OS** with a **phenotype-selection**
surface (Pheno Hunt + Pheno Comparison). Two honest boundaries shape this roadmap:

- **Steps 2b–3 (genotyping + genome computation) are not buildable in-app.** DNA
  sequencing and marker/assay generation happen in a wet lab. Software's job is to
  **ingest, store, associate, and reason over** that external data — not produce it.
- **Step 5 (novel cultivars) is a breeding program, not a feature.** Software tracks
  the crossing workflow, the lineage, and the selection evidence that lead to a new
  cultivar; it does not "create" one.

Everything below respects Verdant's existing safety charter: RLS ownership via
`auth.uid()`, the RPC write boundary (never trust client `user_id`), no fake live
data, advisory-AI-is-suggest-only, and the approval-required Action Queue. Every
phase is gated by `docs/security-checklist.md` and ships with tests.

---

## Model → capability map (starting point)

| Step | Model intent | Today | Target phase |
|------|--------------|-------|--------------|
| 1 | Diverse population → structured, genetically-grouped datasets | Pheno Hunt groups plants; `strain`/`lineage` are free text | Phase 1 |
| 2a | Phenotyping (observation) | Pheno Comparison traits defined but **demo-only, unpersisted**; harvest = yield only | Phase 2 |
| 2b | Genotyping (DNA sequencing) | **Absent** | Phase 3 |
| 3 | Computation (trait → genome / marker discovery) | **Absent** | Phase 4 |
| 4 | AI applied to genetic information | AI is health/cultivation advisory only | Phase 4 |
| 5 | Novel cultivar creation | Crossing-workflow code exists but is **orphaned + broken at 4 layers** | Phase 0 |

---

## Phase 0 — Complete the orphaned breeding workflow (Step 5) · *immediate, in-repo*

The 6-event crossing workflow (`reversal_application → isolation_start →
stigmas_receptive → pollen_shed_observed → pollination → cross_harvest`) already has
domain rules (`src/lib/genetics/*`), a UI (`src/components/genetics/*`), an audit log,
and a `create-breeding-suggestions` edge function. It is **not reachable and would not
work if mounted.** Four defects:

1. **DB validator rejects it.** `validate_grow_event()` allows only
   `watering|feeding|training|observation|photo|environment`. The 6 breeding
   `event_type`s throw `invalid event_type`.
2. **Missing `details` column.** `create-breeding-suggestions` selects
   `grow_events.details`, which does not exist.
3. **Out-of-pattern write.** `BreedingLogContainer` does a direct client insert with
   client-supplied `user_id`; current convention is the `quicklog_save_manual` RPC
   trust boundary.
4. **Not mounted.** No route/nav mounts `BreedingLogContainer`.

**Work:** migration to extend the `validate_grow_event` allow-list + add a
`breeding_events` subtype table (payload/details, owner-validation trigger, RLS)
mirroring the existing subtype pattern; a `breeding_log_save_event` RPC (or extend
the existing quicklog RPC) so the write matches the trust boundary; fix the edge
function's column selection; mount the UI on `GrowDetail` beside the existing
Pheno Hunt entry; unit + component tests; run the DB-RPC RLS harness.

**Outcome:** Step 5 goes from *orphaned* to *functional & reachable*.

---

## Phase 1 — Structured genetics (Step 1)

Turn free-text `strain`/`breeder`/`lineage`/`generation` into a real, owned data
domain so plants and pheno-hunt cohorts carry **genetic identity**, not display text.

**Work:** `genetics` (accession/cultivar registry: name, breeder, type, source),
`genetics_parents` (parentage edges → lineage graph), `plants.genetics_id` FK; RLS
throughout; backfill from existing free-text `strain`; surface on plant + pheno-hunt
surfaces via the existing `plantGeneticsViewModel`. Makes Pheno Hunt cohorts
groupable **by genetic identity**, satisfying Step 1's dataset-structure intent.

---

## Phase 2 — Persist phenotype + chemotype (Step 2a)

Make phenotyping **real and analyzable**, not demo-only.

**Work:** persist the 10 Pheno Comparison traits (`structure, bud_density, resin,
aroma, vigor, stretch, node_spacing, disease_resistance, finish, yield`) per plant /
candidate / timepoint; extend `harvests` with a **lab panel** (THC/CBD %, total
cannabinoids, terpene profile) ingested from lab CSV/PDF with source labeling (never
shown as live). Wire Pheno Comparison to live data behind a feature flag. This
produces the structured phenotype dataset Steps 3–4 require.

---

## Phase 3 — Genotyping ingestion (Step 2b) · *external data integration*

No sequencing in-app. Build the **genomics data domain** that ingests external lab
output.

**Work:** `genomic_samples` (per accession/plant, lab + method + date),
`genomic_markers` (SNP/KASP/marker id, allele calls), importer for common lab report
shapes with strict validation and provenance; storage of raw report artifacts. Blocked
on: users actually having sequencing/marker data — so ship the import path + schema
first, value accrues as data arrives.

---

## Phase 4 — Computation + predictive AI (Steps 3–4)

Only meaningful once Phases 2–3 have populated enough paired phenotype + genotype rows.

**Work:**
- **Computation (Step 3):** marker–trait association (start descriptive:
  marker-frequency vs. trait-value tables per accession; graduate to QTL/association
  stats as N grows). Deterministic, evidence-linked, reproducible.
- **AI (Step 4):** a **predictive breeding assist** that proposes crosses / flags
  promising selections. **Reconciled with the read-only charter:** it stays
  suggest-only, cites its evidence rows, writes only approval-required Action Queue
  items, never auto-acts, and never fabricates data (same guarantees as AI Doctor /
  AI Coach). This is where the dormant `breeding_database` tier-unlock becomes a real
  feature.

---

## Cross-cutting requirements (every phase)

- RLS `auth.uid()` ownership on all user-owned tables; no `service_role` in client.
- Writes go through the RPC trust boundary; client `user_id` is never trusted.
- All sensor/lab data carries a source label; nothing stale/demo renders as healthy/live.
- AI remains advisory, suggest-only, approval-required.
- New behavior ships with tests; data-access/AI/migration PRs run the security checklist.
