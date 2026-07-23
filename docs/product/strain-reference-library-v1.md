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

## Deferred work

- Production database seed/cutover from static public profiles.
- Admin-only draft/review/publish UI.
- CSV import execution after preview, checksum, duplicate, and moderation gates.
- Optional nullable `plants.cultivar_id` linking.
- AI-assisted draft generation with mandatory human review.
- AI Doctor reference-context use after precedence tests prove plant history wins.
