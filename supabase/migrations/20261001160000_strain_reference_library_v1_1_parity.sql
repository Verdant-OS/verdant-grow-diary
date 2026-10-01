-- Strain Reference Library V1.1 — database content parity supplement (issue #419).
--
-- Brings the normalized reference tables to exact parity with the approved
-- bundled V1 profiles (PR #418) so the public /cultivars pages can later read
-- them behind a default-off release flag. NOT applied to production by the PR
-- that adds it; application follows the reviewed deployment plan in
-- docs/product/strain-reference-library-v1-1-db-cutover.md.
--
-- Schema supplement (smallest additive set the parity audit proved missing):
--   * cultivars.flowering_window_label  — the published flower-window wording;
--   * cultivars.pheno_hunt_focus        — pheno-hunt focus list on the public page;
--   * cultivars.sample_phenos           — illustrative sample-reference phenos;
--   * cultivar_aliases.sort_order       — deterministic alias display order;
--   * cultivar_profile_sources          — profile-level source join (published-only RLS).
--
-- Content: one dollar-quoted JSON payload, generated from the bundled library
-- by src/lib/cultivarDatabaseSeedPayloadRules.ts and normalized below into the
-- existing source, claim, guide, section and section-source tables, which stay
-- authoritative. The payload is a transport, not a stored blob.
--
-- Safety boundaries:
--   * no plants/grows/tents/sensor_readings/alerts/action_queue/AI tables are touched;
--   * anon/authenticated receive SELECT only; no client write grants or policies;
--   * no SECURITY DEFINER function is created;
--   * idempotent: every write is an upsert on a natural or stable key, so a
--     re-run converges on the same rows;
--   * nothing here raises: a missing dependency leaves a row unlinked, which
--     the strict parity receipt reports as `blocked` instead of aborting replay.

-- ---------------------------------------------------------------------------
-- 1. Schema supplement
-- ---------------------------------------------------------------------------

alter table public.cultivars
  add column if not exists flowering_window_label text;
alter table public.cultivars
  add column if not exists pheno_hunt_focus text[] not null default '{}';
alter table public.cultivars
  add column if not exists sample_phenos jsonb not null default '[]'::jsonb;
alter table public.cultivars
  drop constraint if exists cultivars_sample_phenos_is_array;
alter table public.cultivars
  add constraint cultivars_sample_phenos_is_array
  check (jsonb_typeof(sample_phenos) = 'array');

alter table public.cultivar_aliases
  add column if not exists sort_order integer;
alter table public.cultivar_aliases
  drop constraint if exists cultivar_aliases_sort_order_nonnegative;
alter table public.cultivar_aliases
  add constraint cultivar_aliases_sort_order_nonnegative
  check (sort_order is null or sort_order >= 0);

create table if not exists public.cultivar_profile_sources (
  cultivar_id uuid not null references public.cultivars(id) on delete cascade,
  source_id uuid not null references public.cultivar_sources(id) on delete restrict,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (cultivar_id, source_id)
);

create index if not exists cultivar_profile_sources_order_idx
  on public.cultivar_profile_sources (cultivar_id, sort_order);
create index if not exists cultivar_profile_sources_source_idx
  on public.cultivar_profile_sources (source_id);

alter table public.cultivar_profile_sources enable row level security;
revoke all on public.cultivar_profile_sources from public, anon, authenticated;

drop policy if exists "public can read sources of published cultivars"
  on public.cultivar_profile_sources;
create policy "public can read sources of published cultivars"
  on public.cultivar_profile_sources for select to anon, authenticated
  using (exists (
    select 1 from public.cultivars c
    where c.id = cultivar_profile_sources.cultivar_id
      and c.publication_status = 'published'
  ));

-- Explicit SELECT-only client grant, matching the V1 reference tables.
grant select on public.cultivar_profile_sources to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Content parity
-- ---------------------------------------------------------------------------

do $verdant_cultivar_parity$
declare
  payload constant jsonb := $verdant_cultivar_payload$
{
  "payload_version": 1,
  "sources": [
    {
      "id": "51000000-0000-4000-8000-000000000001",
      "source_key": "watts-2021-terpene-genetics",
      "title": "Cannabis labelling is associated with genetic variation in terpene synthase genes",
      "publisher": "Nature Plants",
      "url": "https://www.nature.com/articles/s41477-021-01003-y",
      "source_type": "horticultural_reference",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Citation and high-level paraphrase only; no article text is reproduced."
    },
    {
      "id": "51000000-0000-4000-8000-000000000002",
      "source_key": "cannabinoid-method-context-2019",
      "title": "Analytical considerations for cannabinoid measurement in cannabis",
      "publisher": "PubMed-indexed literature",
      "url": "https://pubmed.ncbi.nlm.nih.gov/31849137/",
      "source_type": "laboratory",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Citation and method context only; no publication text is reproduced."
    },
    {
      "id": "51000000-0000-4000-8000-000000000003",
      "source_key": "cannabinoid-spatial-variability-2025",
      "title": "Cannabinoid variability across cannabis plant material",
      "publisher": "PubMed-indexed literature",
      "url": "https://pubmed.ncbi.nlm.nih.gov/40651988/",
      "source_type": "laboratory",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Citation and variability context only; no publication text is reproduced."
    },
    {
      "id": "51000000-0000-4000-8000-000000000004",
      "source_key": "chemotype-genomics-2021",
      "title": "Cannabinoid oxidocyclase copy number and chemotype variation",
      "publisher": "Genome Biology and Evolution",
      "url": "https://academic.oup.com/gbe/article/13/8/evab130/6294932",
      "source_type": "horticultural_reference",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Citation and high-level genetic context only; no publication text is reproduced."
    },
    {
      "id": "51000000-0000-4000-8000-000000000101",
      "source_key": "sour-diesel-public-profile",
      "title": "Sour Diesel cultivar information",
      "publisher": "Leafly",
      "url": "https://www.leafly.com/strains/sour-diesel",
      "source_type": "community",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Directional public source; Verdant copy is original and cautious."
    },
    {
      "id": "51000000-0000-4000-8000-000000000102",
      "source_key": "og-kush-public-profile",
      "title": "OG Kush cultivar information",
      "publisher": "Leafly",
      "url": "https://www.leafly.com/strains/og-kush",
      "source_type": "community",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Directional public source; Verdant copy is original and cautious."
    },
    {
      "id": "51000000-0000-4000-8000-000000000103",
      "source_key": "blue-dream-public-profile",
      "title": "Blue Dream cultivar information",
      "publisher": "Leafly",
      "url": "https://www.leafly.com/strains/blue-dream",
      "source_type": "community",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Directional public source; Verdant copy is original and cautious."
    },
    {
      "id": "51000000-0000-4000-8000-000000000104",
      "source_key": "gg4-public-profile",
      "title": "Original Glue cultivar information",
      "publisher": "Leafly",
      "url": "https://www.leafly.com/strains/original-glue",
      "source_type": "community",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Directional public source; Verdant copy is original and cautious."
    },
    {
      "id": "51000000-0000-4000-8000-000000000105",
      "source_key": "lemon-cherry-gelato-public-profile",
      "title": "Lemon Cherry Gelato cultivar information",
      "publisher": "Leafly",
      "url": "https://www.leafly.com/strains/lemon-cherry-gelato",
      "source_type": "community",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Directional public source; Verdant copy is original and cautious."
    },
    {
      "id": "51000000-0000-4000-8000-000000000106",
      "source_key": "oreoz-public-profile",
      "title": "Oreoz cultivar information",
      "publisher": "Leafly",
      "url": "https://www.leafly.com/strains/oreoz",
      "source_type": "community",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Directional public source; Verdant copy is original and cautious."
    },
    {
      "id": "51000000-0000-4000-8000-000000000107",
      "source_key": "do-si-dos-public-profile",
      "title": "Do-Si-Dos cultivar information",
      "publisher": "Leafly",
      "url": "https://www.leafly.com/strains/do-si-dos",
      "source_type": "community",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Directional public source; Verdant copy is original and cautious."
    },
    {
      "id": "51000000-0000-4000-8000-000000000108",
      "source_key": "blue-cookies-public-profile",
      "title": "Blue Cookies cultivar information",
      "publisher": "Leafly",
      "url": "https://www.leafly.com/strains/blue-cookies",
      "source_type": "community",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Directional public source; Verdant copy is original and cautious."
    },
    {
      "id": "51000000-0000-4000-8000-000000000109",
      "source_key": "jack-herer-public-profile",
      "title": "Jack Herer cultivar information",
      "publisher": "Leafly",
      "url": "https://www.leafly.com/strains/jack-herer",
      "source_type": "community",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Directional public source; Verdant copy is original and cautious."
    },
    {
      "id": "51000000-0000-4000-8000-000000000110",
      "source_key": "sour-stomper-product-info",
      "title": "Sour Stomper product information",
      "publisher": "Mephisto Genetics",
      "url": "https://eu.mephistogenetics.com/products/sour-stomper",
      "source_type": "breeder",
      "retrieved_at": "2026-07-22T00:00:00.000Z",
      "license_or_usage_notes": "Used for breeder-reported identity and timing context; copy is not reproduced."
    }
  ],
  "breeders": [
    {
      "name": "3rd Coast Genetics",
      "normalized_name": "3rd coast genetics",
      "slug": "3rd-coast-genetics"
    },
    {
      "name": "Archive Seed Bank",
      "normalized_name": "archive seed bank",
      "slug": "archive-seed-bank"
    },
    {
      "name": "GG Strains LLC",
      "normalized_name": "gg strains llc",
      "slug": "gg-strains-llc"
    },
    {
      "name": "Mephisto Genetics",
      "normalized_name": "mephisto genetics",
      "slug": "mephisto-genetics"
    },
    {
      "name": "Sensi Seeds",
      "normalized_name": "sensi seeds",
      "slug": "sensi-seeds"
    }
  ],
  "cultivars": [
    {
      "id": "54000000-0000-4000-8000-000000000001",
      "slug": "sour-diesel",
      "canonical_name": "Sour Diesel",
      "normalized_name": "sour diesel",
      "breeder_normalized_name": null,
      "life_cycle": "photoperiod",
      "seed_expression": "unknown",
      "market_classification": "sativa",
      "lineage_text": "Commonly reported as Chemdog-family genetics; exact origin remains disputed",
      "description": "A sample reference for the widely circulated Sour Diesel name. Public reports often emphasize vigorous stretch and fuel, citrus, and pine aroma direction, while release and phenotype identity can differ substantially.",
      "difficulty": "advanced",
      "height_category": "tall",
      "chemotype": "type_i",
      "flowering_days_min": 77,
      "flowering_days_max": 84,
      "flowering_window_label": "11–12 weeks reported",
      "stretch_min": 1.8,
      "stretch_max": 3,
      "yield_indoor_g_per_m2_min": null,
      "yield_indoor_g_per_m2_max": null,
      "thc_pct_min": 20,
      "thc_pct_max": 26,
      "cbd_pct_min": null,
      "cbd_pct_max": null,
      "dominant_terpenes": [
        "myrcene",
        "limonene",
        "beta-caryophyllene"
      ],
      "pheno_hunt_focus": [
        "Stretch ratio",
        "Fuel/citrus/pine balance",
        "Finish timing",
        "Post-cure aroma retention"
      ],
      "sample_phenos": [
        {
          "label": "Sour Diesel sample A",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Fuel and citrus direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Finish must be recorded from the actual plant"
        },
        {
          "label": "Sour Diesel sample B",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Pine and herbal direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Post-cure follow-up remains required"
        }
      ],
      "publication_status": "published",
      "verification_status": "sample",
      "data_origin": "seed",
      "last_verified_at": "2026-07-22T00:00:00.000Z",
      "aliases": [
        {
          "alias": "Sour D",
          "normalized_alias": "sour d",
          "sort_order": 0,
          "source_key": "sour-diesel-public-profile"
        },
        {
          "alias": "Sour Deez",
          "normalized_alias": "sour deez",
          "sort_order": 1,
          "source_key": "sour-diesel-public-profile"
        }
      ],
      "profile_sources": [
        {
          "source_key": "sour-diesel-public-profile",
          "sort_order": 0
        },
        {
          "source_key": "watts-2021-terpene-genetics",
          "sort_order": 1
        },
        {
          "source_key": "cannabinoid-method-context-2019",
          "sort_order": 2
        },
        {
          "source_key": "cannabinoid-spatial-variability-2025",
          "sort_order": 3
        },
        {
          "source_key": "chemotype-genomics-2021",
          "sort_order": 4
        }
      ],
      "claims": [
        {
          "id": "57000000-0000-4000-8000-000000000101",
          "trait_key": "reported_thc_pct",
          "value_min": 20,
          "value_max": 26,
          "value_text": null,
          "value_jsonb": null,
          "unit": "%",
          "context": {
            "measurement_basis": "source_reported_summary",
            "analytical_method": "not_reported",
            "sample_scope": "Public cultivar profile; not one universal batch or Certificate of Analysis.",
            "variability_note": "Expression varies by phenotype, batch, sample position, environment, harvest, post-harvest handling, storage, and laboratory method."
          },
          "source_key": "sour-diesel-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000103",
          "trait_key": "chemotype",
          "value_min": null,
          "value_max": null,
          "value_text": "type_i",
          "value_jsonb": null,
          "unit": null,
          "context": {
            "classification_basis": "Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.",
            "variability_note": "Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent."
          },
          "source_key": "sour-diesel-public-profile",
          "confidence": "community",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000104",
          "trait_key": "reported_dominant_terpenes",
          "value_min": null,
          "value_max": null,
          "value_text": null,
          "value_jsonb": [
            "myrcene",
            "limonene",
            "beta-caryophyllene"
          ],
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "sour-diesel-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000101",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "myrcene",
          "value_jsonb": {
            "rank": 1,
            "aroma_descriptors": [
              "earthy",
              "herbal"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "sour-diesel-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000102",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "limonene",
          "value_jsonb": {
            "rank": 2,
            "aroma_descriptors": [
              "citrus",
              "lemon"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "sour-diesel-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000103",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "beta-caryophyllene",
          "value_jsonb": {
            "rank": 3,
            "aroma_descriptors": [
              "peppery",
              "woody"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "sour-diesel-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        }
      ],
      "guide": {
        "id": "55000000-0000-4000-8000-000000000009",
        "version": 1,
        "title": "Sour Diesel sample reference guide",
        "base_template_key": "photoperiod_general",
        "publication_status": "published",
        "confidence": "medium",
        "content_schema_version": 1,
        "last_verified_at": "2026-07-22T00:00:00.000Z",
        "published_at": "2026-07-22T00:00:00.000Z"
      },
      "sections": [
        {
          "section_key": "overview",
          "sort_order": 10,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Overview",
            "summary": "Use this profile as reference context, then verify every tendency against the plant in front of you.",
            "reported_tendencies": [
              {
                "text": "Fuel, citrus, and pine direction is commonly reported.",
                "confidence": "medium",
                "evidence_keys": [
                  "sour-diesel-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Start with the actual stage, medium, pot size, logs, photos, and source-labeled sensor history.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not convert a named-cultivar profile into a universal recipe."
            ],
            "missing_information": [
              "Breeder release, phenotype, and batch identity may be incomplete or disputed.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "sour-diesel-public-profile",
              "support_note": "Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "germination",
          "sort_order": 20,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Germination",
            "summary": "Germination fundamentals are shared and are not a reliable cultivar-selection signal.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Keep moisture and temperature stable and minimize handling once the seed is placed.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not infer vigor or final quality from germination speed alone."
            ],
            "missing_information": [
              "Cultivar-specific germination evidence is usually limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "early_growth",
          "sort_order": 30,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Early growth",
            "summary": "Evaluate early growth through stability, root-zone correctness, and observation.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record emergence, leaf development, watering, and deviations before changing inputs.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid chasing small early differences with heavy feeding or stress."
            ],
            "missing_information": [
              "Reliable cultivar-specific early-growth trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "vegetative",
          "sort_order": 40,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Vegetative growth",
            "summary": "Vegetative structure can vary among phenotypes carrying the same commercial name.",
            "reported_tendencies": [
              {
                "text": "Many reports describe vigorous vertical growth and longer internodes.",
                "confidence": "medium",
                "evidence_keys": [
                  "sour-diesel-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Log internode spacing, branching, vigor, and recovery from low-risk handling.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not assume market classification predicts structure or nutrient demand."
            ],
            "missing_information": [
              "Matched-environment replication is usually missing.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "sour-diesel-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "flowering",
          "sort_order": 50,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Flowering",
            "summary": "Reported timing is directional and should be checked against observed maturity.",
            "reported_tendencies": [
              {
                "text": "A longer directional flower window makes stage observation more useful than a fixed calendar.",
                "confidence": "medium",
                "evidence_keys": [
                  "sour-diesel-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Track first flower, stretch, resin, aroma, and finish cues in the timeline.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not harvest on a catalog day number alone."
            ],
            "missing_information": [
              "Sources may not define flowering day one or maturity criteria.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "sour-diesel-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "environment",
          "sort_order": 60,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Environment",
            "summary": "Environmental stability matters more than a copied cultivar-name target.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Derive VPD only from validated temperature and humidity, then compare it with stage and response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Never present stale, invalid, demo, or mis-unit telemetry as healthy."
            ],
            "missing_information": [
              "Controlled cultivar response curves are rarely available."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "watering",
          "sort_order": 70,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Watering",
            "summary": "Watering depends on medium, root mass, container, environment, and dryback.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log volume, timing, substrate response, and plant response before changing cadence.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not use uncalibrated soil-moisture percentages as absolute instructions."
            ],
            "missing_information": [
              "Cultivar-specific root-zone calibration is generally unavailable."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "nutrition",
          "sort_order": 80,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Nutrition",
            "summary": "Feeding descriptions are weak evidence without medium, water, EC, and response context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Begin moderately and adjust from measured input and plant response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not copy an exact nutrient dose from a reference profile."
            ],
            "missing_information": [
              "Comparable nutrient-response trials are usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "training",
          "sort_order": 90,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Training",
            "summary": "Training response depends on vigor, health, timing, phenotype, and lifecycle.",
            "reported_tendencies": [
              {
                "text": "Early low-stress canopy planning may help manage stretch when the plant is healthy.",
                "confidence": "medium",
                "evidence_keys": [
                  "sour-diesel-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Use low-stress structure management and record recovery before increasing intensity.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid high-stress work when health or environmental stability is uncertain."
            ],
            "missing_information": [
              "Controlled cultivar-specific training trials are limited.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "sour-diesel-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "common_issues",
          "sort_order": 100,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Common issues",
            "summary": "Issue lists are hypotheses; symptoms still require plant and environment context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Document symptoms, recent actions, photos, root-zone context, and telemetry.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not diagnose a deficiency or prescribe feed from cultivar identity alone."
            ],
            "missing_information": [
              "Frequency and causal evidence for cultivar-specific problems is limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "harvest",
          "sort_order": 110,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Harvest",
            "summary": "Harvest timing should reflect observed maturity and intended use.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record trichomes, aroma, fade, irrigation history, and the harvest rationale.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not treat reported potency or flowering time as a guaranteed endpoint."
            ],
            "missing_information": [
              "Sources may not define sample position or maturity criteria."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "post_harvest",
          "sort_order": 120,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Post-harvest",
            "summary": "Drying, curing, and storage can change aroma retention and measured chemistry.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record dry conditions, duration, cure observations, and final quality notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not close a keeper decision before post-cure evidence exists."
            ],
            "missing_information": [
              "Comparable post-harvest protocols and laboratory methods are often absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "pheno_tips",
          "sort_order": 130,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Pheno tips",
            "summary": "Named cultivars can express different structure, aroma, chemistry, and finish.",
            "reported_tendencies": [
              {
                "text": "Compare fuel, citrus, and pine expression separately rather than treating the name as one fixed profile.",
                "confidence": "medium",
                "evidence_keys": [
                  "sour-diesel-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "A single attractive specimen is not proof of stability."
            ],
            "missing_information": [
              "Replication count and environment matching may be unknown.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "sour-diesel-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "missing_information",
          "sort_order": 140,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Missing information",
            "summary": "Uncertainty stays visible so a thin record never reads like certainty.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use missing-information notes to decide what to observe, measure, photograph, or source next.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not fill missing evidence with invented values or AI-generated certainty."
            ],
            "missing_information": [
              "Batch COAs, methods, phenotype identity, and matched trials are commonly absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        }
      ]
    },
    {
      "id": "54000000-0000-4000-8000-000000000002",
      "slug": "og-kush",
      "canonical_name": "OG Kush",
      "normalized_name": "og kush",
      "breeder_normalized_name": null,
      "life_cycle": "photoperiod",
      "seed_expression": "unknown",
      "market_classification": "hybrid",
      "lineage_text": "Widely disputed; commonly associated with Chemdog, Hindu Kush, and regional OG lines",
      "description": "OG Kush is a broad commercial name with multiple cuts and seed-line interpretations. Earthy, pine, and fuel reports are useful discovery context, not proof of one fixed genotype or chemistry.",
      "difficulty": "intermediate",
      "height_category": "medium",
      "chemotype": "type_i",
      "flowering_days_min": 49,
      "flowering_days_max": 56,
      "flowering_window_label": "7–8 weeks reported",
      "stretch_min": 1.4,
      "stretch_max": 2.2,
      "yield_indoor_g_per_m2_min": null,
      "yield_indoor_g_per_m2_max": null,
      "thc_pct_min": 18,
      "thc_pct_max": 26,
      "cbd_pct_min": null,
      "cbd_pct_max": null,
      "dominant_terpenes": [
        "myrcene",
        "limonene",
        "beta-caryophyllene"
      ],
      "pheno_hunt_focus": [
        "Cut/breeder identity",
        "Pine/fuel aroma",
        "Branch support",
        "Post-cure consistency"
      ],
      "sample_phenos": [
        {
          "label": "OG Kush sample A",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Earthy pine and fuel direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Finish must be recorded from the actual plant"
        },
        {
          "label": "OG Kush sample B",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Citrus and woody direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Post-cure follow-up remains required"
        }
      ],
      "publication_status": "published",
      "verification_status": "sample",
      "data_origin": "seed",
      "last_verified_at": "2026-07-22T00:00:00.000Z",
      "aliases": [
        {
          "alias": "OG",
          "normalized_alias": "og",
          "sort_order": 0,
          "source_key": "og-kush-public-profile"
        },
        {
          "alias": "Original Gangster Kush",
          "normalized_alias": "original gangster kush",
          "sort_order": 1,
          "source_key": "og-kush-public-profile"
        }
      ],
      "profile_sources": [
        {
          "source_key": "og-kush-public-profile",
          "sort_order": 0
        },
        {
          "source_key": "watts-2021-terpene-genetics",
          "sort_order": 1
        },
        {
          "source_key": "cannabinoid-method-context-2019",
          "sort_order": 2
        },
        {
          "source_key": "cannabinoid-spatial-variability-2025",
          "sort_order": 3
        },
        {
          "source_key": "chemotype-genomics-2021",
          "sort_order": 4
        }
      ],
      "claims": [
        {
          "id": "57000000-0000-4000-8000-000000000201",
          "trait_key": "reported_thc_pct",
          "value_min": 18,
          "value_max": 26,
          "value_text": null,
          "value_jsonb": null,
          "unit": "%",
          "context": {
            "measurement_basis": "source_reported_summary",
            "analytical_method": "not_reported",
            "sample_scope": "Public cultivar profile; not one universal batch or Certificate of Analysis.",
            "variability_note": "Expression varies by phenotype, batch, sample position, environment, harvest, post-harvest handling, storage, and laboratory method."
          },
          "source_key": "og-kush-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000203",
          "trait_key": "chemotype",
          "value_min": null,
          "value_max": null,
          "value_text": "type_i",
          "value_jsonb": null,
          "unit": null,
          "context": {
            "classification_basis": "Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.",
            "variability_note": "Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent."
          },
          "source_key": "og-kush-public-profile",
          "confidence": "community",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000204",
          "trait_key": "reported_dominant_terpenes",
          "value_min": null,
          "value_max": null,
          "value_text": null,
          "value_jsonb": [
            "myrcene",
            "limonene",
            "beta-caryophyllene"
          ],
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "og-kush-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000201",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "myrcene",
          "value_jsonb": {
            "rank": 1,
            "aroma_descriptors": [
              "earthy",
              "herbal"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "og-kush-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000202",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "limonene",
          "value_jsonb": {
            "rank": 2,
            "aroma_descriptors": [
              "citrus"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "og-kush-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000203",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "beta-caryophyllene",
          "value_jsonb": {
            "rank": 3,
            "aroma_descriptors": [
              "peppery",
              "woody"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "og-kush-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        }
      ],
      "guide": {
        "id": "55000000-0000-4000-8000-000000000007",
        "version": 1,
        "title": "OG Kush sample reference guide",
        "base_template_key": "photoperiod_general",
        "publication_status": "published",
        "confidence": "medium",
        "content_schema_version": 1,
        "last_verified_at": "2026-07-22T00:00:00.000Z",
        "published_at": "2026-07-22T00:00:00.000Z"
      },
      "sections": [
        {
          "section_key": "overview",
          "sort_order": 10,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Overview",
            "summary": "Use this profile as reference context, then verify every tendency against the plant in front of you.",
            "reported_tendencies": [
              {
                "text": "Earthy, pine, and fuel descriptors are commonly associated with OG Kush-labelled material.",
                "confidence": "medium",
                "evidence_keys": [
                  "og-kush-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Start with the actual stage, medium, pot size, logs, photos, and source-labeled sensor history.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not convert a named-cultivar profile into a universal recipe."
            ],
            "missing_information": [
              "Breeder release, phenotype, and batch identity may be incomplete or disputed.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "og-kush-public-profile",
              "support_note": "Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "germination",
          "sort_order": 20,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Germination",
            "summary": "Germination fundamentals are shared and are not a reliable cultivar-selection signal.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Keep moisture and temperature stable and minimize handling once the seed is placed.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not infer vigor or final quality from germination speed alone."
            ],
            "missing_information": [
              "Cultivar-specific germination evidence is usually limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "early_growth",
          "sort_order": 30,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Early growth",
            "summary": "Evaluate early growth through stability, root-zone correctness, and observation.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record emergence, leaf development, watering, and deviations before changing inputs.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid chasing small early differences with heavy feeding or stress."
            ],
            "missing_information": [
              "Reliable cultivar-specific early-growth trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "vegetative",
          "sort_order": 40,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Vegetative growth",
            "summary": "Vegetative structure can vary among phenotypes carrying the same commercial name.",
            "reported_tendencies": [
              {
                "text": "Structure can vary markedly among cuts and seed-line interpretations.",
                "confidence": "medium",
                "evidence_keys": [
                  "og-kush-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Log internode spacing, branching, vigor, and recovery from low-risk handling.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not assume market classification predicts structure or nutrient demand."
            ],
            "missing_information": [
              "Matched-environment replication is usually missing.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "og-kush-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "flowering",
          "sort_order": 50,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Flowering",
            "summary": "Reported timing is directional and should be checked against observed maturity.",
            "reported_tendencies": [
              {
                "text": "Maturity checks should lead rather than a fixed short finish claim.",
                "confidence": "medium",
                "evidence_keys": [
                  "og-kush-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Track first flower, stretch, resin, aroma, and finish cues in the timeline.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not harvest on a catalog day number alone."
            ],
            "missing_information": [
              "Sources may not define flowering day one or maturity criteria.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "og-kush-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "environment",
          "sort_order": 60,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Environment",
            "summary": "Environmental stability matters more than a copied cultivar-name target.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Derive VPD only from validated temperature and humidity, then compare it with stage and response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Never present stale, invalid, demo, or mis-unit telemetry as healthy."
            ],
            "missing_information": [
              "Controlled cultivar response curves are rarely available."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "watering",
          "sort_order": 70,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Watering",
            "summary": "Watering depends on medium, root mass, container, environment, and dryback.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log volume, timing, substrate response, and plant response before changing cadence.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not use uncalibrated soil-moisture percentages as absolute instructions."
            ],
            "missing_information": [
              "Cultivar-specific root-zone calibration is generally unavailable."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "nutrition",
          "sort_order": 80,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Nutrition",
            "summary": "Feeding descriptions are weak evidence without medium, water, EC, and response context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Begin moderately and adjust from measured input and plant response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not copy an exact nutrient dose from a reference profile."
            ],
            "missing_information": [
              "Comparable nutrient-response trials are usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "training",
          "sort_order": 90,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Training",
            "summary": "Training response depends on vigor, health, timing, phenotype, and lifecycle.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use low-stress structure management and record recovery before increasing intensity.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid high-stress work when health or environmental stability is uncertain."
            ],
            "missing_information": [
              "Controlled cultivar-specific training trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "common_issues",
          "sort_order": 100,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Common issues",
            "summary": "Issue lists are hypotheses; symptoms still require plant and environment context.",
            "reported_tendencies": [
              {
                "text": "Dense interior growth may make airflow documentation useful in some expressions.",
                "confidence": "medium",
                "evidence_keys": [
                  "og-kush-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Document symptoms, recent actions, photos, root-zone context, and telemetry.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not diagnose a deficiency or prescribe feed from cultivar identity alone."
            ],
            "missing_information": [
              "Frequency and causal evidence for cultivar-specific problems is limited.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "og-kush-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "harvest",
          "sort_order": 110,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Harvest",
            "summary": "Harvest timing should reflect observed maturity and intended use.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record trichomes, aroma, fade, irrigation history, and the harvest rationale.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not treat reported potency or flowering time as a guaranteed endpoint."
            ],
            "missing_information": [
              "Sources may not define sample position or maturity criteria."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "post_harvest",
          "sort_order": 120,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Post-harvest",
            "summary": "Drying, curing, and storage can change aroma retention and measured chemistry.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record dry conditions, duration, cure observations, and final quality notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not close a keeper decision before post-cure evidence exists."
            ],
            "missing_information": [
              "Comparable post-harvest protocols and laboratory methods are often absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "pheno_tips",
          "sort_order": 130,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Pheno tips",
            "summary": "Named cultivars can express different structure, aroma, chemistry, and finish.",
            "reported_tendencies": [
              {
                "text": "Record cut or breeder identity because the name alone is ambiguous.",
                "confidence": "medium",
                "evidence_keys": [
                  "og-kush-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "A single attractive specimen is not proof of stability."
            ],
            "missing_information": [
              "Replication count and environment matching may be unknown.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "og-kush-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "missing_information",
          "sort_order": 140,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Missing information",
            "summary": "Uncertainty stays visible so a thin record never reads like certainty.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use missing-information notes to decide what to observe, measure, photograph, or source next.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not fill missing evidence with invented values or AI-generated certainty."
            ],
            "missing_information": [
              "Batch COAs, methods, phenotype identity, and matched trials are commonly absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        }
      ]
    },
    {
      "id": "54000000-0000-4000-8000-000000000003",
      "slug": "blue-dream",
      "canonical_name": "Blue Dream",
      "normalized_name": "blue dream",
      "breeder_normalized_name": null,
      "life_cycle": "photoperiod",
      "seed_expression": "unknown",
      "market_classification": "hybrid",
      "lineage_text": "Commonly reported as Blueberry × Haze",
      "description": "Blue Dream-labelled plants are commonly associated with vigorous growth and berry, herbal, and pine aroma direction. Public chemistry and finish ranges vary, so the profile is intentionally a weak prior.",
      "difficulty": "beginner",
      "height_category": "tall",
      "chemotype": "type_i",
      "flowering_days_min": 63,
      "flowering_days_max": 70,
      "flowering_window_label": "9–10 weeks reported",
      "stretch_min": 1.6,
      "stretch_max": 2.5,
      "yield_indoor_g_per_m2_min": null,
      "yield_indoor_g_per_m2_max": null,
      "thc_pct_min": 21,
      "thc_pct_max": 24,
      "cbd_pct_min": null,
      "cbd_pct_max": null,
      "dominant_terpenes": [
        "myrcene",
        "alpha-pinene",
        "beta-caryophyllene"
      ],
      "pheno_hunt_focus": [
        "Berry/pine balance",
        "Stretch",
        "Branching",
        "Finish uniformity"
      ],
      "sample_phenos": [
        {
          "label": "Blue Dream sample A",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Berry and herbal direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Finish must be recorded from the actual plant"
        },
        {
          "label": "Blue Dream sample B",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Pine and floral direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Post-cure follow-up remains required"
        }
      ],
      "publication_status": "published",
      "verification_status": "sample",
      "data_origin": "seed",
      "last_verified_at": "2026-07-22T00:00:00.000Z",
      "aliases": [
        {
          "alias": "Blueberry Haze",
          "normalized_alias": "blueberry haze",
          "sort_order": 0,
          "source_key": "blue-dream-public-profile"
        }
      ],
      "profile_sources": [
        {
          "source_key": "blue-dream-public-profile",
          "sort_order": 0
        },
        {
          "source_key": "watts-2021-terpene-genetics",
          "sort_order": 1
        },
        {
          "source_key": "cannabinoid-method-context-2019",
          "sort_order": 2
        },
        {
          "source_key": "cannabinoid-spatial-variability-2025",
          "sort_order": 3
        },
        {
          "source_key": "chemotype-genomics-2021",
          "sort_order": 4
        }
      ],
      "claims": [
        {
          "id": "57000000-0000-4000-8000-000000000301",
          "trait_key": "reported_thc_pct",
          "value_min": 21,
          "value_max": 24,
          "value_text": null,
          "value_jsonb": null,
          "unit": "%",
          "context": {
            "measurement_basis": "source_reported_summary",
            "analytical_method": "not_reported",
            "sample_scope": "Public cultivar profile; not one universal batch or Certificate of Analysis.",
            "variability_note": "Expression varies by phenotype, batch, sample position, environment, harvest, post-harvest handling, storage, and laboratory method."
          },
          "source_key": "blue-dream-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000303",
          "trait_key": "chemotype",
          "value_min": null,
          "value_max": null,
          "value_text": "type_i",
          "value_jsonb": null,
          "unit": null,
          "context": {
            "classification_basis": "Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.",
            "variability_note": "Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent."
          },
          "source_key": "blue-dream-public-profile",
          "confidence": "community",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000304",
          "trait_key": "reported_dominant_terpenes",
          "value_min": null,
          "value_max": null,
          "value_text": null,
          "value_jsonb": [
            "myrcene",
            "alpha-pinene",
            "beta-caryophyllene"
          ],
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "blue-dream-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000301",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "myrcene",
          "value_jsonb": {
            "rank": 1,
            "aroma_descriptors": [
              "herbal",
              "earthy"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "blue-dream-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000302",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "alpha-pinene",
          "value_jsonb": {
            "rank": 2,
            "aroma_descriptors": [
              "pine",
              "resinous"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "blue-dream-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000303",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "beta-caryophyllene",
          "value_jsonb": {
            "rank": 3,
            "aroma_descriptors": [
              "peppery"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "blue-dream-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        }
      ],
      "guide": {
        "id": "55000000-0000-4000-8000-000000000002",
        "version": 1,
        "title": "Blue Dream sample reference guide",
        "base_template_key": "photoperiod_general",
        "publication_status": "published",
        "confidence": "medium",
        "content_schema_version": 1,
        "last_verified_at": "2026-07-22T00:00:00.000Z",
        "published_at": "2026-07-22T00:00:00.000Z"
      },
      "sections": [
        {
          "section_key": "overview",
          "sort_order": 10,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Overview",
            "summary": "Use this profile as reference context, then verify every tendency against the plant in front of you.",
            "reported_tendencies": [
              {
                "text": "Berry, herbal, and pine descriptors are frequently reported.",
                "confidence": "medium",
                "evidence_keys": [
                  "blue-dream-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Start with the actual stage, medium, pot size, logs, photos, and source-labeled sensor history.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not convert a named-cultivar profile into a universal recipe."
            ],
            "missing_information": [
              "Breeder release, phenotype, and batch identity may be incomplete or disputed.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "blue-dream-public-profile",
              "support_note": "Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "germination",
          "sort_order": 20,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Germination",
            "summary": "Germination fundamentals are shared and are not a reliable cultivar-selection signal.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Keep moisture and temperature stable and minimize handling once the seed is placed.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not infer vigor or final quality from germination speed alone."
            ],
            "missing_information": [
              "Cultivar-specific germination evidence is usually limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "early_growth",
          "sort_order": 30,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Early growth",
            "summary": "Evaluate early growth through stability, root-zone correctness, and observation.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record emergence, leaf development, watering, and deviations before changing inputs.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid chasing small early differences with heavy feeding or stress."
            ],
            "missing_information": [
              "Reliable cultivar-specific early-growth trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "vegetative",
          "sort_order": 40,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Vegetative growth",
            "summary": "Vegetative structure can vary among phenotypes carrying the same commercial name.",
            "reported_tendencies": [
              {
                "text": "Public grow reports often describe vigorous branching and appreciable stretch.",
                "confidence": "medium",
                "evidence_keys": [
                  "blue-dream-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Log internode spacing, branching, vigor, and recovery from low-risk handling.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not assume market classification predicts structure or nutrient demand."
            ],
            "missing_information": [
              "Matched-environment replication is usually missing.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "blue-dream-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "flowering",
          "sort_order": 50,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Flowering",
            "summary": "Reported timing is directional and should be checked against observed maturity.",
            "reported_tendencies": [
              {
                "text": "A nine-to-ten-week directional window is commonly reported.",
                "confidence": "medium",
                "evidence_keys": [
                  "blue-dream-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Track first flower, stretch, resin, aroma, and finish cues in the timeline.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not harvest on a catalog day number alone."
            ],
            "missing_information": [
              "Sources may not define flowering day one or maturity criteria.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "blue-dream-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "environment",
          "sort_order": 60,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Environment",
            "summary": "Environmental stability matters more than a copied cultivar-name target.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Derive VPD only from validated temperature and humidity, then compare it with stage and response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Never present stale, invalid, demo, or mis-unit telemetry as healthy."
            ],
            "missing_information": [
              "Controlled cultivar response curves are rarely available."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "watering",
          "sort_order": 70,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Watering",
            "summary": "Watering depends on medium, root mass, container, environment, and dryback.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log volume, timing, substrate response, and plant response before changing cadence.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not use uncalibrated soil-moisture percentages as absolute instructions."
            ],
            "missing_information": [
              "Cultivar-specific root-zone calibration is generally unavailable."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "nutrition",
          "sort_order": 80,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Nutrition",
            "summary": "Feeding descriptions are weak evidence without medium, water, EC, and response context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Begin moderately and adjust from measured input and plant response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not copy an exact nutrient dose from a reference profile."
            ],
            "missing_information": [
              "Comparable nutrient-response trials are usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "training",
          "sort_order": 90,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Training",
            "summary": "Training response depends on vigor, health, timing, phenotype, and lifecycle.",
            "reported_tendencies": [
              {
                "text": "Healthy plants may respond to early low-stress canopy organization.",
                "confidence": "medium",
                "evidence_keys": [
                  "blue-dream-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Use low-stress structure management and record recovery before increasing intensity.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid high-stress work when health or environmental stability is uncertain."
            ],
            "missing_information": [
              "Controlled cultivar-specific training trials are limited.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "blue-dream-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "common_issues",
          "sort_order": 100,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Common issues",
            "summary": "Issue lists are hypotheses; symptoms still require plant and environment context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Document symptoms, recent actions, photos, root-zone context, and telemetry.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not diagnose a deficiency or prescribe feed from cultivar identity alone."
            ],
            "missing_information": [
              "Frequency and causal evidence for cultivar-specific problems is limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "harvest",
          "sort_order": 110,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Harvest",
            "summary": "Harvest timing should reflect observed maturity and intended use.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record trichomes, aroma, fade, irrigation history, and the harvest rationale.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not treat reported potency or flowering time as a guaranteed endpoint."
            ],
            "missing_information": [
              "Sources may not define sample position or maturity criteria."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "post_harvest",
          "sort_order": 120,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Post-harvest",
            "summary": "Drying, curing, and storage can change aroma retention and measured chemistry.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record dry conditions, duration, cure observations, and final quality notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not close a keeper decision before post-cure evidence exists."
            ],
            "missing_information": [
              "Comparable post-harvest protocols and laboratory methods are often absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "pheno_tips",
          "sort_order": 130,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Pheno tips",
            "summary": "Named cultivars can express different structure, aroma, chemistry, and finish.",
            "reported_tendencies": [
              {
                "text": "Compare berry intensity, pine direction, stretch, and finish under matched conditions.",
                "confidence": "medium",
                "evidence_keys": [
                  "blue-dream-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "A single attractive specimen is not proof of stability."
            ],
            "missing_information": [
              "Replication count and environment matching may be unknown.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "blue-dream-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "missing_information",
          "sort_order": 140,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Missing information",
            "summary": "Uncertainty stays visible so a thin record never reads like certainty.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use missing-information notes to decide what to observe, measure, photograph, or source next.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not fill missing evidence with invented values or AI-generated certainty."
            ],
            "missing_information": [
              "Batch COAs, methods, phenotype identity, and matched trials are commonly absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        }
      ]
    },
    {
      "id": "54000000-0000-4000-8000-000000000004",
      "slug": "gg4",
      "canonical_name": "Original Glue (GG4)",
      "normalized_name": "original glue gg4",
      "breeder_normalized_name": "gg strains llc",
      "life_cycle": "photoperiod",
      "seed_expression": "clone_only",
      "market_classification": "hybrid",
      "lineage_text": "Chem's Sister × Sour Dubb × Chocolate Diesel",
      "description": "Original Glue, widely searched as GG4 or Gorilla Glue #4, is a clone-associated reference commonly described as vigorous, resinous, earthy, and caryophyllene-forward. A named clone does not make every sample chemically identical.",
      "difficulty": "intermediate",
      "height_category": "tall",
      "chemotype": "type_i",
      "flowering_days_min": 56,
      "flowering_days_max": 63,
      "flowering_window_label": "8–9 weeks reported",
      "stretch_min": 1.6,
      "stretch_max": 2.5,
      "yield_indoor_g_per_m2_min": null,
      "yield_indoor_g_per_m2_max": null,
      "thc_pct_min": 27,
      "thc_pct_max": 30,
      "cbd_pct_min": null,
      "cbd_pct_max": null,
      "dominant_terpenes": [
        "beta-caryophyllene",
        "myrcene",
        "limonene"
      ],
      "pheno_hunt_focus": [
        "Provenance",
        "Caryophyllene/earth aroma",
        "Resin",
        "Stem support"
      ],
      "sample_phenos": [
        {
          "label": "Original Glue (GG4) sample A",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Peppery earth and fuel direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Finish must be recorded from the actual plant"
        },
        {
          "label": "Original Glue (GG4) sample B",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Herbal citrus direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Post-cure follow-up remains required"
        }
      ],
      "publication_status": "published",
      "verification_status": "sample",
      "data_origin": "seed",
      "last_verified_at": "2026-07-22T00:00:00.000Z",
      "aliases": [
        {
          "alias": "GG4",
          "normalized_alias": "gg4",
          "sort_order": 0,
          "source_key": "gg4-public-profile"
        },
        {
          "alias": "Gorilla Glue #4",
          "normalized_alias": "gorilla glue 4",
          "sort_order": 1,
          "source_key": "gg4-public-profile"
        },
        {
          "alias": "Original Glue",
          "normalized_alias": "original glue",
          "sort_order": 2,
          "source_key": "gg4-public-profile"
        }
      ],
      "profile_sources": [
        {
          "source_key": "gg4-public-profile",
          "sort_order": 0
        },
        {
          "source_key": "watts-2021-terpene-genetics",
          "sort_order": 1
        },
        {
          "source_key": "cannabinoid-method-context-2019",
          "sort_order": 2
        },
        {
          "source_key": "cannabinoid-spatial-variability-2025",
          "sort_order": 3
        },
        {
          "source_key": "chemotype-genomics-2021",
          "sort_order": 4
        }
      ],
      "claims": [
        {
          "id": "57000000-0000-4000-8000-000000000401",
          "trait_key": "reported_thc_pct",
          "value_min": 27,
          "value_max": 30,
          "value_text": null,
          "value_jsonb": null,
          "unit": "%",
          "context": {
            "measurement_basis": "source_reported_summary",
            "analytical_method": "not_reported",
            "sample_scope": "Public cultivar profile; not one universal batch or Certificate of Analysis.",
            "variability_note": "Expression varies by phenotype, batch, sample position, environment, harvest, post-harvest handling, storage, and laboratory method."
          },
          "source_key": "gg4-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000403",
          "trait_key": "chemotype",
          "value_min": null,
          "value_max": null,
          "value_text": "type_i",
          "value_jsonb": null,
          "unit": null,
          "context": {
            "classification_basis": "Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.",
            "variability_note": "Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent."
          },
          "source_key": "gg4-public-profile",
          "confidence": "community",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000404",
          "trait_key": "reported_dominant_terpenes",
          "value_min": null,
          "value_max": null,
          "value_text": null,
          "value_jsonb": [
            "beta-caryophyllene",
            "myrcene",
            "limonene"
          ],
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "gg4-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000401",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "beta-caryophyllene",
          "value_jsonb": {
            "rank": 1,
            "aroma_descriptors": [
              "peppery",
              "spicy",
              "woody"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "gg4-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000402",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "myrcene",
          "value_jsonb": {
            "rank": 2,
            "aroma_descriptors": [
              "earthy",
              "herbal"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "gg4-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000403",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "limonene",
          "value_jsonb": {
            "rank": 3,
            "aroma_descriptors": [
              "citrus"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "gg4-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        }
      ],
      "guide": {
        "id": "55000000-0000-4000-8000-000000000004",
        "version": 1,
        "title": "Original Glue (GG4) sample reference guide",
        "base_template_key": "photoperiod_general",
        "publication_status": "published",
        "confidence": "medium",
        "content_schema_version": 1,
        "last_verified_at": "2026-07-22T00:00:00.000Z",
        "published_at": "2026-07-22T00:00:00.000Z"
      },
      "sections": [
        {
          "section_key": "overview",
          "sort_order": 10,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Overview",
            "summary": "Use this profile as reference context, then verify every tendency against the plant in front of you.",
            "reported_tendencies": [
              {
                "text": "Earthy, pungent, and peppery aroma direction is commonly reported.",
                "confidence": "medium",
                "evidence_keys": [
                  "gg4-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Start with the actual stage, medium, pot size, logs, photos, and source-labeled sensor history.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not convert a named-cultivar profile into a universal recipe."
            ],
            "missing_information": [
              "Breeder release, phenotype, and batch identity may be incomplete or disputed.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "gg4-public-profile",
              "support_note": "Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "germination",
          "sort_order": 20,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Germination",
            "summary": "Germination fundamentals are shared and are not a reliable cultivar-selection signal.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Keep moisture and temperature stable and minimize handling once the seed is placed.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not infer vigor or final quality from germination speed alone."
            ],
            "missing_information": [
              "Cultivar-specific germination evidence is usually limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "early_growth",
          "sort_order": 30,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Early growth",
            "summary": "Evaluate early growth through stability, root-zone correctness, and observation.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record emergence, leaf development, watering, and deviations before changing inputs.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid chasing small early differences with heavy feeding or stress."
            ],
            "missing_information": [
              "Reliable cultivar-specific early-growth trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "vegetative",
          "sort_order": 40,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Vegetative growth",
            "summary": "Vegetative structure can vary among phenotypes carrying the same commercial name.",
            "reported_tendencies": [
              {
                "text": "Vigorous branching and stretch are frequently described.",
                "confidence": "medium",
                "evidence_keys": [
                  "gg4-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Log internode spacing, branching, vigor, and recovery from low-risk handling.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not assume market classification predicts structure or nutrient demand."
            ],
            "missing_information": [
              "Matched-environment replication is usually missing.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "gg4-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "flowering",
          "sort_order": 50,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Flowering",
            "summary": "Reported timing is directional and should be checked against observed maturity.",
            "reported_tendencies": [
              {
                "text": "Heavy resin and branch-loading reports make support and airflow observations useful.",
                "confidence": "medium",
                "evidence_keys": [
                  "gg4-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Track first flower, stretch, resin, aroma, and finish cues in the timeline.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not harvest on a catalog day number alone."
            ],
            "missing_information": [
              "Sources may not define flowering day one or maturity criteria.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "gg4-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "environment",
          "sort_order": 60,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Environment",
            "summary": "Environmental stability matters more than a copied cultivar-name target.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Derive VPD only from validated temperature and humidity, then compare it with stage and response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Never present stale, invalid, demo, or mis-unit telemetry as healthy."
            ],
            "missing_information": [
              "Controlled cultivar response curves are rarely available."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "watering",
          "sort_order": 70,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Watering",
            "summary": "Watering depends on medium, root mass, container, environment, and dryback.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log volume, timing, substrate response, and plant response before changing cadence.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not use uncalibrated soil-moisture percentages as absolute instructions."
            ],
            "missing_information": [
              "Cultivar-specific root-zone calibration is generally unavailable."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "nutrition",
          "sort_order": 80,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Nutrition",
            "summary": "Feeding descriptions are weak evidence without medium, water, EC, and response context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Begin moderately and adjust from measured input and plant response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not copy an exact nutrient dose from a reference profile."
            ],
            "missing_information": [
              "Comparable nutrient-response trials are usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "training",
          "sort_order": 90,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Training",
            "summary": "Training response depends on vigor, health, timing, phenotype, and lifecycle.",
            "reported_tendencies": [
              {
                "text": "Early support and low-stress canopy organization may help when vigor is strong.",
                "confidence": "medium",
                "evidence_keys": [
                  "gg4-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Use low-stress structure management and record recovery before increasing intensity.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid high-stress work when health or environmental stability is uncertain."
            ],
            "missing_information": [
              "Controlled cultivar-specific training trials are limited.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "gg4-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "common_issues",
          "sort_order": 100,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Common issues",
            "summary": "Issue lists are hypotheses; symptoms still require plant and environment context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Document symptoms, recent actions, photos, root-zone context, and telemetry.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not diagnose a deficiency or prescribe feed from cultivar identity alone."
            ],
            "missing_information": [
              "Frequency and causal evidence for cultivar-specific problems is limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "harvest",
          "sort_order": 110,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Harvest",
            "summary": "Harvest timing should reflect observed maturity and intended use.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record trichomes, aroma, fade, irrigation history, and the harvest rationale.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not treat reported potency or flowering time as a guaranteed endpoint."
            ],
            "missing_information": [
              "Sources may not define sample position or maturity criteria."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "post_harvest",
          "sort_order": 120,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Post-harvest",
            "summary": "Drying, curing, and storage can change aroma retention and measured chemistry.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record dry conditions, duration, cure observations, and final quality notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not close a keeper decision before post-cure evidence exists."
            ],
            "missing_information": [
              "Comparable post-harvest protocols and laboratory methods are often absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "pheno_tips",
          "sort_order": 130,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Pheno tips",
            "summary": "Named cultivars can express different structure, aroma, chemistry, and finish.",
            "reported_tendencies": [
              {
                "text": "Verify provenance when possible because the clone-associated identity is widely imitated.",
                "confidence": "medium",
                "evidence_keys": [
                  "gg4-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "A single attractive specimen is not proof of stability."
            ],
            "missing_information": [
              "Replication count and environment matching may be unknown.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "gg4-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "missing_information",
          "sort_order": 140,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Missing information",
            "summary": "Uncertainty stays visible so a thin record never reads like certainty.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use missing-information notes to decide what to observe, measure, photograph, or source next.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not fill missing evidence with invented values or AI-generated certainty."
            ],
            "missing_information": [
              "Batch COAs, methods, phenotype identity, and matched trials are commonly absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        }
      ]
    },
    {
      "id": "54000000-0000-4000-8000-000000000005",
      "slug": "lemon-cherry-gelato",
      "canonical_name": "Lemon Cherry Gelato",
      "normalized_name": "lemon cherry gelato",
      "breeder_normalized_name": null,
      "life_cycle": "photoperiod",
      "seed_expression": "unknown",
      "market_classification": "hybrid",
      "lineage_text": "Commonly reported as Sunset Sherbet × Girl Scout Cookies, with release identity varying",
      "description": "Lemon Cherry Gelato is a modern commercial name associated with citrus, sweet fruit, and dessert aroma reports. Verdant stores lineage, potency, and terpene direction as source-specific claims rather than one official signature.",
      "difficulty": "intermediate",
      "height_category": "medium",
      "chemotype": "type_i",
      "flowering_days_min": 56,
      "flowering_days_max": 70,
      "flowering_window_label": "8–10 weeks reported",
      "stretch_min": 1.3,
      "stretch_max": 2,
      "yield_indoor_g_per_m2_min": null,
      "yield_indoor_g_per_m2_max": null,
      "thc_pct_min": 20,
      "thc_pct_max": 30,
      "cbd_pct_min": null,
      "cbd_pct_max": null,
      "dominant_terpenes": [
        "limonene",
        "beta-caryophyllene",
        "linalool"
      ],
      "pheno_hunt_focus": [
        "Citrus/cherry aroma",
        "Color without stress",
        "Resin",
        "Post-cure retention"
      ],
      "sample_phenos": [
        {
          "label": "Lemon Cherry Gelato sample A",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Citrus and cherry direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Finish must be recorded from the actual plant"
        },
        {
          "label": "Lemon Cherry Gelato sample B",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Dessert and floral direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Post-cure follow-up remains required"
        }
      ],
      "publication_status": "published",
      "verification_status": "sample",
      "data_origin": "seed",
      "last_verified_at": "2026-07-22T00:00:00.000Z",
      "aliases": [
        {
          "alias": "LCG",
          "normalized_alias": "lcg",
          "sort_order": 0,
          "source_key": "lemon-cherry-gelato-public-profile"
        }
      ],
      "profile_sources": [
        {
          "source_key": "lemon-cherry-gelato-public-profile",
          "sort_order": 0
        },
        {
          "source_key": "watts-2021-terpene-genetics",
          "sort_order": 1
        },
        {
          "source_key": "cannabinoid-method-context-2019",
          "sort_order": 2
        },
        {
          "source_key": "cannabinoid-spatial-variability-2025",
          "sort_order": 3
        },
        {
          "source_key": "chemotype-genomics-2021",
          "sort_order": 4
        }
      ],
      "claims": [
        {
          "id": "57000000-0000-4000-8000-000000000501",
          "trait_key": "reported_thc_pct",
          "value_min": 20,
          "value_max": 30,
          "value_text": null,
          "value_jsonb": null,
          "unit": "%",
          "context": {
            "measurement_basis": "source_reported_summary",
            "analytical_method": "not_reported",
            "sample_scope": "Public cultivar profile; not one universal batch or Certificate of Analysis.",
            "variability_note": "Expression varies by phenotype, batch, sample position, environment, harvest, post-harvest handling, storage, and laboratory method."
          },
          "source_key": "lemon-cherry-gelato-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000503",
          "trait_key": "chemotype",
          "value_min": null,
          "value_max": null,
          "value_text": "type_i",
          "value_jsonb": null,
          "unit": null,
          "context": {
            "classification_basis": "Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.",
            "variability_note": "Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent."
          },
          "source_key": "lemon-cherry-gelato-public-profile",
          "confidence": "community",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000504",
          "trait_key": "reported_dominant_terpenes",
          "value_min": null,
          "value_max": null,
          "value_text": null,
          "value_jsonb": [
            "limonene",
            "beta-caryophyllene",
            "linalool"
          ],
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "lemon-cherry-gelato-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000501",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "limonene",
          "value_jsonb": {
            "rank": 1,
            "aroma_descriptors": [
              "lemon",
              "citrus"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "lemon-cherry-gelato-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000502",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "beta-caryophyllene",
          "value_jsonb": {
            "rank": 2,
            "aroma_descriptors": [
              "peppery",
              "woody"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "lemon-cherry-gelato-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000503",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "linalool",
          "value_jsonb": {
            "rank": 3,
            "aroma_descriptors": [
              "floral"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "lemon-cherry-gelato-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        }
      ],
      "guide": {
        "id": "55000000-0000-4000-8000-000000000006",
        "version": 1,
        "title": "Lemon Cherry Gelato sample reference guide",
        "base_template_key": "photoperiod_general",
        "publication_status": "published",
        "confidence": "medium",
        "content_schema_version": 1,
        "last_verified_at": "2026-07-22T00:00:00.000Z",
        "published_at": "2026-07-22T00:00:00.000Z"
      },
      "sections": [
        {
          "section_key": "overview",
          "sort_order": 10,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Overview",
            "summary": "Use this profile as reference context, then verify every tendency against the plant in front of you.",
            "reported_tendencies": [
              {
                "text": "Citrus, cherry-like fruit, and dessert descriptors are commonly reported.",
                "confidence": "medium",
                "evidence_keys": [
                  "lemon-cherry-gelato-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Start with the actual stage, medium, pot size, logs, photos, and source-labeled sensor history.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not convert a named-cultivar profile into a universal recipe."
            ],
            "missing_information": [
              "Breeder release, phenotype, and batch identity may be incomplete or disputed.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "lemon-cherry-gelato-public-profile",
              "support_note": "Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "germination",
          "sort_order": 20,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Germination",
            "summary": "Germination fundamentals are shared and are not a reliable cultivar-selection signal.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Keep moisture and temperature stable and minimize handling once the seed is placed.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not infer vigor or final quality from germination speed alone."
            ],
            "missing_information": [
              "Cultivar-specific germination evidence is usually limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "early_growth",
          "sort_order": 30,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Early growth",
            "summary": "Evaluate early growth through stability, root-zone correctness, and observation.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record emergence, leaf development, watering, and deviations before changing inputs.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid chasing small early differences with heavy feeding or stress."
            ],
            "missing_information": [
              "Reliable cultivar-specific early-growth trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "vegetative",
          "sort_order": 40,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Vegetative growth",
            "summary": "Vegetative structure can vary among phenotypes carrying the same commercial name.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log internode spacing, branching, vigor, and recovery from low-risk handling.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not assume market classification predicts structure or nutrient demand."
            ],
            "missing_information": [
              "Matched-environment replication is usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "flowering",
          "sort_order": 50,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Flowering",
            "summary": "Reported timing is directional and should be checked against observed maturity.",
            "reported_tendencies": [
              {
                "text": "Color, resin, and aroma expression should be recorded independently rather than treated as guaranteed.",
                "confidence": "medium",
                "evidence_keys": [
                  "lemon-cherry-gelato-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Track first flower, stretch, resin, aroma, and finish cues in the timeline.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not harvest on a catalog day number alone."
            ],
            "missing_information": [
              "Sources may not define flowering day one or maturity criteria.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "lemon-cherry-gelato-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "environment",
          "sort_order": 60,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Environment",
            "summary": "Environmental stability matters more than a copied cultivar-name target.",
            "reported_tendencies": [
              {
                "text": "Do not chase color with environmental stress; stability remains the priority.",
                "confidence": "medium",
                "evidence_keys": [
                  "lemon-cherry-gelato-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Derive VPD only from validated temperature and humidity, then compare it with stage and response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Never present stale, invalid, demo, or mis-unit telemetry as healthy."
            ],
            "missing_information": [
              "Controlled cultivar response curves are rarely available.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "lemon-cherry-gelato-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "watering",
          "sort_order": 70,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Watering",
            "summary": "Watering depends on medium, root mass, container, environment, and dryback.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log volume, timing, substrate response, and plant response before changing cadence.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not use uncalibrated soil-moisture percentages as absolute instructions."
            ],
            "missing_information": [
              "Cultivar-specific root-zone calibration is generally unavailable."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "nutrition",
          "sort_order": 80,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Nutrition",
            "summary": "Feeding descriptions are weak evidence without medium, water, EC, and response context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Begin moderately and adjust from measured input and plant response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not copy an exact nutrient dose from a reference profile."
            ],
            "missing_information": [
              "Comparable nutrient-response trials are usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "training",
          "sort_order": 90,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Training",
            "summary": "Training response depends on vigor, health, timing, phenotype, and lifecycle.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use low-stress structure management and record recovery before increasing intensity.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid high-stress work when health or environmental stability is uncertain."
            ],
            "missing_information": [
              "Controlled cultivar-specific training trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "common_issues",
          "sort_order": 100,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Common issues",
            "summary": "Issue lists are hypotheses; symptoms still require plant and environment context.",
            "reported_tendencies": [
              {
                "text": "Dense flower reports make late-flower airflow and humidity records relevant.",
                "confidence": "medium",
                "evidence_keys": [
                  "lemon-cherry-gelato-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Document symptoms, recent actions, photos, root-zone context, and telemetry.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not diagnose a deficiency or prescribe feed from cultivar identity alone."
            ],
            "missing_information": [
              "Frequency and causal evidence for cultivar-specific problems is limited.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "lemon-cherry-gelato-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "harvest",
          "sort_order": 110,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Harvest",
            "summary": "Harvest timing should reflect observed maturity and intended use.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record trichomes, aroma, fade, irrigation history, and the harvest rationale.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not treat reported potency or flowering time as a guaranteed endpoint."
            ],
            "missing_information": [
              "Sources may not define sample position or maturity criteria."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "post_harvest",
          "sort_order": 120,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Post-harvest",
            "summary": "Drying, curing, and storage can change aroma retention and measured chemistry.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record dry conditions, duration, cure observations, and final quality notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not close a keeper decision before post-cure evidence exists."
            ],
            "missing_information": [
              "Comparable post-harvest protocols and laboratory methods are often absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "pheno_tips",
          "sort_order": 130,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Pheno tips",
            "summary": "Named cultivars can express different structure, aroma, chemistry, and finish.",
            "reported_tendencies": [
              {
                "text": "Compare citrus, fruit, dessert, structure, and post-cure retention as separate traits.",
                "confidence": "medium",
                "evidence_keys": [
                  "lemon-cherry-gelato-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "A single attractive specimen is not proof of stability."
            ],
            "missing_information": [
              "Replication count and environment matching may be unknown.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "lemon-cherry-gelato-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "missing_information",
          "sort_order": 140,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Missing information",
            "summary": "Uncertainty stays visible so a thin record never reads like certainty.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use missing-information notes to decide what to observe, measure, photograph, or source next.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not fill missing evidence with invented values or AI-generated certainty."
            ],
            "missing_information": [
              "Batch COAs, methods, phenotype identity, and matched trials are commonly absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        }
      ]
    },
    {
      "id": "54000000-0000-4000-8000-000000000006",
      "slug": "oreoz",
      "canonical_name": "Oreoz",
      "normalized_name": "oreoz",
      "breeder_normalized_name": "3rd coast genetics",
      "life_cycle": "photoperiod",
      "seed_expression": "unknown",
      "market_classification": "hybrid",
      "lineage_text": "Cookies & Cream × Secret Weapon",
      "description": "Oreoz is commonly described as compact, resin-forward, and dessert/fuel aromatic. V1 leaves unsupported timing and chemistry summaries blank rather than inventing precision.",
      "difficulty": "intermediate",
      "height_category": "short",
      "chemotype": "unknown",
      "flowering_days_min": null,
      "flowering_days_max": null,
      "flowering_window_label": "Information limited",
      "stretch_min": null,
      "stretch_max": null,
      "yield_indoor_g_per_m2_min": null,
      "yield_indoor_g_per_m2_max": null,
      "thc_pct_min": null,
      "thc_pct_max": null,
      "cbd_pct_min": null,
      "cbd_pct_max": null,
      "dominant_terpenes": [
        "beta-caryophyllene",
        "limonene",
        "myrcene"
      ],
      "pheno_hunt_focus": [
        "Structure",
        "Fuel/dessert aroma",
        "Resin",
        "Evidence completeness"
      ],
      "sample_phenos": [
        {
          "label": "Oreoz sample A",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Fuel and cookie direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Finish must be recorded from the actual plant"
        },
        {
          "label": "Oreoz sample B",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Earthy dessert direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Post-cure follow-up remains required"
        }
      ],
      "publication_status": "published",
      "verification_status": "sample",
      "data_origin": "seed",
      "last_verified_at": "2026-07-22T00:00:00.000Z",
      "aliases": [
        {
          "alias": "Oreos",
          "normalized_alias": "oreos",
          "sort_order": 0,
          "source_key": "oreoz-public-profile"
        },
        {
          "alias": "Oreo Cookies",
          "normalized_alias": "oreo cookies",
          "sort_order": 1,
          "source_key": "oreoz-public-profile"
        }
      ],
      "profile_sources": [
        {
          "source_key": "oreoz-public-profile",
          "sort_order": 0
        },
        {
          "source_key": "watts-2021-terpene-genetics",
          "sort_order": 1
        },
        {
          "source_key": "cannabinoid-method-context-2019",
          "sort_order": 2
        },
        {
          "source_key": "cannabinoid-spatial-variability-2025",
          "sort_order": 3
        },
        {
          "source_key": "chemotype-genomics-2021",
          "sort_order": 4
        }
      ],
      "claims": [
        {
          "id": "57000000-0000-4000-8000-000000000603",
          "trait_key": "chemotype",
          "value_min": null,
          "value_max": null,
          "value_text": "unknown",
          "value_jsonb": null,
          "unit": null,
          "context": {
            "classification_basis": "Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.",
            "variability_note": "Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent."
          },
          "source_key": "oreoz-public-profile",
          "confidence": "community",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000604",
          "trait_key": "reported_dominant_terpenes",
          "value_min": null,
          "value_max": null,
          "value_text": null,
          "value_jsonb": [
            "beta-caryophyllene",
            "limonene",
            "myrcene"
          ],
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "oreoz-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000601",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "beta-caryophyllene",
          "value_jsonb": {
            "rank": 1,
            "aroma_descriptors": [
              "peppery",
              "woody"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "oreoz-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000602",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "limonene",
          "value_jsonb": {
            "rank": 2,
            "aroma_descriptors": [
              "citrus"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "oreoz-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000603",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "myrcene",
          "value_jsonb": {
            "rank": 3,
            "aroma_descriptors": [
              "earthy"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "oreoz-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        }
      ],
      "guide": {
        "id": "55000000-0000-4000-8000-000000000008",
        "version": 1,
        "title": "Oreoz sample reference guide",
        "base_template_key": "photoperiod_general",
        "publication_status": "published",
        "confidence": "medium",
        "content_schema_version": 1,
        "last_verified_at": "2026-07-22T00:00:00.000Z",
        "published_at": "2026-07-22T00:00:00.000Z"
      },
      "sections": [
        {
          "section_key": "overview",
          "sort_order": 10,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Overview",
            "summary": "Use this profile as reference context, then verify every tendency against the plant in front of you.",
            "reported_tendencies": [
              {
                "text": "Dessert, earthy, and fuel descriptors are commonly reported.",
                "confidence": "medium",
                "evidence_keys": [
                  "oreoz-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Start with the actual stage, medium, pot size, logs, photos, and source-labeled sensor history.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not convert a named-cultivar profile into a universal recipe."
            ],
            "missing_information": [
              "Breeder release, phenotype, and batch identity may be incomplete or disputed.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "oreoz-public-profile",
              "support_note": "Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "germination",
          "sort_order": 20,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Germination",
            "summary": "Germination fundamentals are shared and are not a reliable cultivar-selection signal.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Keep moisture and temperature stable and minimize handling once the seed is placed.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not infer vigor or final quality from germination speed alone."
            ],
            "missing_information": [
              "Cultivar-specific germination evidence is usually limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "early_growth",
          "sort_order": 30,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Early growth",
            "summary": "Evaluate early growth through stability, root-zone correctness, and observation.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record emergence, leaf development, watering, and deviations before changing inputs.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid chasing small early differences with heavy feeding or stress."
            ],
            "missing_information": [
              "Reliable cultivar-specific early-growth trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "vegetative",
          "sort_order": 40,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Vegetative growth",
            "summary": "Vegetative structure can vary among phenotypes carrying the same commercial name.",
            "reported_tendencies": [
              {
                "text": "Compact growth and short internodes are frequently reported, but not universal.",
                "confidence": "medium",
                "evidence_keys": [
                  "oreoz-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Log internode spacing, branching, vigor, and recovery from low-risk handling.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not assume market classification predicts structure or nutrient demand."
            ],
            "missing_information": [
              "Matched-environment replication is usually missing.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "oreoz-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "flowering",
          "sort_order": 50,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Flowering",
            "summary": "Reported timing is directional and should be checked against observed maturity.",
            "reported_tendencies": [
              {
                "text": "Resin-forward descriptions are common while reliable timing context is limited.",
                "confidence": "medium",
                "evidence_keys": [
                  "oreoz-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Track first flower, stretch, resin, aroma, and finish cues in the timeline.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not harvest on a catalog day number alone."
            ],
            "missing_information": [
              "Sources may not define flowering day one or maturity criteria.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "oreoz-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "environment",
          "sort_order": 60,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Environment",
            "summary": "Environmental stability matters more than a copied cultivar-name target.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Derive VPD only from validated temperature and humidity, then compare it with stage and response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Never present stale, invalid, demo, or mis-unit telemetry as healthy."
            ],
            "missing_information": [
              "Controlled cultivar response curves are rarely available."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "watering",
          "sort_order": 70,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Watering",
            "summary": "Watering depends on medium, root mass, container, environment, and dryback.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log volume, timing, substrate response, and plant response before changing cadence.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not use uncalibrated soil-moisture percentages as absolute instructions."
            ],
            "missing_information": [
              "Cultivar-specific root-zone calibration is generally unavailable."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "nutrition",
          "sort_order": 80,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Nutrition",
            "summary": "Feeding descriptions are weak evidence without medium, water, EC, and response context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Begin moderately and adjust from measured input and plant response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not copy an exact nutrient dose from a reference profile."
            ],
            "missing_information": [
              "Comparable nutrient-response trials are usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "training",
          "sort_order": 90,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Training",
            "summary": "Training response depends on vigor, health, timing, phenotype, and lifecycle.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use low-stress structure management and record recovery before increasing intensity.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid high-stress work when health or environmental stability is uncertain."
            ],
            "missing_information": [
              "Controlled cultivar-specific training trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "common_issues",
          "sort_order": 100,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Common issues",
            "summary": "Issue lists are hypotheses; symptoms still require plant and environment context.",
            "reported_tendencies": [
              {
                "text": "Dense interior growth may warrant careful airflow observation in some expressions.",
                "confidence": "medium",
                "evidence_keys": [
                  "oreoz-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Document symptoms, recent actions, photos, root-zone context, and telemetry.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not diagnose a deficiency or prescribe feed from cultivar identity alone."
            ],
            "missing_information": [
              "Frequency and causal evidence for cultivar-specific problems is limited.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "oreoz-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "harvest",
          "sort_order": 110,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Harvest",
            "summary": "Harvest timing should reflect observed maturity and intended use.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record trichomes, aroma, fade, irrigation history, and the harvest rationale.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not treat reported potency or flowering time as a guaranteed endpoint."
            ],
            "missing_information": [
              "Sources may not define sample position or maturity criteria."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "post_harvest",
          "sort_order": 120,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Post-harvest",
            "summary": "Drying, curing, and storage can change aroma retention and measured chemistry.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record dry conditions, duration, cure observations, and final quality notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not close a keeper decision before post-cure evidence exists."
            ],
            "missing_information": [
              "Comparable post-harvest protocols and laboratory methods are often absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "pheno_tips",
          "sort_order": 130,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Pheno tips",
            "summary": "Named cultivars can express different structure, aroma, chemistry, and finish.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "A single attractive specimen is not proof of stability."
            ],
            "missing_information": [
              "Replication count and environment matching may be unknown."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "missing_information",
          "sort_order": 140,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Missing information",
            "summary": "Uncertainty stays visible so a thin record never reads like certainty.",
            "reported_tendencies": [
              {
                "text": "V1 intentionally leaves flowering and potency summaries blank where evidence is too thin.",
                "confidence": "medium",
                "evidence_keys": [
                  "oreoz-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Use missing-information notes to decide what to observe, measure, photograph, or source next.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not fill missing evidence with invented values or AI-generated certainty."
            ],
            "missing_information": [
              "Batch COAs, methods, phenotype identity, and matched trials are commonly absent.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "oreoz-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        }
      ]
    },
    {
      "id": "54000000-0000-4000-8000-000000000007",
      "slug": "do-si-dos",
      "canonical_name": "Do-Si-Dos",
      "normalized_name": "do si dos",
      "breeder_normalized_name": "archive seed bank",
      "life_cycle": "photoperiod",
      "seed_expression": "unknown",
      "market_classification": "hybrid",
      "lineage_text": "OGKB (Girl Scout Cookies phenotype) × Face Off OG",
      "description": "Do-Si-Dos is commonly associated with sweet, earthy, floral, and fuel notes plus notable resin. Actual sensitivity, structure, and chemistry must be learned from the run.",
      "difficulty": "intermediate",
      "height_category": "medium",
      "chemotype": "type_i",
      "flowering_days_min": 56,
      "flowering_days_max": 70,
      "flowering_window_label": "8–10 weeks reported",
      "stretch_min": 1.3,
      "stretch_max": 2,
      "yield_indoor_g_per_m2_min": null,
      "yield_indoor_g_per_m2_max": null,
      "thc_pct_min": 20,
      "thc_pct_max": 30,
      "cbd_pct_min": null,
      "cbd_pct_max": null,
      "dominant_terpenes": [
        "limonene",
        "beta-caryophyllene",
        "linalool"
      ],
      "pheno_hunt_focus": [
        "Floral/earth aroma",
        "Resin",
        "Stretch",
        "Post-cure expression"
      ],
      "sample_phenos": [
        {
          "label": "Do-Si-Dos sample A",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Floral and sweet direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Finish must be recorded from the actual plant"
        },
        {
          "label": "Do-Si-Dos sample B",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Earthy and fuel direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Post-cure follow-up remains required"
        }
      ],
      "publication_status": "published",
      "verification_status": "sample",
      "data_origin": "seed",
      "last_verified_at": "2026-07-22T00:00:00.000Z",
      "aliases": [
        {
          "alias": "Dosidos",
          "normalized_alias": "dosidos",
          "sort_order": 0,
          "source_key": "do-si-dos-public-profile"
        },
        {
          "alias": "Dosi",
          "normalized_alias": "dosi",
          "sort_order": 1,
          "source_key": "do-si-dos-public-profile"
        }
      ],
      "profile_sources": [
        {
          "source_key": "do-si-dos-public-profile",
          "sort_order": 0
        },
        {
          "source_key": "watts-2021-terpene-genetics",
          "sort_order": 1
        },
        {
          "source_key": "cannabinoid-method-context-2019",
          "sort_order": 2
        },
        {
          "source_key": "cannabinoid-spatial-variability-2025",
          "sort_order": 3
        },
        {
          "source_key": "chemotype-genomics-2021",
          "sort_order": 4
        }
      ],
      "claims": [
        {
          "id": "57000000-0000-4000-8000-000000000701",
          "trait_key": "reported_thc_pct",
          "value_min": 20,
          "value_max": 30,
          "value_text": null,
          "value_jsonb": null,
          "unit": "%",
          "context": {
            "measurement_basis": "source_reported_summary",
            "analytical_method": "not_reported",
            "sample_scope": "Public cultivar profile; not one universal batch or Certificate of Analysis.",
            "variability_note": "Expression varies by phenotype, batch, sample position, environment, harvest, post-harvest handling, storage, and laboratory method."
          },
          "source_key": "do-si-dos-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000703",
          "trait_key": "chemotype",
          "value_min": null,
          "value_max": null,
          "value_text": "type_i",
          "value_jsonb": null,
          "unit": null,
          "context": {
            "classification_basis": "Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.",
            "variability_note": "Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent."
          },
          "source_key": "do-si-dos-public-profile",
          "confidence": "community",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000704",
          "trait_key": "reported_dominant_terpenes",
          "value_min": null,
          "value_max": null,
          "value_text": null,
          "value_jsonb": [
            "limonene",
            "beta-caryophyllene",
            "linalool"
          ],
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "do-si-dos-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000701",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "limonene",
          "value_jsonb": {
            "rank": 1,
            "aroma_descriptors": [
              "citrus"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "do-si-dos-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000702",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "beta-caryophyllene",
          "value_jsonb": {
            "rank": 2,
            "aroma_descriptors": [
              "peppery"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "do-si-dos-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000703",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "linalool",
          "value_jsonb": {
            "rank": 3,
            "aroma_descriptors": [
              "floral",
              "lavender"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "do-si-dos-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        }
      ],
      "guide": {
        "id": "55000000-0000-4000-8000-000000000003",
        "version": 1,
        "title": "Do-Si-Dos sample reference guide",
        "base_template_key": "photoperiod_general",
        "publication_status": "published",
        "confidence": "medium",
        "content_schema_version": 1,
        "last_verified_at": "2026-07-22T00:00:00.000Z",
        "published_at": "2026-07-22T00:00:00.000Z"
      },
      "sections": [
        {
          "section_key": "overview",
          "sort_order": 10,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Overview",
            "summary": "Use this profile as reference context, then verify every tendency against the plant in front of you.",
            "reported_tendencies": [
              {
                "text": "Sweet, earthy, floral, and fuel directions are commonly reported.",
                "confidence": "medium",
                "evidence_keys": [
                  "do-si-dos-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Start with the actual stage, medium, pot size, logs, photos, and source-labeled sensor history.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not convert a named-cultivar profile into a universal recipe."
            ],
            "missing_information": [
              "Breeder release, phenotype, and batch identity may be incomplete or disputed.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "do-si-dos-public-profile",
              "support_note": "Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "germination",
          "sort_order": 20,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Germination",
            "summary": "Germination fundamentals are shared and are not a reliable cultivar-selection signal.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Keep moisture and temperature stable and minimize handling once the seed is placed.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not infer vigor or final quality from germination speed alone."
            ],
            "missing_information": [
              "Cultivar-specific germination evidence is usually limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "early_growth",
          "sort_order": 30,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Early growth",
            "summary": "Evaluate early growth through stability, root-zone correctness, and observation.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record emergence, leaf development, watering, and deviations before changing inputs.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid chasing small early differences with heavy feeding or stress."
            ],
            "missing_information": [
              "Reliable cultivar-specific early-growth trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "vegetative",
          "sort_order": 40,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Vegetative growth",
            "summary": "Vegetative structure can vary among phenotypes carrying the same commercial name.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log internode spacing, branching, vigor, and recovery from low-risk handling.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not assume market classification predicts structure or nutrient demand."
            ],
            "missing_information": [
              "Matched-environment replication is usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "flowering",
          "sort_order": 50,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Flowering",
            "summary": "Reported timing is directional and should be checked against observed maturity.",
            "reported_tendencies": [
              {
                "text": "Resin development is frequently emphasized in public reports.",
                "confidence": "medium",
                "evidence_keys": [
                  "do-si-dos-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Track first flower, stretch, resin, aroma, and finish cues in the timeline.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not harvest on a catalog day number alone."
            ],
            "missing_information": [
              "Sources may not define flowering day one or maturity criteria.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "do-si-dos-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "environment",
          "sort_order": 60,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Environment",
            "summary": "Environmental stability matters more than a copied cultivar-name target.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Derive VPD only from validated temperature and humidity, then compare it with stage and response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Never present stale, invalid, demo, or mis-unit telemetry as healthy."
            ],
            "missing_information": [
              "Controlled cultivar response curves are rarely available."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "watering",
          "sort_order": 70,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Watering",
            "summary": "Watering depends on medium, root mass, container, environment, and dryback.",
            "reported_tendencies": [
              {
                "text": "Overwatering concerns should be evaluated from medium, dryback, and plant response.",
                "confidence": "medium",
                "evidence_keys": [
                  "do-si-dos-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Log volume, timing, substrate response, and plant response before changing cadence.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not use uncalibrated soil-moisture percentages as absolute instructions."
            ],
            "missing_information": [
              "Cultivar-specific root-zone calibration is generally unavailable.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "do-si-dos-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "nutrition",
          "sort_order": 80,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Nutrition",
            "summary": "Feeding descriptions are weak evidence without medium, water, EC, and response context.",
            "reported_tendencies": [
              {
                "text": "Some grow reports describe sensitivity; measured response should lead instead of prophylactic supplements.",
                "confidence": "medium",
                "evidence_keys": [
                  "do-si-dos-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Begin moderately and adjust from measured input and plant response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not copy an exact nutrient dose from a reference profile."
            ],
            "missing_information": [
              "Comparable nutrient-response trials are usually missing.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "do-si-dos-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "training",
          "sort_order": 90,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Training",
            "summary": "Training response depends on vigor, health, timing, phenotype, and lifecycle.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use low-stress structure management and record recovery before increasing intensity.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid high-stress work when health or environmental stability is uncertain."
            ],
            "missing_information": [
              "Controlled cultivar-specific training trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "common_issues",
          "sort_order": 100,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Common issues",
            "summary": "Issue lists are hypotheses; symptoms still require plant and environment context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Document symptoms, recent actions, photos, root-zone context, and telemetry.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not diagnose a deficiency or prescribe feed from cultivar identity alone."
            ],
            "missing_information": [
              "Frequency and causal evidence for cultivar-specific problems is limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "harvest",
          "sort_order": 110,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Harvest",
            "summary": "Harvest timing should reflect observed maturity and intended use.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record trichomes, aroma, fade, irrigation history, and the harvest rationale.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not treat reported potency or flowering time as a guaranteed endpoint."
            ],
            "missing_information": [
              "Sources may not define sample position or maturity criteria."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "post_harvest",
          "sort_order": 120,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Post-harvest",
            "summary": "Drying, curing, and storage can change aroma retention and measured chemistry.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record dry conditions, duration, cure observations, and final quality notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not close a keeper decision before post-cure evidence exists."
            ],
            "missing_information": [
              "Comparable post-harvest protocols and laboratory methods are often absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "pheno_tips",
          "sort_order": 130,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Pheno tips",
            "summary": "Named cultivars can express different structure, aroma, chemistry, and finish.",
            "reported_tendencies": [
              {
                "text": "Compare floral versus earthy/fuel expression after cure, not only during flower.",
                "confidence": "medium",
                "evidence_keys": [
                  "do-si-dos-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "A single attractive specimen is not proof of stability."
            ],
            "missing_information": [
              "Replication count and environment matching may be unknown.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "do-si-dos-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "missing_information",
          "sort_order": 140,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Missing information",
            "summary": "Uncertainty stays visible so a thin record never reads like certainty.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use missing-information notes to decide what to observe, measure, photograph, or source next.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not fill missing evidence with invented values or AI-generated certainty."
            ],
            "missing_information": [
              "Batch COAs, methods, phenotype identity, and matched trials are commonly absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        }
      ]
    },
    {
      "id": "54000000-0000-4000-8000-000000000008",
      "slug": "blue-cookies",
      "canonical_name": "Blue Cookies",
      "normalized_name": "blue cookies",
      "breeder_normalized_name": null,
      "life_cycle": "photoperiod",
      "seed_expression": "unknown",
      "market_classification": "hybrid",
      "lineage_text": "Commonly reported as Girl Scout Cookies × Blueberry",
      "description": "Blue Cookies-labelled material is often associated with fruit, berry, earth, and dessert notes. Identity and release provenance can vary, so color, aroma, and potency are observations to verify rather than promises.",
      "difficulty": "beginner",
      "height_category": "medium",
      "chemotype": "type_i",
      "flowering_days_min": 56,
      "flowering_days_max": 63,
      "flowering_window_label": "8–9 weeks reported",
      "stretch_min": 1.2,
      "stretch_max": 1.8,
      "yield_indoor_g_per_m2_min": null,
      "yield_indoor_g_per_m2_max": null,
      "thc_pct_min": 18,
      "thc_pct_max": 25,
      "cbd_pct_min": null,
      "cbd_pct_max": null,
      "dominant_terpenes": [
        "beta-caryophyllene",
        "limonene",
        "myrcene"
      ],
      "pheno_hunt_focus": [
        "Fruit/cookie aroma",
        "Color without stress",
        "Density",
        "Post-cure retention"
      ],
      "sample_phenos": [
        {
          "label": "Blue Cookies sample A",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Berry and fruit direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Finish must be recorded from the actual plant"
        },
        {
          "label": "Blue Cookies sample B",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Cookie and earthy direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Post-cure follow-up remains required"
        }
      ],
      "publication_status": "published",
      "verification_status": "sample",
      "data_origin": "seed",
      "last_verified_at": "2026-07-22T00:00:00.000Z",
      "aliases": [
        {
          "alias": "Blue GSC",
          "normalized_alias": "blue gsc",
          "sort_order": 0,
          "source_key": "blue-cookies-public-profile"
        }
      ],
      "profile_sources": [
        {
          "source_key": "blue-cookies-public-profile",
          "sort_order": 0
        },
        {
          "source_key": "watts-2021-terpene-genetics",
          "sort_order": 1
        },
        {
          "source_key": "cannabinoid-method-context-2019",
          "sort_order": 2
        },
        {
          "source_key": "cannabinoid-spatial-variability-2025",
          "sort_order": 3
        },
        {
          "source_key": "chemotype-genomics-2021",
          "sort_order": 4
        }
      ],
      "claims": [
        {
          "id": "57000000-0000-4000-8000-000000000801",
          "trait_key": "reported_thc_pct",
          "value_min": 18,
          "value_max": 25,
          "value_text": null,
          "value_jsonb": null,
          "unit": "%",
          "context": {
            "measurement_basis": "source_reported_summary",
            "analytical_method": "not_reported",
            "sample_scope": "Public cultivar profile; not one universal batch or Certificate of Analysis.",
            "variability_note": "Expression varies by phenotype, batch, sample position, environment, harvest, post-harvest handling, storage, and laboratory method."
          },
          "source_key": "blue-cookies-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000803",
          "trait_key": "chemotype",
          "value_min": null,
          "value_max": null,
          "value_text": "type_i",
          "value_jsonb": null,
          "unit": null,
          "context": {
            "classification_basis": "Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.",
            "variability_note": "Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent."
          },
          "source_key": "blue-cookies-public-profile",
          "confidence": "community",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000804",
          "trait_key": "reported_dominant_terpenes",
          "value_min": null,
          "value_max": null,
          "value_text": null,
          "value_jsonb": [
            "beta-caryophyllene",
            "limonene",
            "myrcene"
          ],
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "blue-cookies-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000801",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "beta-caryophyllene",
          "value_jsonb": {
            "rank": 1,
            "aroma_descriptors": [
              "peppery",
              "woody"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "blue-cookies-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000802",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "limonene",
          "value_jsonb": {
            "rank": 2,
            "aroma_descriptors": [
              "citrus"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "blue-cookies-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000803",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "myrcene",
          "value_jsonb": {
            "rank": 3,
            "aroma_descriptors": [
              "earthy"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "blue-cookies-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        }
      ],
      "guide": {
        "id": "55000000-0000-4000-8000-000000000001",
        "version": 1,
        "title": "Blue Cookies sample reference guide",
        "base_template_key": "photoperiod_general",
        "publication_status": "published",
        "confidence": "medium",
        "content_schema_version": 1,
        "last_verified_at": "2026-07-22T00:00:00.000Z",
        "published_at": "2026-07-22T00:00:00.000Z"
      },
      "sections": [
        {
          "section_key": "overview",
          "sort_order": 10,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Overview",
            "summary": "Use this profile as reference context, then verify every tendency against the plant in front of you.",
            "reported_tendencies": [
              {
                "text": "Berry, fruit, earth, and cookie/dessert descriptors are commonly reported.",
                "confidence": "medium",
                "evidence_keys": [
                  "blue-cookies-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Start with the actual stage, medium, pot size, logs, photos, and source-labeled sensor history.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not convert a named-cultivar profile into a universal recipe."
            ],
            "missing_information": [
              "Breeder release, phenotype, and batch identity may be incomplete or disputed.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "blue-cookies-public-profile",
              "support_note": "Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "germination",
          "sort_order": 20,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Germination",
            "summary": "Germination fundamentals are shared and are not a reliable cultivar-selection signal.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Keep moisture and temperature stable and minimize handling once the seed is placed.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not infer vigor or final quality from germination speed alone."
            ],
            "missing_information": [
              "Cultivar-specific germination evidence is usually limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "early_growth",
          "sort_order": 30,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Early growth",
            "summary": "Evaluate early growth through stability, root-zone correctness, and observation.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record emergence, leaf development, watering, and deviations before changing inputs.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid chasing small early differences with heavy feeding or stress."
            ],
            "missing_information": [
              "Reliable cultivar-specific early-growth trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "vegetative",
          "sort_order": 40,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Vegetative growth",
            "summary": "Vegetative structure can vary among phenotypes carrying the same commercial name.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log internode spacing, branching, vigor, and recovery from low-risk handling.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not assume market classification predicts structure or nutrient demand."
            ],
            "missing_information": [
              "Matched-environment replication is usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "flowering",
          "sort_order": 50,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Flowering",
            "summary": "Reported timing is directional and should be checked against observed maturity.",
            "reported_tendencies": [
              {
                "text": "Color expression may vary and should not be forced with stress.",
                "confidence": "medium",
                "evidence_keys": [
                  "blue-cookies-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Track first flower, stretch, resin, aroma, and finish cues in the timeline.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not harvest on a catalog day number alone."
            ],
            "missing_information": [
              "Sources may not define flowering day one or maturity criteria.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "blue-cookies-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "environment",
          "sort_order": 60,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Environment",
            "summary": "Environmental stability matters more than a copied cultivar-name target.",
            "reported_tendencies": [
              {
                "text": "Cooler late-flower nights may coincide with color in some phenotypes, but stability takes priority.",
                "confidence": "medium",
                "evidence_keys": [
                  "blue-cookies-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Derive VPD only from validated temperature and humidity, then compare it with stage and response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Never present stale, invalid, demo, or mis-unit telemetry as healthy."
            ],
            "missing_information": [
              "Controlled cultivar response curves are rarely available.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "blue-cookies-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "watering",
          "sort_order": 70,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Watering",
            "summary": "Watering depends on medium, root mass, container, environment, and dryback.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log volume, timing, substrate response, and plant response before changing cadence.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not use uncalibrated soil-moisture percentages as absolute instructions."
            ],
            "missing_information": [
              "Cultivar-specific root-zone calibration is generally unavailable."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "nutrition",
          "sort_order": 80,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Nutrition",
            "summary": "Feeding descriptions are weak evidence without medium, water, EC, and response context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Begin moderately and adjust from measured input and plant response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not copy an exact nutrient dose from a reference profile."
            ],
            "missing_information": [
              "Comparable nutrient-response trials are usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "training",
          "sort_order": 90,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Training",
            "summary": "Training response depends on vigor, health, timing, phenotype, and lifecycle.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use low-stress structure management and record recovery before increasing intensity.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid high-stress work when health or environmental stability is uncertain."
            ],
            "missing_information": [
              "Controlled cultivar-specific training trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "common_issues",
          "sort_order": 100,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Common issues",
            "summary": "Issue lists are hypotheses; symptoms still require plant and environment context.",
            "reported_tendencies": [
              {
                "text": "Dense flower and high humidity can increase fungal risk independent of cultivar name.",
                "confidence": "medium",
                "evidence_keys": [
                  "blue-cookies-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Document symptoms, recent actions, photos, root-zone context, and telemetry.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not diagnose a deficiency or prescribe feed from cultivar identity alone."
            ],
            "missing_information": [
              "Frequency and causal evidence for cultivar-specific problems is limited.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "blue-cookies-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "harvest",
          "sort_order": 110,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Harvest",
            "summary": "Harvest timing should reflect observed maturity and intended use.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record trichomes, aroma, fade, irrigation history, and the harvest rationale.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not treat reported potency or flowering time as a guaranteed endpoint."
            ],
            "missing_information": [
              "Sources may not define sample position or maturity criteria."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "post_harvest",
          "sort_order": 120,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Post-harvest",
            "summary": "Drying, curing, and storage can change aroma retention and measured chemistry.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record dry conditions, duration, cure observations, and final quality notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not close a keeper decision before post-cure evidence exists."
            ],
            "missing_information": [
              "Comparable post-harvest protocols and laboratory methods are often absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "pheno_tips",
          "sort_order": 130,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Pheno tips",
            "summary": "Named cultivars can express different structure, aroma, chemistry, and finish.",
            "reported_tendencies": [
              {
                "text": "Compare fruit versus cookie expression and post-cure retention under matched conditions.",
                "confidence": "medium",
                "evidence_keys": [
                  "blue-cookies-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "A single attractive specimen is not proof of stability."
            ],
            "missing_information": [
              "Replication count and environment matching may be unknown.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "blue-cookies-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "missing_information",
          "sort_order": 140,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Missing information",
            "summary": "Uncertainty stays visible so a thin record never reads like certainty.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use missing-information notes to decide what to observe, measure, photograph, or source next.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not fill missing evidence with invented values or AI-generated certainty."
            ],
            "missing_information": [
              "Batch COAs, methods, phenotype identity, and matched trials are commonly absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        }
      ]
    },
    {
      "id": "54000000-0000-4000-8000-000000000009",
      "slug": "jack-herer",
      "canonical_name": "Jack Herer",
      "normalized_name": "jack herer",
      "breeder_normalized_name": "sensi seeds",
      "life_cycle": "photoperiod",
      "seed_expression": "regular",
      "market_classification": "sativa",
      "lineage_text": "Commonly reported as Haze × Northern Lights #5 × Shiva Skunk",
      "description": "Jack Herer is a long-circulating name associated with spicy, pine, herbal, and terpinolene-forward reports. Seed releases and phenotypes can differ, so Verdant emphasizes provenance and matched comparison.",
      "difficulty": "intermediate",
      "height_category": "tall",
      "chemotype": "type_i",
      "flowering_days_min": 56,
      "flowering_days_max": 70,
      "flowering_window_label": "8–10 weeks reported",
      "stretch_min": 1.5,
      "stretch_max": 2.5,
      "yield_indoor_g_per_m2_min": null,
      "yield_indoor_g_per_m2_max": null,
      "thc_pct_min": 18,
      "thc_pct_max": 24,
      "cbd_pct_min": null,
      "cbd_pct_max": null,
      "dominant_terpenes": [
        "terpinolene",
        "alpha-pinene",
        "beta-caryophyllene"
      ],
      "pheno_hunt_focus": [
        "Terpinolene/pine aroma",
        "Stretch",
        "Finish timing",
        "Replication"
      ],
      "sample_phenos": [
        {
          "label": "Jack Herer sample A",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Herbal pine and spice direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Finish must be recorded from the actual plant"
        },
        {
          "label": "Jack Herer sample B",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Floral citrus direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Post-cure follow-up remains required"
        }
      ],
      "publication_status": "published",
      "verification_status": "sample",
      "data_origin": "seed",
      "last_verified_at": "2026-07-22T00:00:00.000Z",
      "aliases": [
        {
          "alias": "Jack",
          "normalized_alias": "jack",
          "sort_order": 0,
          "source_key": "jack-herer-public-profile"
        }
      ],
      "profile_sources": [
        {
          "source_key": "jack-herer-public-profile",
          "sort_order": 0
        },
        {
          "source_key": "watts-2021-terpene-genetics",
          "sort_order": 1
        },
        {
          "source_key": "cannabinoid-method-context-2019",
          "sort_order": 2
        },
        {
          "source_key": "cannabinoid-spatial-variability-2025",
          "sort_order": 3
        },
        {
          "source_key": "chemotype-genomics-2021",
          "sort_order": 4
        }
      ],
      "claims": [
        {
          "id": "57000000-0000-4000-8000-000000000901",
          "trait_key": "reported_thc_pct",
          "value_min": 18,
          "value_max": 24,
          "value_text": null,
          "value_jsonb": null,
          "unit": "%",
          "context": {
            "measurement_basis": "source_reported_summary",
            "analytical_method": "not_reported",
            "sample_scope": "Public cultivar profile; not one universal batch or Certificate of Analysis.",
            "variability_note": "Expression varies by phenotype, batch, sample position, environment, harvest, post-harvest handling, storage, and laboratory method."
          },
          "source_key": "jack-herer-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000903",
          "trait_key": "chemotype",
          "value_min": null,
          "value_max": null,
          "value_text": "type_i",
          "value_jsonb": null,
          "unit": null,
          "context": {
            "classification_basis": "Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.",
            "variability_note": "Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent."
          },
          "source_key": "jack-herer-public-profile",
          "confidence": "community",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000000904",
          "trait_key": "reported_dominant_terpenes",
          "value_min": null,
          "value_max": null,
          "value_text": null,
          "value_jsonb": [
            "terpinolene",
            "alpha-pinene",
            "beta-caryophyllene"
          ],
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "jack-herer-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000901",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "terpinolene",
          "value_jsonb": {
            "rank": 1,
            "aroma_descriptors": [
              "floral",
              "herbal",
              "citrus",
              "pine"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "jack-herer-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000902",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "alpha-pinene",
          "value_jsonb": {
            "rank": 2,
            "aroma_descriptors": [
              "pine",
              "forest"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "jack-herer-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000000903",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "beta-caryophyllene",
          "value_jsonb": {
            "rank": 3,
            "aroma_descriptors": [
              "peppery"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "jack-herer-public-profile",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        }
      ],
      "guide": {
        "id": "55000000-0000-4000-8000-000000000005",
        "version": 1,
        "title": "Jack Herer sample reference guide",
        "base_template_key": "photoperiod_general",
        "publication_status": "published",
        "confidence": "medium",
        "content_schema_version": 1,
        "last_verified_at": "2026-07-22T00:00:00.000Z",
        "published_at": "2026-07-22T00:00:00.000Z"
      },
      "sections": [
        {
          "section_key": "overview",
          "sort_order": 10,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Overview",
            "summary": "Use this profile as reference context, then verify every tendency against the plant in front of you.",
            "reported_tendencies": [
              {
                "text": "Spicy, pine, herbal, and complex terpinolene-associated descriptors are commonly reported.",
                "confidence": "medium",
                "evidence_keys": [
                  "jack-herer-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Start with the actual stage, medium, pot size, logs, photos, and source-labeled sensor history.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not convert a named-cultivar profile into a universal recipe."
            ],
            "missing_information": [
              "Breeder release, phenotype, and batch identity may be incomplete or disputed.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "jack-herer-public-profile",
              "support_note": "Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "germination",
          "sort_order": 20,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Germination",
            "summary": "Germination fundamentals are shared and are not a reliable cultivar-selection signal.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Keep moisture and temperature stable and minimize handling once the seed is placed.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not infer vigor or final quality from germination speed alone."
            ],
            "missing_information": [
              "Cultivar-specific germination evidence is usually limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "early_growth",
          "sort_order": 30,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Early growth",
            "summary": "Evaluate early growth through stability, root-zone correctness, and observation.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record emergence, leaf development, watering, and deviations before changing inputs.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid chasing small early differences with heavy feeding or stress."
            ],
            "missing_information": [
              "Reliable cultivar-specific early-growth trials are limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "vegetative",
          "sort_order": 40,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Vegetative growth",
            "summary": "Vegetative structure can vary among phenotypes carrying the same commercial name.",
            "reported_tendencies": [
              {
                "text": "Vigorous vertical growth and branching are frequently described.",
                "confidence": "medium",
                "evidence_keys": [
                  "jack-herer-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Log internode spacing, branching, vigor, and recovery from low-risk handling.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not assume market classification predicts structure or nutrient demand."
            ],
            "missing_information": [
              "Matched-environment replication is usually missing.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "jack-herer-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "flowering",
          "sort_order": 50,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Flowering",
            "summary": "Reported timing is directional and should be checked against observed maturity.",
            "reported_tendencies": [
              {
                "text": "Phenotypes may differ in finish and structure, making matched timepoint comparison important.",
                "confidence": "medium",
                "evidence_keys": [
                  "jack-herer-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Track first flower, stretch, resin, aroma, and finish cues in the timeline.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not harvest on a catalog day number alone."
            ],
            "missing_information": [
              "Sources may not define flowering day one or maturity criteria.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "jack-herer-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "environment",
          "sort_order": 60,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Environment",
            "summary": "Environmental stability matters more than a copied cultivar-name target.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Derive VPD only from validated temperature and humidity, then compare it with stage and response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Never present stale, invalid, demo, or mis-unit telemetry as healthy."
            ],
            "missing_information": [
              "Controlled cultivar response curves are rarely available."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "watering",
          "sort_order": 70,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Watering",
            "summary": "Watering depends on medium, root mass, container, environment, and dryback.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log volume, timing, substrate response, and plant response before changing cadence.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not use uncalibrated soil-moisture percentages as absolute instructions."
            ],
            "missing_information": [
              "Cultivar-specific root-zone calibration is generally unavailable."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "nutrition",
          "sort_order": 80,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Nutrition",
            "summary": "Feeding descriptions are weak evidence without medium, water, EC, and response context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Begin moderately and adjust from measured input and plant response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not copy an exact nutrient dose from a reference profile."
            ],
            "missing_information": [
              "Comparable nutrient-response trials are usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "training",
          "sort_order": 90,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Training",
            "summary": "Training response depends on vigor, health, timing, phenotype, and lifecycle.",
            "reported_tendencies": [
              {
                "text": "Early low-stress canopy planning may help manage stretch when vigor is strong.",
                "confidence": "medium",
                "evidence_keys": [
                  "jack-herer-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Use low-stress structure management and record recovery before increasing intensity.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid high-stress work when health or environmental stability is uncertain."
            ],
            "missing_information": [
              "Controlled cultivar-specific training trials are limited.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "jack-herer-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "common_issues",
          "sort_order": 100,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Common issues",
            "summary": "Issue lists are hypotheses; symptoms still require plant and environment context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Document symptoms, recent actions, photos, root-zone context, and telemetry.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not diagnose a deficiency or prescribe feed from cultivar identity alone."
            ],
            "missing_information": [
              "Frequency and causal evidence for cultivar-specific problems is limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "harvest",
          "sort_order": 110,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Harvest",
            "summary": "Harvest timing should reflect observed maturity and intended use.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record trichomes, aroma, fade, irrigation history, and the harvest rationale.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not treat reported potency or flowering time as a guaranteed endpoint."
            ],
            "missing_information": [
              "Sources may not define sample position or maturity criteria."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "post_harvest",
          "sort_order": 120,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Post-harvest",
            "summary": "Drying, curing, and storage can change aroma retention and measured chemistry.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record dry conditions, duration, cure observations, and final quality notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not close a keeper decision before post-cure evidence exists."
            ],
            "missing_information": [
              "Comparable post-harvest protocols and laboratory methods are often absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "pheno_tips",
          "sort_order": 130,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Pheno tips",
            "summary": "Named cultivars can express different structure, aroma, chemistry, and finish.",
            "reported_tendencies": [
              {
                "text": "Record terpinolene/pine direction and finish timing across replicated candidates.",
                "confidence": "medium",
                "evidence_keys": [
                  "jack-herer-public-profile"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "A single attractive specimen is not proof of stability."
            ],
            "missing_information": [
              "Replication count and environment matching may be unknown.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "jack-herer-public-profile",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "missing_information",
          "sort_order": 140,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Missing information",
            "summary": "Uncertainty stays visible so a thin record never reads like certainty.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use missing-information notes to decide what to observe, measure, photograph, or source next.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not fill missing evidence with invented values or AI-generated certainty."
            ],
            "missing_information": [
              "Batch COAs, methods, phenotype identity, and matched trials are commonly absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        }
      ]
    },
    {
      "id": "54000000-0000-4000-8000-000000000010",
      "slug": "sour-stomper",
      "canonical_name": "Sour Stomper",
      "normalized_name": "sour stomper",
      "breeder_normalized_name": "mephisto genetics",
      "life_cycle": "autoflower",
      "seed_expression": "feminized",
      "market_classification": "hybrid",
      "lineage_text": "Breeder-reported Grapestomper OG × Sour Crack",
      "description": "Sour Stomper is the V1 autoflower reference. Breeder-reported timing and aroma are directional context, while recovery, watering, environment, and gentle training decisions stay tied to the actual plant.",
      "difficulty": "beginner",
      "height_category": "medium",
      "chemotype": "unknown",
      "flowering_days_min": 65,
      "flowering_days_max": 75,
      "flowering_window_label": "65–75 days from sprout reported",
      "stretch_min": null,
      "stretch_max": null,
      "yield_indoor_g_per_m2_min": null,
      "yield_indoor_g_per_m2_max": null,
      "thc_pct_min": 18,
      "thc_pct_max": 24,
      "cbd_pct_min": null,
      "cbd_pct_max": null,
      "dominant_terpenes": [
        "limonene",
        "beta-caryophyllene",
        "myrcene"
      ],
      "pheno_hunt_focus": [
        "Sour fruit/grape aroma",
        "Early vigor",
        "Low-stress response",
        "Finish timing"
      ],
      "sample_phenos": [
        {
          "label": "Sour Stomper sample A",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Sour fruit and grape direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Finish must be recorded from the actual plant"
        },
        {
          "label": "Sour Stomper sample B",
          "structure": "Illustrative expression only — not a real grower record",
          "aroma": "Candy citrus direction",
          "resin": "Illustrative relative observation only",
          "yield_note": "Sample comparison field — no yield claim",
          "finish_note": "Post-cure follow-up remains required"
        }
      ],
      "publication_status": "published",
      "verification_status": "sample",
      "data_origin": "seed",
      "last_verified_at": "2026-07-22T00:00:00.000Z",
      "aliases": [
        {
          "alias": "Sour Stomper Auto",
          "normalized_alias": "sour stomper auto",
          "sort_order": 0,
          "source_key": "sour-stomper-product-info"
        }
      ],
      "profile_sources": [
        {
          "source_key": "sour-stomper-product-info",
          "sort_order": 0
        },
        {
          "source_key": "watts-2021-terpene-genetics",
          "sort_order": 1
        },
        {
          "source_key": "cannabinoid-method-context-2019",
          "sort_order": 2
        },
        {
          "source_key": "cannabinoid-spatial-variability-2025",
          "sort_order": 3
        },
        {
          "source_key": "chemotype-genomics-2021",
          "sort_order": 4
        }
      ],
      "claims": [
        {
          "id": "57000000-0000-4000-8000-000000001001",
          "trait_key": "reported_thc_pct",
          "value_min": 18,
          "value_max": 24,
          "value_text": null,
          "value_jsonb": null,
          "unit": "%",
          "context": {
            "measurement_basis": "source_reported_summary",
            "analytical_method": "not_reported",
            "sample_scope": "Public cultivar profile; not one universal batch or Certificate of Analysis.",
            "variability_note": "Expression varies by phenotype, batch, sample position, environment, harvest, post-harvest handling, storage, and laboratory method."
          },
          "source_key": "sour-stomper-product-info",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000001003",
          "trait_key": "chemotype",
          "value_min": null,
          "value_max": null,
          "value_text": "unknown",
          "value_jsonb": null,
          "unit": null,
          "context": {
            "classification_basis": "Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.",
            "variability_note": "Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent."
          },
          "source_key": "sour-stomper-product-info",
          "confidence": "community",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "57000000-0000-4000-8000-000000001004",
          "trait_key": "reported_dominant_terpenes",
          "value_min": null,
          "value_max": null,
          "value_text": null,
          "value_jsonb": [
            "limonene",
            "beta-caryophyllene",
            "myrcene"
          ],
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "sour-stomper-product-info",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000001001",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "limonene",
          "value_jsonb": {
            "rank": 1,
            "aroma_descriptors": [
              "citrus"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "sour-stomper-product-info",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000001002",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "beta-caryophyllene",
          "value_jsonb": {
            "rank": 2,
            "aroma_descriptors": [
              "peppery",
              "woody"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "sour-stomper-product-info",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        },
        {
          "id": "56000000-0000-4000-8000-000000001003",
          "trait_key": "terpene",
          "value_min": null,
          "value_max": null,
          "value_text": "myrcene",
          "value_jsonb": {
            "rank": 3,
            "aroma_descriptors": [
              "earthy"
            ]
          },
          "unit": null,
          "context": {
            "analytical_method": "not_reported",
            "sample_scope": "Public named-cultivar summary; not a batch-specific laboratory result.",
            "variability_note": "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method."
          },
          "source_key": "sour-stomper-product-info",
          "confidence": "medium",
          "verified_at": "2026-07-22T00:00:00.000Z"
        }
      ],
      "guide": {
        "id": "55000000-0000-4000-8000-000000000010",
        "version": 1,
        "title": "Sour Stomper sample reference guide",
        "base_template_key": "autoflower_general",
        "publication_status": "published",
        "confidence": "medium",
        "content_schema_version": 1,
        "last_verified_at": "2026-07-22T00:00:00.000Z",
        "published_at": "2026-07-22T00:00:00.000Z"
      },
      "sections": [
        {
          "section_key": "overview",
          "sort_order": 10,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Overview",
            "summary": "Use this profile as reference context, then verify every tendency against the plant in front of you.",
            "reported_tendencies": [
              {
                "text": "Breeder material describes a sour fruit/grape and candy-associated aroma direction.",
                "confidence": "medium",
                "evidence_keys": [
                  "sour-stomper-product-info"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Start with the actual stage, medium, pot size, logs, photos, and source-labeled sensor history.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not convert a named-cultivar profile into a universal recipe."
            ],
            "missing_information": [
              "Breeder release, phenotype, and batch identity may be incomplete or disputed.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "sour-stomper-product-info",
              "support_note": "Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "germination",
          "sort_order": 20,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Germination",
            "summary": "Germination fundamentals are shared and are not a reliable cultivar-selection signal.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Keep moisture and temperature stable and minimize handling once the seed is placed.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not infer vigor or final quality from germination speed alone."
            ],
            "missing_information": [
              "Cultivar-specific germination evidence is usually limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "early_growth",
          "sort_order": 30,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Early growth",
            "summary": "Evaluate early growth through stability, root-zone correctness, and observation.",
            "reported_tendencies": [
              {
                "text": "Autoflower timing makes stable early root-zone and environment conditions especially important.",
                "confidence": "medium",
                "evidence_keys": [
                  "sour-stomper-product-info"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Record emergence, leaf development, watering, and deviations before changing inputs.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid chasing small early differences with heavy feeding or stress."
            ],
            "missing_information": [
              "Reliable cultivar-specific early-growth trials are limited.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "sour-stomper-product-info",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "vegetative",
          "sort_order": 40,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Vegetative growth",
            "summary": "Vegetative structure can vary among phenotypes carrying the same commercial name.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log internode spacing, branching, vigor, and recovery from low-risk handling.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not assume market classification predicts structure or nutrient demand."
            ],
            "missing_information": [
              "Matched-environment replication is usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "flowering",
          "sort_order": 50,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Flowering",
            "summary": "Reported timing is directional and should be checked against observed maturity.",
            "reported_tendencies": [
              {
                "text": "A 65–75 day from-sprout range is breeder-reported and is not a guaranteed harvest date.",
                "confidence": "medium",
                "evidence_keys": [
                  "sour-stomper-product-info"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Track first flower, stretch, resin, aroma, and finish cues in the timeline.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not harvest on a catalog day number alone."
            ],
            "missing_information": [
              "Sources may not define flowering day one or maturity criteria.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "sour-stomper-product-info",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "environment",
          "sort_order": 60,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Environment",
            "summary": "Environmental stability matters more than a copied cultivar-name target.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Derive VPD only from validated temperature and humidity, then compare it with stage and response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Never present stale, invalid, demo, or mis-unit telemetry as healthy."
            ],
            "missing_information": [
              "Controlled cultivar response curves are rarely available."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "watering",
          "sort_order": 70,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Watering",
            "summary": "Watering depends on medium, root mass, container, environment, and dryback.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Log volume, timing, substrate response, and plant response before changing cadence.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not use uncalibrated soil-moisture percentages as absolute instructions."
            ],
            "missing_information": [
              "Cultivar-specific root-zone calibration is generally unavailable."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "nutrition",
          "sort_order": 80,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Nutrition",
            "summary": "Feeding descriptions are weak evidence without medium, water, EC, and response context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Begin moderately and adjust from measured input and plant response.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not copy an exact nutrient dose from a reference profile."
            ],
            "missing_information": [
              "Comparable nutrient-response trials are usually missing."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "training",
          "sort_order": 90,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Training",
            "summary": "Training response depends on vigor, health, timing, phenotype, and lifecycle.",
            "reported_tendencies": [
              {
                "text": "Gentle low-stress canopy support is preferable to repeated high-stress recovery demands.",
                "confidence": "medium",
                "evidence_keys": [
                  "sour-stomper-product-info"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Use gentle low-stress canopy support only while the plant is healthy and actively growing.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Avoid high-stress training, heavy defoliation, transplant shock, and repeated recovery demands on an autoflower."
            ],
            "missing_information": [
              "Controlled cultivar-specific training trials are limited.",
              "Controlled breeder-specific recovery trials are not available in this sample reference."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "sour-stomper-product-info",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "common_issues",
          "sort_order": 100,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Common issues",
            "summary": "Issue lists are hypotheses; symptoms still require plant and environment context.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Document symptoms, recent actions, photos, root-zone context, and telemetry.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not diagnose a deficiency or prescribe feed from cultivar identity alone."
            ],
            "missing_information": [
              "Frequency and causal evidence for cultivar-specific problems is limited."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "harvest",
          "sort_order": 110,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Harvest",
            "summary": "Harvest timing should reflect observed maturity and intended use.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record trichomes, aroma, fade, irrigation history, and the harvest rationale.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not treat reported potency or flowering time as a guaranteed endpoint."
            ],
            "missing_information": [
              "Sources may not define sample position or maturity criteria."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "post_harvest",
          "sort_order": 120,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Post-harvest",
            "summary": "Drying, curing, and storage can change aroma retention and measured chemistry.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Record dry conditions, duration, cure observations, and final quality notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not close a keeper decision before post-cure evidence exists."
            ],
            "missing_information": [
              "Comparable post-harvest protocols and laboratory methods are often absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        },
        {
          "section_key": "pheno_tips",
          "sort_order": 130,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Pheno tips",
            "summary": "Named cultivars can express different structure, aroma, chemistry, and finish.",
            "reported_tendencies": [
              {
                "text": "Compare sour fruit, grape/candy direction, structure, and finish without assuming one fixed expression.",
                "confidence": "medium",
                "evidence_keys": [
                  "sour-stomper-product-info"
                ]
              }
            ],
            "guidance": [
              {
                "text": "Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.",
                "risk": "low"
              }
            ],
            "cautions": [
              "A single attractive specimen is not proof of stability."
            ],
            "missing_information": [
              "Replication count and environment matching may be unknown.",
              "This directional tendency must be checked against the specific release, phenotype, and run."
            ],
            "sample_reference_data": true
          },
          "sources": [
            {
              "source_key": "sour-stomper-product-info",
              "support_note": "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice."
            }
          ]
        },
        {
          "section_key": "missing_information",
          "sort_order": 140,
          "confidence": "medium",
          "content_schema_version": 1,
          "last_verified_at": "2026-07-22T00:00:00.000Z",
          "content": {
            "title": "Missing information",
            "summary": "Uncertainty stays visible so a thin record never reads like certainty.",
            "reported_tendencies": [],
            "guidance": [
              {
                "text": "Use missing-information notes to decide what to observe, measure, photograph, or source next.",
                "risk": "low"
              }
            ],
            "cautions": [
              "Do not fill missing evidence with invented values or AI-generated certainty."
            ],
            "missing_information": [
              "Batch COAs, methods, phenotype identity, and matched trials are commonly absent."
            ],
            "sample_reference_data": true
          },
          "sources": []
        }
      ]
    }
  ]
}
$verdant_cultivar_payload$::jsonb;
begin
  -- 2a. Sources: citation fields upserted on the stable source key.
  insert into public.cultivar_sources (
    id, source_key, title, publisher, url, source_type, retrieved_at,
    license_or_usage_notes
  )
  select
    (s->>'id')::uuid, s->>'source_key', s->>'title', s->>'publisher', s->>'url',
    s->>'source_type', (s->>'retrieved_at')::timestamptz, s->>'license_or_usage_notes'
  from jsonb_array_elements(payload->'sources') as s
  on conflict (source_key) do update set
    title = excluded.title,
    publisher = excluded.publisher,
    url = excluded.url,
    source_type = excluded.source_type,
    retrieved_at = excluded.retrieved_at,
    license_or_usage_notes = excluded.license_or_usage_notes;

  -- 2b. Breeders: create only when missing; keep any reviewed slug/website.
  insert into public.breeders (name, normalized_name, slug, verification_status)
  select b->>'name', b->>'normalized_name', b->>'slug', 'reviewed'
  from jsonb_array_elements(payload->'breeders') as b
  on conflict do nothing;

  update public.breeders br
  set name = b->>'name', updated_at = now()
  from jsonb_array_elements(payload->'breeders') as b
  where br.normalized_name = b->>'normalized_name'
    and br.name is distinct from b->>'name';

  -- 2c. Cultivars: every public field, upserted on slug.
  insert into public.cultivars (
    id, breeder_id, canonical_name, normalized_name, slug, life_cycle,
    seed_expression, market_classification, lineage_text, description,
    difficulty, height_category, chemotype, flowering_days_min,
    flowering_days_max, flowering_window_label, stretch_min, stretch_max,
    yield_indoor_g_per_m2_min, yield_indoor_g_per_m2_max, thc_pct_min,
    thc_pct_max, cbd_pct_min, cbd_pct_max, dominant_terpenes,
    pheno_hunt_focus, sample_phenos, publication_status, verification_status,
    data_origin, last_verified_at
  )
  select
    (c->>'id')::uuid,
    (select br.id from public.breeders br
      where br.normalized_name = c->>'breeder_normalized_name'),
    c->>'canonical_name', c->>'normalized_name', c->>'slug', c->>'life_cycle',
    c->>'seed_expression', c->>'market_classification', c->>'lineage_text',
    c->>'description', c->>'difficulty', c->>'height_category', c->>'chemotype',
    (c->>'flowering_days_min')::integer, (c->>'flowering_days_max')::integer,
    c->>'flowering_window_label',
    (c->>'stretch_min')::numeric, (c->>'stretch_max')::numeric,
    (c->>'yield_indoor_g_per_m2_min')::numeric, (c->>'yield_indoor_g_per_m2_max')::numeric,
    (c->>'thc_pct_min')::numeric, (c->>'thc_pct_max')::numeric,
    (c->>'cbd_pct_min')::numeric, (c->>'cbd_pct_max')::numeric,
    array(select t.value from jsonb_array_elements_text(c->'dominant_terpenes')
            with ordinality as t(value, n) order by t.n),
    array(select t.value from jsonb_array_elements_text(c->'pheno_hunt_focus')
            with ordinality as t(value, n) order by t.n),
    c->'sample_phenos',
    c->>'publication_status', c->>'verification_status', c->>'data_origin',
    (c->>'last_verified_at')::timestamptz
  from jsonb_array_elements(payload->'cultivars') as c
  on conflict (slug) do update set
    breeder_id = excluded.breeder_id,
    canonical_name = excluded.canonical_name,
    normalized_name = excluded.normalized_name,
    life_cycle = excluded.life_cycle,
    seed_expression = excluded.seed_expression,
    market_classification = excluded.market_classification,
    lineage_text = excluded.lineage_text,
    description = excluded.description,
    difficulty = excluded.difficulty,
    height_category = excluded.height_category,
    chemotype = excluded.chemotype,
    flowering_days_min = excluded.flowering_days_min,
    flowering_days_max = excluded.flowering_days_max,
    flowering_window_label = excluded.flowering_window_label,
    stretch_min = excluded.stretch_min,
    stretch_max = excluded.stretch_max,
    yield_indoor_g_per_m2_min = excluded.yield_indoor_g_per_m2_min,
    yield_indoor_g_per_m2_max = excluded.yield_indoor_g_per_m2_max,
    thc_pct_min = excluded.thc_pct_min,
    thc_pct_max = excluded.thc_pct_max,
    cbd_pct_min = excluded.cbd_pct_min,
    cbd_pct_max = excluded.cbd_pct_max,
    dominant_terpenes = excluded.dominant_terpenes,
    pheno_hunt_focus = excluded.pheno_hunt_focus,
    sample_phenos = excluded.sample_phenos,
    publication_status = excluded.publication_status,
    verification_status = excluded.verification_status,
    data_origin = excluded.data_origin,
    last_verified_at = excluded.last_verified_at,
    updated_at = now();

  -- 2d. Aliases, upserted on (cultivar_id, normalized_alias).
  insert into public.cultivar_aliases (
    cultivar_id, alias, normalized_alias, source_id, sort_order
  )
  select cv.id, a->>'alias', a->>'normalized_alias', src.id, (a->>'sort_order')::integer
  from jsonb_array_elements(payload->'cultivars') as c
  cross join lateral jsonb_array_elements(c->'aliases') as a
  join public.cultivars cv on cv.slug = c->>'slug'
  left join public.cultivar_sources src on src.source_key = a->>'source_key'
  on conflict (cultivar_id, normalized_alias) do update set
    alias = excluded.alias,
    source_id = excluded.source_id,
    sort_order = excluded.sort_order;

  -- 2e. Profile-level sources.
  insert into public.cultivar_profile_sources (cultivar_id, source_id, sort_order)
  select cv.id, src.id, (ps->>'sort_order')::integer
  from jsonb_array_elements(payload->'cultivars') as c
  cross join lateral jsonb_array_elements(c->'profile_sources') as ps
  join public.cultivars cv on cv.slug = c->>'slug'
  join public.cultivar_sources src on src.source_key = ps->>'source_key'
  on conflict (cultivar_id, source_id) do update set
    sort_order = excluded.sort_order;

  -- 2f. Claims. Natural key: (cultivar, trait), plus the terpene name for
  -- per-terpene claims. Existing V1 rows are updated in place; missing rows
  -- are inserted with the payload's stable id.
  update public.cultivar_claims cc
  set
    value_min = (cl->>'value_min')::numeric,
    value_max = (cl->>'value_max')::numeric,
    value_text = cl->>'value_text',
    value_jsonb = nullif(cl->'value_jsonb', 'null'::jsonb),
    unit = cl->>'unit',
    context_jsonb = cl->'context',
    source_id = src.id,
    confidence = cl->>'confidence',
    verified_at = (cl->>'verified_at')::timestamptz
  from jsonb_array_elements(payload->'cultivars') as c
  cross join lateral jsonb_array_elements(c->'claims') as cl
  join public.cultivars cv on cv.slug = c->>'slug'
  join public.cultivar_sources src on src.source_key = cl->>'source_key'
  where cc.cultivar_id = cv.id
    and cc.trait_key = cl->>'trait_key'
    and (cl->>'trait_key' <> 'terpene' or cc.value_text = cl->>'value_text');

  insert into public.cultivar_claims (
    id, cultivar_id, trait_key, value_min, value_max, value_text, value_jsonb,
    unit, context_jsonb, source_id, confidence, verified_at
  )
  select
    (cl->>'id')::uuid, cv.id, cl->>'trait_key',
    (cl->>'value_min')::numeric, (cl->>'value_max')::numeric, cl->>'value_text',
    nullif(cl->'value_jsonb', 'null'::jsonb), cl->>'unit', cl->'context', src.id,
    cl->>'confidence', (cl->>'verified_at')::timestamptz
  from jsonb_array_elements(payload->'cultivars') as c
  cross join lateral jsonb_array_elements(c->'claims') as cl
  join public.cultivars cv on cv.slug = c->>'slug'
  join public.cultivar_sources src on src.source_key = cl->>'source_key'
  where not exists (
    select 1 from public.cultivar_claims cc
    where cc.cultivar_id = cv.id
      and cc.trait_key = cl->>'trait_key'
      and (cl->>'trait_key' <> 'terpene' or cc.value_text = cl->>'value_text')
  )
  on conflict (id) do nothing;

  -- 2g. Guides, upserted on (cultivar_id, version).
  insert into public.cultivar_guides (
    id, cultivar_id, base_template_id, version, title, publication_status,
    confidence, content_schema_version, last_verified_at, published_at
  )
  select
    (c->'guide'->>'id')::uuid, cv.id, tpl.id, (c->'guide'->>'version')::integer,
    c->'guide'->>'title', c->'guide'->>'publication_status', c->'guide'->>'confidence',
    (c->'guide'->>'content_schema_version')::integer,
    (c->'guide'->>'last_verified_at')::timestamptz,
    (c->'guide'->>'published_at')::timestamptz
  from jsonb_array_elements(payload->'cultivars') as c
  join public.cultivars cv on cv.slug = c->>'slug'
  left join public.cultivar_guide_templates tpl
    on tpl.template_key = c->'guide'->>'base_template_key' and tpl.version = 1
  on conflict (cultivar_id, version) do update set
    base_template_id = excluded.base_template_id,
    title = excluded.title,
    publication_status = excluded.publication_status,
    confidence = excluded.confidence,
    content_schema_version = excluded.content_schema_version,
    last_verified_at = excluded.last_verified_at,
    published_at = excluded.published_at;

  -- 2h. Guide sections: the full resolved content of all 14 sections.
  insert into public.cultivar_guide_sections (
    guide_id, section_key, sort_order, content, content_schema_version,
    confidence, last_verified_at
  )
  select
    g.id, sec->>'section_key', (sec->>'sort_order')::integer, sec->'content',
    (sec->>'content_schema_version')::integer, sec->>'confidence',
    (sec->>'last_verified_at')::timestamptz
  from jsonb_array_elements(payload->'cultivars') as c
  cross join lateral jsonb_array_elements(c->'sections') as sec
  join public.cultivars cv on cv.slug = c->>'slug'
  join public.cultivar_guides g
    on g.cultivar_id = cv.id and g.version = (c->'guide'->>'version')::integer
  on conflict (guide_id, section_key) do update set
    sort_order = excluded.sort_order,
    content = excluded.content,
    content_schema_version = excluded.content_schema_version,
    confidence = excluded.confidence,
    last_verified_at = excluded.last_verified_at;

  -- 2i. Section → source links for every cited tendency.
  insert into public.cultivar_guide_section_sources (guide_section_id, source_id, support_note)
  select gs.id, src.id, link->>'support_note'
  from jsonb_array_elements(payload->'cultivars') as c
  cross join lateral jsonb_array_elements(c->'sections') as sec
  cross join lateral jsonb_array_elements(sec->'sources') as link
  join public.cultivars cv on cv.slug = c->>'slug'
  join public.cultivar_guides g
    on g.cultivar_id = cv.id and g.version = (c->'guide'->>'version')::integer
  join public.cultivar_guide_sections gs
    on gs.guide_id = g.id and gs.section_key = sec->>'section_key'
  join public.cultivar_sources src on src.source_key = link->>'source_key'
  on conflict (guide_section_id, source_id) do update set
    support_note = excluded.support_note;
end
$verdant_cultivar_parity$;
