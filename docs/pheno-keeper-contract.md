# Pheno Hunt keeper contract (amended 2026-07-21)

The binding rules for keeper selection surfaces. Amended by founder ruling on
2026-07-21 following the external contract audit: the PhenoID add-on carve-out
below is **authorized**, everything else is unchanged. Two tests enforce this
document: `src/test/phenoid-ranking-read-fence.test.ts` (core never reads
ranking data) and `src/test/phenoid-addon-contract.test.ts` (the carve-out's
conditions).

## Core contract (unchanged)

- **Keeper decision is grower/breeder judgment only.** No score, model, or
  automation ever selects, promotes, or recommends a keeper. Keeper promotion
  requires an explicit grower action (typed keeper name).
- **Core Verdant never ranks.** The canonical `pheno_*` tables and core rule
  modules model per-candidate evidence only — no weighting, no composite, no
  cross-candidate ordering. Enforced: no runtime `src/**` module may read
  `winner_score`, `loud_shortlist`, or query `phenoid_*` tables (read fence).
- **Sensors are context only.** No sensor-derived value enters any score.
- **Candidates are existing plants** (plant_id FKs; no parallel candidate
  entity).
- **Missingness stays visible** — thin records, n=1, missing post-cure render
  as incomplete, never silently comparable.
- **Forbidden language everywhere:** "picks winners", "guaranteed keeper",
  "AI top pick", "recommended keeper", auto-populated keeper status.

## The PhenoID add-on carve-out (authorized 2026-07-21)

The entitlement-gated PhenoID add-on (`phenoid_*` tables; Contenders board,
Showcase pack, Fight Night) **may present grower-entered trait scores as a
sortable shortlist** — composite score, shortlist rank, per-trait leader
markers, and top-2 fight seeding — under ALL of these conditions:

1. **Inputs are grower-entered trait scores only.** Never sensor data, never
   model output rendered as Verdant's judgment.
2. **Every ranked surface carries a non-deciding disclaimer** (board, showcase
   pack, and their view-models): the sort compares, it does not decide; the
   keeper call is the grower's, earned at the cure.
3. **No winner is ever emitted by Verdant.** Fight Night records the grower's
   own call; the fight view-model deliberately has no `winner` field.
4. **Nothing ranked ever writes keeper status.** Promotion remains a separate,
   explicit grower action, uncoupled from any score.
5. **The forbidden-language list applies unchanged** inside the add-on.
6. **Quarantine holds:** ranking data stays in `phenoid_*` + the add-on
   surfaces; the core read fence stays green. New readers require editing the
   fence's allowlist with written justification.

Rationale: the shortlist is the grower's own scores played back in a
comparable order — organization of evidence, not a verdict — and it stays
behind its own entitlement. The distinction the contract protects is between
*Verdant deciding* and *Verdant arranging*; the conditions above hold that
line and are enforced by test.

## Known open items (audit 2026-07-21, not blockers)

- No mismatched-**stage** comparability warning (grow/tent warnings exist).
- Autoflower vs photoperiod not distinguished in pheno comparison.
- `phenoid_*` entitlement plan_ids are placeholders pending SKU sign-off.
