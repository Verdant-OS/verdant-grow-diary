# Strain Reference Library V1

## Positioning

> Source-backed cultivar profiles and reported grow tendencies.  
> The library supplies a hypothesis.  
> Your plant's logs and sensors supply the truth.

The UI uses **Strain Reference Library** for grower discovery and keeps
**cultivar** as the canonical data-model term.

## V1 scope

- Canonical public routes remain `/cultivars` and `/cultivars/:slug`.
- Legacy `/strains` routes continue redirecting to the canonical surface.
- Ten labeled sample/reference profiles ship in the public bundle.
- Each profile has explicit sources, confidence, last-verified date, cautions,
  and missing-information notes.
- Complete guides are composed from a photoperiod/autoflower base template plus
  cultivar-specific overlays. Shared fundamentals are not copied ten times.
- The authenticated command palette uses one shared search model for pages,
  grows, tents, plants, and cultivar references.
- A migration establishes the read-only reference schema and future controlled
  import staging tables.

## Safety boundaries

- No cultivar profile creates alerts or Action Queue rows.
- No profile changes nutrient, irrigation, environmental, or equipment targets.
- No AI-generated copy is marked reviewed or verified.
- No images are embedded, avoiding licensing ambiguity.
- Public profile data is visibly labeled sample/reference data.
- Private entity search remains owner-scoped through existing RLS-backed reads.
- Import staging tables have no anon/authenticated write grants or policies.

## Data model

The migration creates:

- `breeders`
- `cultivars`
- `cultivar_aliases`
- `cultivar_sources`
- `cultivar_claims`
- `cultivar_guide_templates`
- `cultivar_guides`
- `cultivar_guide_sections`
- `cultivar_guide_section_sources`
- `cultivar_import_batches`
- `cultivar_import_rows`

Published reference tables are select-only for `anon` and `authenticated`.
Editorial/import writes remain a future server/admin workflow.

## Search foundation

`src/lib/globalSearchItems.ts` is the shared search model. It combines:

1. static application destinations;
2. owner-scoped grows, tents, and plants;
3. public cultivar names, aliases, breeder, and lineage.

The palette does not infer or auto-link `plants.strain` to a cultivar record.
Exact-name and alias results navigate to the existing entity or reference route.

## Automated Source Verification V0

V0 verifies **provenance hygiene**, not the scientific truth of a reported range,
terpene order, chemotype, or cultivation tendency.

The offline structural layer checks:

- unique source keys and required citation fields;
- HTTPS-only source URLs and known source-type values;
- non-empty citation/license boundaries;
- parseable retrieval timestamps;
- resolution of every profile, terpene-claim, and cannabinoid-claim source key;
- a machine-readable source-classification mix.

Run the CI-safe structural contract and report with:

```bash
bunx vitest run src/test/strain-reference-library-source-verification.test.ts
bun scripts/verify-cultivar-sources.mjs
```

Optional network reachability is explicit and rate-limited:

```bash
bun scripts/verify-cultivar-sources.mjs --network
bun scripts/verify-cultivar-sources.mjs --network --strict-network
```

The CLI writes `artifacts/source-verification/report.json`. Community-profile
reachability remains advisory. Strict network mode may fail only when a critical
scholarly, PubMed, laboratory, horticultural-reference, or breeder source is
unreachable.

Automated verification never:

- changes claim values or ranges;
- changes confidence;
- changes `verificationStatus` or `lastVerifiedAt`;
- promotes sample/community evidence to reviewed or verified;
- replaces human editorial review.

## Offline research enrichment boundaries

Research enrichment is **offline only**. Neither chemistry nor genetics datasets
are runtime dependencies, identity authorities, or automatic publication paths.
All generated material remains a draft until a human reviewer approves the
specific source, matching method, context, and wording.

### Public COA chemistry aggregates

Cannlytics chemistry datasets distributed through Hugging Face may support
human-reviewed draft context under their **CC BY 4.0** license. Any retained
aggregate must include attribution, a license reference, and a note describing
Verdant's transformations.

Minimum acceptance rules:

- normalized exact-name or approved-alias matching only;
- flower/bud products preferred;
- at least 30 matching observations before proposing a numeric range;
- observed quantiles or clearly labeled ranges, never a mean presented as a
  universal “typical” value;
- method mix, state mix, sample count, and date range retained in `sampleScope`;
- non-random-public-subset and cleaning limitations retained in the variability
  note;
- confidence capped at community or medium pending human review;
- no use of personal/contact fields;
- no invention of values for intentionally missing V1 fields.

A public aggregate is not the grower's batch, a genotype result, or one fixed
cultivar signature. It must never auto-link to free-text `plants.strain`, change
`verificationStatus`, remove missing-information notes, or generate medical or
effect claims.

### Genetics and pedigree resources

Open reference genomes, marker papers, NCBI, CannabisGDB, and CannSeek may
strengthen method context and cautious chemotype priors. A specific public
accession report may be cited after human review. Pedigree catalogs may support
directional lineage text at community confidence.

These resources are **not genotype proof for a commercial name**. Verdant must
never:

- claim that a name match DNA-verifies a cultivar;
- assign `plants.cultivar_id` or a genotype from a label;
- bulk-scrape sources behind login or terms-of-service restrictions;
- treat breeder-reported pedigree as measured ancestry;
- auto-publish a grower-uploaded genotype report to the public library.

The plant's observed phenotype, private timeline, and source-labeled sensor
history remain authoritative for the run in front of the grower.

## Database cutover gate

The bundled V1 profiles are richer than the current normalized SQL seed in some
areas. Public pages must not switch to database reads until a parity check proves
that the deployed read model preserves the approved profiles, source links,
claims, guide sections, cautions, and missing-information states.

Until that gate is green:

- bundled sample/reference profiles remain the public presenter source;
- the migration remains unapplied to production;
- no “database-backed public reads” or “shipped” claim is allowed.

## Deferred work

- Production database seed/cutover after content-parity verification.
- Admin-only draft/review/publish UI.
- CSV import execution after preview, checksum, duplicate, and moderation gates.
- Optional nullable `plants.cultivar_id` linking.
- AI-assisted draft generation with mandatory human review.
- AI Doctor reference-context use after precedence tests prove plant history wins.
