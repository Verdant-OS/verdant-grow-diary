# P7 pillar draft — Genetics, cultivars, and propagation

**Editorial-workflow state:** `drafted`. This is an **Author-role draft** in
`editorial-workflow.md`'s sense — accountable for "accurate synthesis, claim map, original
asset, disclosures, and revision response." It has **not** passed `evidence_review`,
`cultivation_review`, `product_truth_review`, `technical_review`, or
`copy_accessibility_review`, and per that document's role table the author cannot be the
sole evidence or cultivation approver for R2 material — every claim below needs an
independent evidence editor and cultivation reviewer before this is publishable. Treat
every citation here as a starting claim map, not a cleared source list.

**Target route:** `/guides/cannabis-genetics-provenance-and-propagation-fundamentals`
(roadmap `pillar` record, `pillar` field `genetics`, `pillarRank: 7`, currently
`routeStatus: planned`). Unlocks 11 `blocked_parent` records on publication — 1 comparison
(`oreoz-vs-gelonade-comparison`) and all 10 live cultivar entity pages. See
[docs/knowledge-library-status-audit-and-scaling-plan.md](knowledge-library-status-audit-and-scaling-plan.md)
for the full audit this draft grew out of.

**Not done here:** search-research receipt (`BLOCKED` — GA4/GSC), L1 cluster pages (this
draft covers the pillar page only, per `site-map.md`'s rule that pillar publication does
not itself clear every child — L1 clusters are their own separately reviewed gate),
`roadmap-500.json` was not edited, no JSON Schema validation was run (no worktree access
to `scripts/knowledge/validate-schemas.mjs`).

---

## 1. Reader outcomes and scope

A grower or breeder using this page can, afterward:

- Record what a plant or accession is *claimed* to be, distinguish that claim from a
  verified genotype, and know which unknowns are acceptable to leave unresolved.
- Trace a mother plant forward to every production plant it produced, and trace a
  problem (pathogen, mislabel, poor performance) backward to its source.
- Choose a propagation method (seed, cutting, tissue culture) appropriate to the goal, and
  understand what each method risks introducing (genetic drift, somaclonal variation,
  pathogen carryover).
- Screen incoming material for pathogens before it enters a shared space, and know that a
  negative test is a point-in-time result, not a lifetime guarantee.
- Design a phenotype comparison that a stranger could audit — matched conditions, defined
  traits, a way to handle missing data, and a visible account of what could have biased
  the result.

**Explicit non-scope:** this page does not identify, authenticate, or verify any specific
named commercial cultivar's actual lineage. It does not replace a laboratory genotyping
service, a licensed breeder's own records, or a jurisdiction's seed-certification program.
V1 is indoor-first; outdoor/field genebank practice is referenced only where the underlying
recordkeeping principle transfers, and that transfer is labeled, not assumed.

## 2. Mental model

Three things are commonly conflated and shouldn't be: **identity** (what a plant is
claimed and recorded to be), **genotype** (its actual, verifiable genetic makeup), and
**phenotype** (how it expresses under a specific environment). A cultivar *name* is a claim
about identity, not proof of genotype, and a phenotype observed in one room under one
set of conditions is not proof of a fixed, universal expression.

This matters concretely: genetically identical cannabis plants grown under different
conditions (e.g., indoor artificial light and media vs. outdoor natural sunlight and
living soil) have shown significantly different terpene and cannabinoid metabolomic
profiles in controlled comparison [Danziger & Bernstein 2023]. Even plants with an
identical genetic background, at the same developmental stage, in the same potting mix,
maintained the same way, can still diverge in secondary-metabolite levels
[Danziger & Bernstein 2023]. A name, a photo, or one grow's results cannot stand in for
either a genotype record or a controlled comparison.

## 3. Measure before acting

Before recording or acting on a genetics claim:

- **Identity fields, minimum:** breeder/source (or explicit `unknown`), acquisition date,
  accession identifier, seed lot or clone-batch identifier, generation, and any alias the
  material is sold or known under. `docs/knowledge-library/schemas/cultivar.schema.json`
  models this as append-only, subject-scoped records (`accession` / `batch` / `plant`) —
  never a single mutable "current truth" field that silently overwrites its own history.
- **Pathogen status:** a screening result is scoped to a sample, a method, a lab, and a
  date — never generalized to "this cultivar is clean." Hop latent viroid (HpLVd) is the
  concrete reason this matters: it is frequently **asymptomatic** in vegetative stock, can
  be present in one part of a plant and absent in another (making sampling location and
  technique material to the result), and has been shown experimentally to spread
  plant-to-plant through shared root zones in hydroponic systems and to persist in
  crushed leaf sap for up to 7 days and in dried tissue for up to 4 weeks at room
  temperature [Chen et al. 2025]. A single negative test on one leaf is not equivalent to
  "this mother is HpLVd-free."
- **Propagation method record:** which method (seed, cutting, tissue culture), from what
  parent, on what date, by what protocol version — because the method itself carries
  known risks (below), not just the outcome.

## 4. Start paths

- **Beginner (first accession):** record identity fields even when most are `unknown` —
  an honest gap outranks an invented value. Start a single traceable lineage chain before
  scaling to multiple mothers.
- **Active problem (suspected pathogen or mislabeled material):** isolate first, sample
  correctly (asymptomatic carriage is the normal case for HpLVd, not the exception
  [Chen et al. 2025]), and do not resume normal handling until a documented, dated,
  method-disclosed result clears the material — see P6 for the full quarantine protocol
  this pillar hands off to.
- **Optimization (running a pheno hunt):** define your traits and scoring criteria *before*
  planting, not after seeing which plants look best — see §6 pheno-hunt design.
- **Commercial-SOP (propagation at scale):** tissue culture buys uniformity and volume but
  is not risk-free — extended subculturing has been associated with cumulative epigenetic
  and somaclonal changes proportional to subculture count [Bathe & Bar 2024-class findings
  reported in recent micropropagation literature — see §8], so a production SOP needs a
  defined subculture-count ceiling and periodic reversion to a verified stock plant, not
  indefinite propagation from tissue culture alone.
- **Safety/professional referral:** a confirmed pathogen incident, a legal seed-certification
  question, or a lab result dispute routes to P6's biosecurity protocol and/or a qualified
  lab — this pillar records evidence, it does not adjudicate disputes.

## 5. Failure modes

- **Treating a cultivar name as a genotype guarantee.** Two lots sold under the same name
  can differ; the name is a claim, not a certificate.
- **Treating one grow's phenotype as the cultivar's fixed behavior.** Genotype × environment
  interaction is well documented for cannabis chemotype specifically, not just crops
  generally [Danziger & Bernstein 2023].
- **Treating a negative pathogen test as permanent status.** Point-in-time, method- and
  sample-scoped, full stop.
- **Confusing propagation-method risk with plant health.** A cutting or tissue-culture
  plant that looks vigorous can still carry a symptomless pathogen or an accumulating
  somaclonal change; visual inspection is not a substitute for tested, dated status.
- **Selecting "winners" from an unreplicated, unrandomized pheno hunt and calling the
  result a trait.** Standard plant-breeding trial methodology treats randomization,
  replication, and blocking as the baseline defense against exactly this bias — position
  effects, environmental gradients across a room, and observer expectation all confound an
  informal "walk the room and pick the best one" selection [general plant-breeding trial
  design literature, see §8].
- **Losing backward/forward traceability.** If a mother's batch record breaks, a pathogen
  or quality problem downstream cannot be traced to its source or contained to its actual
  scope — it gets treated as roomwide when it may not be, or missed entirely when it is.

## 6. Deep topic map

Full L1→L2→L3 breakdown lives in `pillar-pages.md`'s P7 section (already authored,
governance artifact — not reproduced here to avoid two sources of truth). Summary of the
eight L1 collections and why each matters:

1. **Provenance and identity** — the accession schema itself; what "unknown" is allowed to
   mean and why explicit unknowns beat invented values.
2. **Lineage and propagation chain** — the mother → batch → plant graph; why a broken link
   is a containment failure, not just a bookkeeping gap.
3. **Propagation methods** — seed, cutting, tissue culture, each with distinct risk
   profiles (see §4 commercial-SOP path and §8 sources).
4. **Health status and quarantine** — hands off directly to P6's biosecurity protocol;
   this pillar owns the *recordkeeping* (test/method/date/result), P6 owns the *physical*
   quarantine procedure.
5. **Phenotype evidence** — trait definition, measurement method, environment/context —
   the discipline that keeps an observation from becoming an overclaim.
6. **Pheno-hunt design** — population, randomization, evaluation criteria set before
   planting, bias/confounding review.
7. **Cultivar reference** — how a named-cultivar page states claims as claims (see §9 for
   the concrete gap analysis against the 10 live cultivar pages).
8. **Preservation and disposition** — keep/cull criteria, retest cadence, retirement
   record.

## 7. Original field assets (sketched, not finished)

Per `pillar-pages.md`'s required-assets list for P7. Each needs a cultivation reviewer and
an evidence editor before it's real, not just an author's sketch:

- **Accession/provenance form** — fields: breeder/source (or `unknown`), acquisition date,
  accession ID, seed lot / clone batch ID, generation, aliases, acquisition method
  (purchased seed, clone from named source, tissue culture, unknown).
- **Lineage graph** — a simple directed diagram: mother → batch(es) → plant(s), with a
  "broken link" state that's visibly distinct from "no link needed" (e.g., a seed-grown
  plant with no clone parent).
- **Clone-batch traveler** — a per-batch record card: parent, date taken, propagation
  method, quantity, destination room(s)/plant IDs.
- **Pathogen-status timeline** — per accession/batch: test date, method, lab, sample
  location, result, and whether it supersedes or retests a prior event (append-only, per
  `cultivar.schema.json`'s `screeningEvent` shape).
- **Phenotype measurement dictionary** — for each tracked trait: definition, measurement
  method, unit (if applicable), stage at which it's assessed.
- **Pheno-hunt design worksheet** — population size, randomization/position scheme,
  evaluation windows, scoring criteria and weights, missing-data handling, blind-scoring
  note where practical.
- **Bias checklist** — position effects, observer expectation, unequal environment across
  the room, uneven starting material, small sample size.
- **Keep/cull decision ledger** — criteria applied, evidence cited, decision, date, who
  decided.

## 8. Sources and review

Claim map (author's initial pass — each row needs an evidence-editor role assignment):

| Claim | Source | Role | Applicability note |
|---|---|---|---|
| HpLVd is frequently asymptomatic; sampling location affects detection; plant-to-plant spread demonstrated via shared root zone in hydroponic systems; survival ~7 days in crushed leaf sap, ~4 weeks in dried tissue at room temperature | Chen et al., "Transmission, Spread, Longevity and Management of Hop Latent Viroid...", *Plants* (MDPI), 2025-03-06, https://www.mdpi.com/2223-7747/14/5/830 | peer_reviewed_primary | Cannabis-specific, current |
| HLVd causes stunted growth, brittle stems, yield loss; prevention = clean stock, sanitation, regular testing | Oregon State University Extension, "Hop latent viroid in hemp," EM-9570, https://extension.oregonstate.edu/catalog/em-9570-hop-latent-viroid-hemp | method_or_technical_manual | Hemp-focused; applicability to cannabis generally noted, not assumed identical |
| Genetically identical cannabis plants show significantly different terpene/cannabinoid metabolomic profiles between indoor-artificial and outdoor-natural cultivation conditions; identical genetic background plus identical stage/medium/care can still diverge in secondary metabolites | Danziger, N. & Bernstein, N., "Comparison of the Cannabinoid and Terpene Profiles in Commercial Cannabis from Natural and Artificial Cultivation," *Molecules* (MDPI) 28(2):833, 2023, https://www.mdpi.com/1420-3049/28/2/833 | peer_reviewed_primary | Cannabis-specific, directly supports the genotype≠phenotype claim |
| Rooting hormone (IBA gel) outperforms willow-extract for cannabis cuttings; 3+ fully expanded leaves and stem wounding improve rooting; removing leaf tips reduces success rate | Caplan, D. et al., "Vegetative propagation of cannabis by stem cuttings: effects of leaf number, cutting position, rooting hormone, and leaf tip removal," *Canadian Journal of Plant Science*, 2018, https://cdnsciencepub.com/doi/10.1139/cjps-2018-0038 | peer_reviewed_primary | Cannabis-specific propagation method evidence |
| Somaclonal/epigenetic changes in tissue-cultured cannabis accumulate proportionally with subculture count | PMC11279941, "Somatic Mutation Accumulations in Micropropagated Cannabis Are Proportional to the Number of Subcultures," https://pmc.ncbi.nlm.nih.gov/articles/PMC11279941/ | peer_reviewed_primary | Directly supports the commercial-SOP tissue-culture caution in §4 |
| Media composition and explant type materially affect cannabis tissue-culture outcomes | PMC11434680, "Importance of Media Composition and Explant Type in Cannabis sativa Tissue Culture," https://pmc.ncbi.nlm.nih.gov/articles/PMC11434680/ | peer_reviewed_primary | Cannabis-specific |
| Randomization, replication, and blocking are the standard defenses against selection bias and environmental confounding in cultivar/breeding trials | General plant-breeding trial-design literature (e.g. PMC2147938 and related methodology papers surfaced 2026-08-13; not cannabis-specific) | peer_reviewed_primary (proxy crop) | **Proxy-crop evidence** — general agronomic trial design, not cannabis-specific. Labeled as such per README's authority order; the underlying statistical principle (randomization defeats position/observer bias) is domain-general, but this pillar should seek a cannabis-specific breeding-trial citation before publication if one exists |
| Germplasm accession/passport recordkeeping (source, collection conditions, donor, availability) is a standard practice in genetic-resource management | USDA GRIN / Genesys PGR accession passport data standard, https://www.genesys-pgr.org/documentation/basics | method_or_technical_manual (proxy domain — genebank practice, not cannabis-specific) | Supports the general recordkeeping discipline in §3/§7; not a cannabis authority |

**Missing evidence, explicit:** no source above verifies any specific commercial cultivar's
actual lineage (Sour Diesel, OG Kush, etc.) — that is deliberate; see §9. No
cannabis-specific pheno-hunt-trial-design paper was found in this pass; the plant-breeding
citation is flagged as a proxy and should be revisited by the evidence editor.

**Reviewers still needed before this can advance past `drafted`:** evidence editor
(verify the table above, check for retractions/updates), cultivation reviewer (test the
start paths and failure modes against practical field experience), qualified reviewer —
**not required for this pillar specifically** (P7 has zero R3-classified roadmap records
per the audit), product-truth reviewer (verify the §9 CTA claims against shipped
`/cultivars/*` and pheno-hunt product behavior), SEO/technical editor, copy/accessibility
editor.

## 9. Cultivar entity pages (KL-017 through KL-107) — what's real, what's not

Before writing anything for the 10 live cultivar pages, the load-bearing finding: Verdant
already has a real, sourced, appropriately-cautious dataset backing them —
`src/constants/strainReferenceLibrary.ts` ("Strain Reference Library V1," deploy branch).
Spot-checked entries (Sour Diesel, OG Kush, Blue Dream) already do the right thing:
`breeder: null` where unverified, lineage stated as "commonly reported" / "widely
disputed," confidence levels per claim, a `sourceKey` reference, and framing like "the
profile is intentionally a weak prior." This is not a gap to fill with invented lineage —
**it is existing, already-safety-conscious source material** that this pillar's cultivar
pages should point to and extend, not duplicate or override.

The real gap is structural, not content: `docs/knowledge-library/schemas/cultivar.schema.json`
expects append-only `screeningEvent` records scoped to `accession` / `batch` / `plant`
subjects, with `laboratory`, `methodId`, `sourceLinks`, and correction/retest chaining.
`strainReferenceLibrary.ts` is public marketing-style reference data (aroma, THC range,
difficulty, pheno-hunt focus areas) — it has no per-accession pathogen screening history,
and arguably **should not**, since that data is properly scoped to an individual grower's
private material, not a public "Sour Diesel" reference page shared across every grower who
might grow something sold under that name. This is an open design question for the
managing editor, not something I resolved by assumption: does the public cultivar entity
page carry a `screeningEvent` array at all, or does that schema section apply only to a
signed-in grower's own accession/batch/plant records elsewhere in the product? I did not
find that distinction stated anywhere in the four schema files or `site-map.md`.

**What I did NOT do:** write or infer lineage, breeder, or genotype claims for any of the
10 named strains beyond what `strainReferenceLibrary.ts` already states. Doing so from
training-data recall about real, currently-sold commercial cultivars is exactly the
"cultivar names and lineage are not genotype proof" failure this pillar's own high-risk
rule exists to prevent, and I'm not willing to guess at it even hedged.

**Recommended next step for the 10 cultivar pages specifically:** a schema/product mapping
pass — reconcile `strainReferenceLibrary.ts`'s existing fields against
`cultivar.schema.json`'s required fields field-by-field, decide the public/private scope
question above, and only then draft the 10 entity-page briefs. That's real work, but it's
reconciliation of two things that already exist, not new research.

## 10. Practice step

**Non-product next step (required):** start or audit one accession/lineage record using the
identity-field minimum in §3, even if most fields are `unknown`.

**Optional product CTA (needs product-truth verification, not assumed here):** browse
current cultivar profiles at `/cultivars` — only after a product-truth reviewer confirms
that route's current behavior matches this description. This page makes no cultivar claim
into a diagnosis or guaranteed outcome, per `pillar-pages.md`'s explicit rule for P7.

---

**Handoff:** this draft is ready for evidence-editor and cultivation-reviewer assignment on
a `verdant-grow-diary`-based worktree, where it can also be checked against
`scripts/knowledge/validate-schemas.mjs` once it's expressed in the roadmap record's actual
JSON shape (`brief` / `searchBrief` fields per `roadmap-500.json`'s pillar-record example).
The search-brief remains `BLOCKED` regardless of this draft's quality.
