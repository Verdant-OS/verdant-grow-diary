-- Strain Reference Library V1
-- Public read-only cultivar references, source-backed claims, immutable guide
-- versions, and future server/admin-only import staging.
--
-- Safety boundaries:
--   * no plants/grows/tents/sensors/alerts/action_queue/AI tables are touched;
--   * anon/authenticated receive SELECT only on published reference data;
--   * import staging has no client grants or write policies;
--   * seed rows are explicitly labeled sample/reference data.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.breeders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  slug text not null unique,
  website_url text,
  verification_status text not null default 'unreviewed'
    check (verification_status in ('unreviewed', 'reviewed', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table if not exists public.cultivars (
  id uuid primary key default gen_random_uuid(),
  breeder_id uuid references public.breeders(id) on delete set null,
  canonical_name text not null,
  normalized_name text not null,
  slug text not null unique,
  life_cycle text not null default 'unknown'
    check (life_cycle in ('photoperiod', 'autoflower', 'unknown')),
  seed_expression text not null default 'unknown'
    check (seed_expression in ('regular', 'feminized', 'clone_only', 'unknown')),
  market_classification text not null default 'unknown'
    check (market_classification in ('indica', 'sativa', 'hybrid', 'unknown')),
  lineage_text text,
  description text not null default '',
  difficulty text not null default 'unknown'
    check (difficulty in ('beginner', 'intermediate', 'advanced', 'unknown')),
  height_category text not null default 'unknown'
    check (height_category in ('short', 'medium', 'tall', 'variable', 'unknown')),
  chemotype text not null default 'unknown'
    check (chemotype in ('type_i', 'type_ii', 'type_iii', 'type_iv', 'type_v', 'unknown')),
  flowering_days_min integer,
  flowering_days_max integer,
  stretch_min numeric(6,2),
  stretch_max numeric(6,2),
  yield_indoor_g_per_m2_min numeric(10,2),
  yield_indoor_g_per_m2_max numeric(10,2),
  thc_pct_min numeric(6,2),
  thc_pct_max numeric(6,2),
  cbd_pct_min numeric(6,2),
  cbd_pct_max numeric(6,2),
  dominant_terpenes text[] not null default '{}',
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published', 'archived')),
  verification_status text not null default 'sample'
    check (verification_status in ('sample', 'community', 'reviewed', 'verified', 'archived')),
  data_origin text not null default 'seed'
    check (data_origin in ('seed', 'editorial', 'import', 'community', 'ai_draft')),
  last_verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(canonical_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(lineage_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored,
  check (flowering_days_min is null or flowering_days_min between 1 and 365),
  check (flowering_days_max is null or flowering_days_max between 1 and 365),
  check (flowering_days_min is null or flowering_days_max is null or flowering_days_min <= flowering_days_max),
  check (stretch_min is null or stretch_min >= 0),
  check (stretch_max is null or stretch_max >= 0),
  check (stretch_min is null or stretch_max is null or stretch_min <= stretch_max),
  check (yield_indoor_g_per_m2_min is null or yield_indoor_g_per_m2_min >= 0),
  check (yield_indoor_g_per_m2_max is null or yield_indoor_g_per_m2_max >= 0),
  check (yield_indoor_g_per_m2_min is null or yield_indoor_g_per_m2_max is null or yield_indoor_g_per_m2_min <= yield_indoor_g_per_m2_max),
  check (thc_pct_min is null or thc_pct_min between 0 and 100),
  check (thc_pct_max is null or thc_pct_max between 0 and 100),
  check (thc_pct_min is null or thc_pct_max is null or thc_pct_min <= thc_pct_max),
  check (cbd_pct_min is null or cbd_pct_min between 0 and 100),
  check (cbd_pct_max is null or cbd_pct_max between 0 and 100),
  check (cbd_pct_min is null or cbd_pct_max is null or cbd_pct_min <= cbd_pct_max)
);

create unique index if not exists cultivars_identity_unique_idx
  on public.cultivars (
    coalesce(breeder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    normalized_name,
    life_cycle,
    seed_expression
  );

create table if not exists public.cultivar_aliases (
  id uuid primary key default gen_random_uuid(),
  cultivar_id uuid not null references public.cultivars(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source_id uuid,
  created_at timestamptz not null default now(),
  unique (cultivar_id, normalized_alias)
);

create table if not exists public.cultivar_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  title text not null,
  publisher text not null,
  url text not null,
  source_type text not null
    check (source_type in ('breeder', 'laboratory', 'horticultural_reference', 'grower_report', 'community', 'verdant_editorial')),
  author text,
  published_at date,
  retrieved_at timestamptz not null,
  license_or_usage_notes text not null,
  notes text,
  created_at timestamptz not null default now(),
  check (url ~ '^https://')
);

alter table public.cultivar_aliases
  drop constraint if exists cultivar_aliases_source_id_fkey;
alter table public.cultivar_aliases
  add constraint cultivar_aliases_source_id_fkey
  foreign key (source_id) references public.cultivar_sources(id) on delete set null;

create table if not exists public.cultivar_claims (
  id uuid primary key default gen_random_uuid(),
  cultivar_id uuid not null references public.cultivars(id) on delete cascade,
  trait_key text not null,
  value_min numeric,
  value_max numeric,
  value_text text,
  value_jsonb jsonb,
  unit text,
  context_jsonb jsonb not null default '{}'::jsonb,
  source_id uuid not null references public.cultivar_sources(id) on delete restrict,
  confidence text not null default 'community'
    check (confidence in ('high', 'medium', 'community')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (value_min is null or value_max is null or value_min <= value_max),
  check (value_min is not null or value_max is not null or value_text is not null or value_jsonb is not null)
);

create table if not exists public.cultivar_guide_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  life_cycle text not null
    check (life_cycle in ('photoperiod', 'autoflower', 'unknown')),
  medium_scope text not null default 'general',
  version integer not null check (version > 0),
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published', 'archived')),
  content_schema_version integer not null default 1 check (content_schema_version > 0),
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (template_key, version)
);

create table if not exists public.cultivar_guides (
  id uuid primary key default gen_random_uuid(),
  cultivar_id uuid not null references public.cultivars(id) on delete cascade,
  base_template_id uuid references public.cultivar_guide_templates(id) on delete restrict,
  version integer not null check (version > 0),
  title text not null,
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published', 'archived')),
  confidence text not null default 'community'
    check (confidence in ('high', 'medium', 'community')),
  content_schema_version integer not null default 1 check (content_schema_version > 0),
  last_verified_at timestamptz,
  published_at timestamptz,
  supersedes_id uuid references public.cultivar_guides(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (cultivar_id, version)
);

create table if not exists public.cultivar_guide_sections (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.cultivar_guides(id) on delete cascade,
  section_key text not null
    check (section_key in ('overview', 'germination', 'early_growth', 'vegetative', 'flowering', 'environment', 'watering', 'nutrition', 'training', 'common_issues', 'harvest', 'post_harvest', 'pheno_tips', 'missing_information')),
  sort_order integer not null check (sort_order >= 0),
  content jsonb not null,
  content_schema_version integer not null default 1 check (content_schema_version > 0),
  confidence text not null default 'community'
    check (confidence in ('high', 'medium', 'community')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (guide_id, section_key)
);

create table if not exists public.cultivar_guide_section_sources (
  guide_section_id uuid not null references public.cultivar_guide_sections(id) on delete cascade,
  source_id uuid not null references public.cultivar_sources(id) on delete restrict,
  support_note text not null,
  created_at timestamptz not null default now(),
  primary key (guide_section_id, source_id)
);

create table if not exists public.cultivar_import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_checksum text not null unique,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'parsing', 'review', 'approved', 'rejected', 'applied', 'failed')),
  created_by uuid references auth.users(id) on delete set null,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.cultivar_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.cultivar_import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_payload jsonb not null,
  normalized_payload jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  proposed_action text
    check (proposed_action in ('create', 'update', 'alias', 'skip', 'review')),
  matched_cultivar_id uuid references public.cultivars(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'valid', 'invalid', 'approved', 'rejected', 'applied')),
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create index if not exists cultivars_search_document_gin_idx
  on public.cultivars using gin (search_document);
create index if not exists cultivars_normalized_name_trgm_idx
  on public.cultivars using gin (normalized_name gin_trgm_ops);
create index if not exists cultivar_aliases_normalized_trgm_idx
  on public.cultivar_aliases using gin (normalized_alias gin_trgm_ops);
create index if not exists cultivars_breeder_idx on public.cultivars (breeder_id);
create index if not exists cultivars_life_cycle_idx on public.cultivars (life_cycle);
create index if not exists cultivars_difficulty_idx on public.cultivars (difficulty);
create index if not exists cultivars_flowering_days_idx
  on public.cultivars (flowering_days_min, flowering_days_max);
create index if not exists cultivars_verification_status_idx
  on public.cultivars (verification_status);
create index if not exists cultivars_published_name_idx
  on public.cultivars (canonical_name, breeder_id)
  where publication_status = 'published';
create index if not exists cultivar_aliases_cultivar_idx
  on public.cultivar_aliases (cultivar_id);
create index if not exists cultivar_claims_cultivar_trait_idx
  on public.cultivar_claims (cultivar_id, trait_key);
create index if not exists cultivar_claims_source_idx
  on public.cultivar_claims (source_id);
create index if not exists cultivar_guides_published_idx
  on public.cultivar_guides (cultivar_id, version desc)
  where publication_status = 'published';
create index if not exists cultivar_guide_sections_order_idx
  on public.cultivar_guide_sections (guide_id, sort_order);
create index if not exists cultivar_import_rows_batch_status_idx
  on public.cultivar_import_rows (batch_id, status);

alter table public.breeders enable row level security;
alter table public.cultivars enable row level security;
alter table public.cultivar_aliases enable row level security;
alter table public.cultivar_sources enable row level security;
alter table public.cultivar_claims enable row level security;
alter table public.cultivar_guide_templates enable row level security;
alter table public.cultivar_guides enable row level security;
alter table public.cultivar_guide_sections enable row level security;
alter table public.cultivar_guide_section_sources enable row level security;
alter table public.cultivar_import_batches enable row level security;
alter table public.cultivar_import_rows enable row level security;

revoke all on public.breeders from public, anon, authenticated;
revoke all on public.cultivars from public, anon, authenticated;
revoke all on public.cultivar_aliases from public, anon, authenticated;
revoke all on public.cultivar_sources from public, anon, authenticated;
revoke all on public.cultivar_claims from public, anon, authenticated;
revoke all on public.cultivar_guide_templates from public, anon, authenticated;
revoke all on public.cultivar_guides from public, anon, authenticated;
revoke all on public.cultivar_guide_sections from public, anon, authenticated;
revoke all on public.cultivar_guide_section_sources from public, anon, authenticated;
revoke all on public.cultivar_import_batches from public, anon, authenticated;
revoke all on public.cultivar_import_rows from public, anon, authenticated;

create policy "public can read breeder references"
  on public.breeders for select to anon, authenticated using (true);
create policy "public can read published cultivars"
  on public.cultivars for select to anon, authenticated
  using (publication_status = 'published');
create policy "public can read aliases of published cultivars"
  on public.cultivar_aliases for select to anon, authenticated
  using (exists (
    select 1 from public.cultivars c
    where c.id = cultivar_aliases.cultivar_id
      and c.publication_status = 'published'
  ));
create policy "public can read reference sources"
  on public.cultivar_sources for select to anon, authenticated using (true);
create policy "public can read claims of published cultivars"
  on public.cultivar_claims for select to anon, authenticated
  using (exists (
    select 1 from public.cultivars c
    where c.id = cultivar_claims.cultivar_id
      and c.publication_status = 'published'
  ));
create policy "public can read published guide templates"
  on public.cultivar_guide_templates for select to anon, authenticated
  using (publication_status = 'published');
create policy "public can read published cultivar guides"
  on public.cultivar_guides for select to anon, authenticated
  using (
    publication_status = 'published'
    and exists (
      select 1 from public.cultivars c
      where c.id = cultivar_guides.cultivar_id
        and c.publication_status = 'published'
    )
  );
create policy "public can read sections of published guides"
  on public.cultivar_guide_sections for select to anon, authenticated
  using (exists (
    select 1
    from public.cultivar_guides g
    join public.cultivars c on c.id = g.cultivar_id
    where g.id = cultivar_guide_sections.guide_id
      and g.publication_status = 'published'
      and c.publication_status = 'published'
  ));
create policy "public can read sources of published guide sections"
  on public.cultivar_guide_section_sources for select to anon, authenticated
  using (exists (
    select 1
    from public.cultivar_guide_sections s
    join public.cultivar_guides g on g.id = s.guide_id
    join public.cultivars c on c.id = g.cultivar_id
    where s.id = cultivar_guide_section_sources.guide_section_id
      and g.publication_status = 'published'
      and c.publication_status = 'published'
  ));

-- Explicit SELECT-only client grants. Import staging remains server/admin-only.
grant select on public.breeders to anon, authenticated;
grant select on public.cultivars to anon, authenticated;
grant select on public.cultivar_aliases to anon, authenticated;
grant select on public.cultivar_sources to anon, authenticated;
grant select on public.cultivar_claims to anon, authenticated;
grant select on public.cultivar_guide_templates to anon, authenticated;
grant select on public.cultivar_guides to anon, authenticated;
grant select on public.cultivar_guide_sections to anon, authenticated;
grant select on public.cultivar_guide_section_sources to anon, authenticated;

-- Seed sources. These are citations and directional public summaries, not
-- copied marketing text or batch-specific laboratory truth.
insert into public.cultivar_sources (
  id, source_key, title, publisher, url, source_type, retrieved_at,
  license_or_usage_notes
) values
  ('51000000-0000-4000-8000-000000000001', 'watts-2021-terpene-genetics', 'Cannabis labelling is associated with genetic variation in terpene synthase genes', 'Nature Plants', 'https://www.nature.com/articles/s41477-021-01003-y', 'horticultural_reference', '2026-07-22T00:00:00Z', 'Citation and high-level paraphrase only; no article text is reproduced.'),
  ('51000000-0000-4000-8000-000000000002', 'cannabinoid-method-context-2019', 'Analytical considerations for cannabinoid measurement in cannabis', 'PubMed-indexed literature', 'https://pubmed.ncbi.nlm.nih.gov/31849137/', 'laboratory', '2026-07-22T00:00:00Z', 'Citation and method context only; no publication text is reproduced.'),
  ('51000000-0000-4000-8000-000000000003', 'cannabinoid-spatial-variability-2025', 'Cannabinoid variability across cannabis plant material', 'PubMed-indexed literature', 'https://pubmed.ncbi.nlm.nih.gov/40651988/', 'laboratory', '2026-07-22T00:00:00Z', 'Citation and variability context only; no publication text is reproduced.'),
  ('51000000-0000-4000-8000-000000000004', 'chemotype-genomics-2021', 'Cannabinoid oxidocyclase copy number and chemotype variation', 'Genome Biology and Evolution', 'https://academic.oup.com/gbe/article/13/8/evab130/6294932', 'horticultural_reference', '2026-07-22T00:00:00Z', 'Citation and high-level genetic context only; no publication text is reproduced.'),
  ('51000000-0000-4000-8000-000000000101', 'sour-diesel-public-profile', 'Sour Diesel cultivar information', 'Leafly', 'https://www.leafly.com/strains/sour-diesel', 'community', '2026-07-22T00:00:00Z', 'Directional public source; Verdant copy is original and cautious.'),
  ('51000000-0000-4000-8000-000000000102', 'og-kush-public-profile', 'OG Kush cultivar information', 'Leafly', 'https://www.leafly.com/strains/og-kush', 'community', '2026-07-22T00:00:00Z', 'Directional public source; Verdant copy is original and cautious.'),
  ('51000000-0000-4000-8000-000000000103', 'blue-dream-public-profile', 'Blue Dream cultivar information', 'Leafly', 'https://www.leafly.com/strains/blue-dream', 'community', '2026-07-22T00:00:00Z', 'Directional public source; Verdant copy is original and cautious.'),
  ('51000000-0000-4000-8000-000000000104', 'gg4-public-profile', 'Original Glue cultivar information', 'Leafly', 'https://www.leafly.com/strains/original-glue', 'community', '2026-07-22T00:00:00Z', 'Directional public source; Verdant copy is original and cautious.'),
  ('51000000-0000-4000-8000-000000000105', 'lemon-cherry-gelato-public-profile', 'Lemon Cherry Gelato cultivar information', 'Leafly', 'https://www.leafly.com/strains/lemon-cherry-gelato', 'community', '2026-07-22T00:00:00Z', 'Directional public source; Verdant copy is original and cautious.'),
  ('51000000-0000-4000-8000-000000000106', 'oreoz-public-profile', 'Oreoz cultivar information', 'Leafly', 'https://www.leafly.com/strains/oreoz', 'community', '2026-07-22T00:00:00Z', 'Directional public source; Verdant copy is original and cautious.'),
  ('51000000-0000-4000-8000-000000000107', 'do-si-dos-public-profile', 'Do-Si-Dos cultivar information', 'Leafly', 'https://www.leafly.com/strains/do-si-dos', 'community', '2026-07-22T00:00:00Z', 'Directional public source; Verdant copy is original and cautious.'),
  ('51000000-0000-4000-8000-000000000108', 'blue-cookies-public-profile', 'Blue Cookies cultivar information', 'Leafly', 'https://www.leafly.com/strains/blue-cookies', 'community', '2026-07-22T00:00:00Z', 'Directional public source; Verdant copy is original and cautious.'),
  ('51000000-0000-4000-8000-000000000109', 'jack-herer-public-profile', 'Jack Herer cultivar information', 'Leafly', 'https://www.leafly.com/strains/jack-herer', 'community', '2026-07-22T00:00:00Z', 'Directional public source; Verdant copy is original and cautious.'),
  ('51000000-0000-4000-8000-000000000110', 'sour-stomper-product-info', 'Sour Stomper product information', 'Mephisto Genetics', 'https://eu.mephistogenetics.com/products/sour-stomper', 'breeder', '2026-07-22T00:00:00Z', 'Used for breeder-reported identity and timing context; copy is not reproduced.')
on conflict (source_key) do update set
  title = excluded.title,
  publisher = excluded.publisher,
  url = excluded.url,
  source_type = excluded.source_type,
  retrieved_at = excluded.retrieved_at,
  license_or_usage_notes = excluded.license_or_usage_notes;

insert into public.breeders (
  id, name, normalized_name, slug, website_url, verification_status
) values
  ('52000000-0000-4000-8000-000000000001', 'GG Strains LLC', 'gg strains llc', 'gg-strains', null, 'reviewed'),
  ('52000000-0000-4000-8000-000000000002', '3rd Coast Genetics', '3rd coast genetics', '3rd-coast-genetics', null, 'reviewed'),
  ('52000000-0000-4000-8000-000000000003', 'Archive Seed Bank', 'archive seed bank', 'archive-seed-bank', null, 'reviewed'),
  ('52000000-0000-4000-8000-000000000004', 'Sensi Seeds', 'sensi seeds', 'sensi-seeds', 'https://sensiseeds.com/', 'reviewed'),
  ('52000000-0000-4000-8000-000000000005', 'Mephisto Genetics', 'mephisto genetics', 'mephisto-genetics', 'https://eu.mephistogenetics.com/', 'reviewed')
on conflict (normalized_name) do update set
  name = excluded.name,
  slug = excluded.slug,
  website_url = excluded.website_url,
  verification_status = excluded.verification_status;

insert into public.cultivar_guide_templates (
  id, template_key, life_cycle, medium_scope, version, publication_status,
  content_schema_version, content
) values
  ('53000000-0000-4000-8000-000000000001', 'photoperiod_general', 'photoperiod', 'general', 1, 'published', 1,
   jsonb_build_object('positioning', 'Shared photoperiod fundamentals; cultivar overlays contain only reported tendencies.', 'safety', jsonb_build_array('Environmental stability first', 'Root-zone correctness before nutrient changes', 'No universal recipe or device control'))),
  ('53000000-0000-4000-8000-000000000002', 'autoflower_general', 'autoflower', 'general', 1, 'published', 1,
   jsonb_build_object('positioning', 'Shared autoflower fundamentals with conservative recovery and training posture.', 'safety', jsonb_build_array('Avoid unnecessary transplant shock', 'Avoid high-stress recovery tactics', 'Stable VPD, watering, and root health first')))
on conflict (template_key, version) do update set
  life_cycle = excluded.life_cycle,
  medium_scope = excluded.medium_scope,
  publication_status = excluded.publication_status,
  content_schema_version = excluded.content_schema_version,
  content = excluded.content;

with seed_cultivars as (
  select * from (values
    ('54000000-0000-4000-8000-000000000001'::uuid, null::uuid, 'Sour Diesel', 'sour diesel', 'sour-diesel', 'photoperiod', 'unknown', 'sativa', 'Commonly reported as Chemdog-family genetics; exact origin remains disputed', 'A source-backed sample reference for a widely circulated name, with fuel/citrus/pine direction and substantial phenotype variability.', 'advanced', 'tall', 'type_i', 77, 84, 1.80::numeric, 3.00::numeric, 20.00::numeric, 26.00::numeric, null::numeric, null::numeric, array['myrcene','limonene','beta-caryophyllene']::text[]),
    ('54000000-0000-4000-8000-000000000002', null, 'OG Kush', 'og kush', 'og-kush', 'photoperiod', 'unknown', 'hybrid', 'Widely disputed; commonly associated with Chemdog, Hindu Kush, and regional OG lines', 'A directional reference for the broad OG Kush name; cut, breeder, chemistry, and structure can differ.', 'intermediate', 'medium', 'type_i', 49, 56, 1.40, 2.20, 18.00, 26.00, null, null, array['myrcene','limonene','beta-caryophyllene']),
    ('54000000-0000-4000-8000-000000000003', null, 'Blue Dream', 'blue dream', 'blue-dream', 'photoperiod', 'unknown', 'hybrid', 'Commonly reported as Blueberry × Haze', 'A sample profile for a commonly reported vigorous, berry/herbal/pine cultivar name.', 'beginner', 'tall', 'type_i', 63, 70, 1.60, 2.50, 21.00, 24.00, null, null, array['myrcene','alpha-pinene','beta-caryophyllene']),
    ('54000000-0000-4000-8000-000000000004', '52000000-0000-4000-8000-000000000001', 'Original Glue (GG4)', 'original glue gg4', 'gg4', 'photoperiod', 'clone_only', 'hybrid', 'Chem''s Sister × Sour Dubb × Chocolate Diesel', 'A clone-associated sample reference often described as vigorous, resinous, earthy, and caryophyllene-forward.', 'intermediate', 'tall', 'type_i', 56, 63, 1.60, 2.50, 27.00, 30.00, null, null, array['beta-caryophyllene','myrcene','limonene']),
    ('54000000-0000-4000-8000-000000000005', null, 'Lemon Cherry Gelato', 'lemon cherry gelato', 'lemon-cherry-gelato', 'photoperiod', 'unknown', 'hybrid', 'Commonly reported as Sunset Sherbet × Girl Scout Cookies, with release identity varying', 'A source-backed sample reference for citrus, fruit, and dessert direction without fixed chemistry claims.', 'intermediate', 'medium', 'type_i', 56, 70, 1.30, 2.00, 20.00, 30.00, null, null, array['limonene','beta-caryophyllene','linalool']),
    ('54000000-0000-4000-8000-000000000006', '52000000-0000-4000-8000-000000000002', 'Oreoz', 'oreoz', 'oreoz', 'photoperiod', 'unknown', 'hybrid', 'Cookies & Cream × Secret Weapon', 'A resin/dessert/fuel directional profile that leaves unsupported timing and chemistry summaries blank.', 'intermediate', 'short', 'unknown', null, null, null, null, null, null, null, null, array['beta-caryophyllene','limonene','myrcene']),
    ('54000000-0000-4000-8000-000000000007', '52000000-0000-4000-8000-000000000003', 'Do-Si-Dos', 'do si dos', 'do-si-dos', 'photoperiod', 'unknown', 'hybrid', 'OGKB (Girl Scout Cookies phenotype) × Face Off OG', 'A sweet/earth/floral/fuel sample reference with resin emphasis and explicit uncertainty.', 'intermediate', 'medium', 'type_i', 56, 70, 1.30, 2.00, 20.00, 30.00, null, null, array['limonene','beta-caryophyllene','linalool']),
    ('54000000-0000-4000-8000-000000000008', null, 'Blue Cookies', 'blue cookies', 'blue-cookies', 'photoperiod', 'unknown', 'hybrid', 'Commonly reported as Girl Scout Cookies × Blueberry', 'A fruit/berry/earth/dessert sample reference that does not promise color or chemistry.', 'beginner', 'medium', 'type_i', 56, 63, 1.20, 1.80, 18.00, 25.00, null, null, array['beta-caryophyllene','limonene','myrcene']),
    ('54000000-0000-4000-8000-000000000009', '52000000-0000-4000-8000-000000000004', 'Jack Herer', 'jack herer', 'jack-herer', 'photoperiod', 'regular', 'sativa', 'Commonly reported as Haze × Northern Lights #5 × Shiva Skunk', 'A long-circulating sample reference associated with spicy, pine, herbal, and terpinolene-forward reports.', 'intermediate', 'tall', 'type_i', 56, 70, 1.50, 2.50, 18.00, 24.00, null, null, array['terpinolene','alpha-pinene','beta-caryophyllene']),
    ('54000000-0000-4000-8000-000000000010', '52000000-0000-4000-8000-000000000005', 'Sour Stomper', 'sour stomper', 'sour-stomper', 'autoflower', 'feminized', 'hybrid', 'Breeder-reported Grapestomper OG × Sour Crack', 'The V1 autoflower sample reference, with breeder-reported timing and a conservative recovery/training posture.', 'intermediate', 'medium', 'unknown', 65, 75, null, null, 18.00, 24.00, null, null, array['limonene','beta-caryophyllene','myrcene'])
  ) as v(id, breeder_id, canonical_name, normalized_name, slug, life_cycle, seed_expression, market_classification, lineage_text, description, difficulty, height_category, chemotype, flowering_days_min, flowering_days_max, stretch_min, stretch_max, thc_pct_min, thc_pct_max, cbd_pct_min, cbd_pct_max, dominant_terpenes)
)
insert into public.cultivars (
  id, breeder_id, canonical_name, normalized_name, slug, life_cycle,
  seed_expression, market_classification, lineage_text, description,
  difficulty, height_category, chemotype, flowering_days_min,
  flowering_days_max, stretch_min, stretch_max, thc_pct_min, thc_pct_max,
  cbd_pct_min, cbd_pct_max, dominant_terpenes, publication_status,
  verification_status, data_origin, last_verified_at
)
select
  id, breeder_id, canonical_name, normalized_name, slug, life_cycle,
  seed_expression, market_classification, lineage_text, description,
  difficulty, height_category, chemotype, flowering_days_min,
  flowering_days_max, stretch_min, stretch_max, thc_pct_min, thc_pct_max,
  cbd_pct_min, cbd_pct_max, dominant_terpenes, 'published', 'sample', 'seed',
  '2026-07-22T00:00:00Z'::timestamptz
from seed_cultivars
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
  stretch_min = excluded.stretch_min,
  stretch_max = excluded.stretch_max,
  thc_pct_min = excluded.thc_pct_min,
  thc_pct_max = excluded.thc_pct_max,
  cbd_pct_min = excluded.cbd_pct_min,
  cbd_pct_max = excluded.cbd_pct_max,
  dominant_terpenes = excluded.dominant_terpenes,
  publication_status = excluded.publication_status,
  verification_status = excluded.verification_status,
  data_origin = excluded.data_origin,
  last_verified_at = excluded.last_verified_at,
  updated_at = now();

with alias_seed(slug, alias, source_key) as (
  values
    ('sour-diesel', 'Sour D', 'sour-diesel-public-profile'),
    ('sour-diesel', 'Sour Deez', 'sour-diesel-public-profile'),
    ('og-kush', 'OG', 'og-kush-public-profile'),
    ('blue-dream', 'Blueberry Haze', 'blue-dream-public-profile'),
    ('gg4', 'GG4', 'gg4-public-profile'),
    ('gg4', 'Gorilla Glue #4', 'gg4-public-profile'),
    ('gg4', 'Original Glue', 'gg4-public-profile'),
    ('lemon-cherry-gelato', 'LCG', 'lemon-cherry-gelato-public-profile'),
    ('oreoz', 'Oreos', 'oreoz-public-profile'),
    ('oreoz', 'Oreo Cookies', 'oreoz-public-profile'),
    ('do-si-dos', 'Dosidos', 'do-si-dos-public-profile'),
    ('do-si-dos', 'Dosi', 'do-si-dos-public-profile'),
    ('blue-cookies', 'Blue GSC', 'blue-cookies-public-profile'),
    ('jack-herer', 'Jack', 'jack-herer-public-profile'),
    ('sour-stomper', 'Sour Stomper Auto', 'sour-stomper-product-info')
)
insert into public.cultivar_aliases (cultivar_id, alias, normalized_alias, source_id)
select c.id, a.alias, lower(regexp_replace(trim(a.alias), '[^a-z0-9]+', ' ', 'gi')), s.id
from alias_seed a
join public.cultivars c on c.slug = a.slug
join public.cultivar_sources s on s.source_key = a.source_key
on conflict (cultivar_id, normalized_alias) do update set
  alias = excluded.alias,
  source_id = excluded.source_id;

with profile_source(slug, source_key) as (
  values
    ('sour-diesel', 'sour-diesel-public-profile'),
    ('og-kush', 'og-kush-public-profile'),
    ('blue-dream', 'blue-dream-public-profile'),
    ('gg4', 'gg4-public-profile'),
    ('lemon-cherry-gelato', 'lemon-cherry-gelato-public-profile'),
    ('oreoz', 'oreoz-public-profile'),
    ('do-si-dos', 'do-si-dos-public-profile'),
    ('blue-cookies', 'blue-cookies-public-profile'),
    ('jack-herer', 'jack-herer-public-profile'),
    ('sour-stomper', 'sour-stomper-product-info')
), claim_seed as (
  select c.id as cultivar_id, s.id as source_id, c.thc_pct_min, c.thc_pct_max,
         c.chemotype, c.dominant_terpenes
  from profile_source ps
  join public.cultivars c on c.slug = ps.slug
  join public.cultivar_sources s on s.source_key = ps.source_key
)
insert into public.cultivar_claims (
  cultivar_id, trait_key, value_min, value_max, value_text, value_jsonb,
  unit, context_jsonb, source_id, confidence, verified_at
)
select cultivar_id, 'reported_thc_pct', thc_pct_min, thc_pct_max, null, null, '%',
  jsonb_build_object(
    'measurement_basis', 'source_reported_summary',
    'analytical_method', 'not_reported',
    'sample_scope', 'Public cultivar profile; not one universal batch or Certificate of Analysis.',
    'variability_note', 'Expression varies by phenotype, batch, sample position, environment, harvest, post-harvest handling, storage, and laboratory method.'
  ), source_id, 'medium', '2026-07-22T00:00:00Z'::timestamptz
from claim_seed where thc_pct_min is not null or thc_pct_max is not null
union all
select cultivar_id, 'chemotype', null, null, chemotype, null, null,
  jsonb_build_object(
    'classification_basis', 'Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.',
    'variability_note', 'Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent.'
  ), source_id, 'community', '2026-07-22T00:00:00Z'::timestamptz
from claim_seed
union all
select cultivar_id, 'reported_dominant_terpenes', null, null, null,
  to_jsonb(dominant_terpenes), null,
  jsonb_build_object(
    'analytical_method', 'not_reported',
    'sample_scope', 'Public named-cultivar summary; not a batch-specific laboratory result.',
    'variability_note', 'Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method.'
  ), source_id, 'medium', '2026-07-22T00:00:00Z'::timestamptz
from claim_seed;

insert into public.cultivar_guides (
  id, cultivar_id, base_template_id, version, title, publication_status,
  confidence, content_schema_version, last_verified_at, published_at
)
select
  ('55000000-0000-4000-8000-' || lpad(row_number() over (order by c.slug)::text, 12, '0'))::uuid,
  c.id,
  case c.life_cycle
    when 'autoflower' then '53000000-0000-4000-8000-000000000002'::uuid
    else '53000000-0000-4000-8000-000000000001'::uuid
  end,
  1,
  c.canonical_name || ' sample reference guide',
  'published', 'medium', 1,
  '2026-07-22T00:00:00Z'::timestamptz,
  '2026-07-22T00:00:00Z'::timestamptz
from public.cultivars c
where c.slug in (
  'sour-diesel', 'og-kush', 'blue-dream', 'gg4', 'lemon-cherry-gelato',
  'oreoz', 'do-si-dos', 'blue-cookies', 'jack-herer', 'sour-stomper'
)
on conflict (cultivar_id, version) do update set
  base_template_id = excluded.base_template_id,
  title = excluded.title,
  publication_status = excluded.publication_status,
  confidence = excluded.confidence,
  content_schema_version = excluded.content_schema_version,
  last_verified_at = excluded.last_verified_at,
  published_at = excluded.published_at;

with section_seed(section_key, sort_order, title, summary, guidance, caution, missing_information) as (
  values
    ('overview', 10, 'Overview', 'Reference context only; the grower''s actual plant history remains authoritative.', 'Start with stage, medium, logs, photos, and source-labeled sensor history.', 'Do not convert a named-cultivar profile into a universal recipe.', 'Breeder release, phenotype, and batch identity may be incomplete.'),
    ('germination', 20, 'Germination', 'Shared germination fundamentals are not a reliable cultivar-selection signal.', 'Keep moisture and temperature stable and minimize handling.', 'Do not infer final quality from germination speed alone.', 'Cultivar-specific germination evidence is limited.'),
    ('early_growth', 30, 'Early growth', 'Evaluate early growth through stability, root-zone correctness, and observation.', 'Record emergence, leaf development, watering, and deviations before changing inputs.', 'Avoid heavy feeding or stress in response to small early differences.', 'Reliable cultivar-specific early-growth trials are limited.'),
    ('vegetative', 40, 'Vegetative growth', 'Structure can vary among phenotypes carrying the same commercial name.', 'Log internode spacing, branching, vigor, and recovery.', 'Do not infer structure or nutrient demand from market classification.', 'Matched-environment replication is usually missing.'),
    ('flowering', 50, 'Flowering', 'Reported timing is directional and should be checked against observed maturity.', 'Track first flower, stretch, resin, aroma, and finish cues.', 'Do not harvest on a catalog day number alone.', 'Sources may not define flowering day one or maturity criteria.'),
    ('environment', 60, 'Environment', 'Environmental stability matters more than a copied cultivar-name target.', 'Derive VPD only from validated temperature and humidity and compare it with stage and response.', 'Never present stale, invalid, demo, or mis-unit telemetry as healthy.', 'Controlled cultivar response curves are rarely available.'),
    ('watering', 70, 'Watering', 'Watering depends on medium, root mass, container, environment, and dryback.', 'Log volume, timing, substrate response, and plant response.', 'Do not use uncalibrated soil-moisture percentages as absolute instructions.', 'Cultivar-specific root-zone calibration is generally unavailable.'),
    ('nutrition', 80, 'Nutrition', 'Feeding descriptions are weak evidence without medium, water, EC, and response context.', 'Begin moderately and adjust from measured input and plant response.', 'Do not copy an exact nutrient dose from a reference profile.', 'Comparable nutrient-response trials are usually missing.'),
    ('training', 90, 'Training', 'Training response depends on vigor, health, timing, phenotype, and lifecycle.', 'Use low-stress structure management and record recovery before increasing intensity.', 'Avoid high-stress work when plant health or environmental stability is uncertain.', 'Controlled cultivar-specific training trials are limited.'),
    ('common_issues', 100, 'Common issues', 'Issue lists are hypotheses; symptoms still require plant and environment context.', 'Document symptoms, recent actions, photos, root-zone context, and telemetry.', 'Do not diagnose a deficiency or prescribe feed from cultivar identity alone.', 'Frequency and causal evidence for cultivar-specific problems is limited.'),
    ('harvest', 110, 'Harvest', 'Harvest timing should reflect observed maturity and intended use.', 'Record trichomes, aroma, fade, irrigation history, and the harvest rationale.', 'Do not treat reported potency or flowering time as a guaranteed endpoint.', 'Sources may not define sample position or maturity criteria.'),
    ('post_harvest', 120, 'Post-harvest', 'Drying, curing, and storage can change aroma retention and measured chemistry.', 'Record dry conditions, duration, cure observations, and final quality notes.', 'Do not close a keeper decision before post-cure evidence exists.', 'Comparable post-harvest protocols and laboratory methods are often absent.'),
    ('pheno_tips', 130, 'Pheno tips', 'Named cultivars can express different structure, aroma, chemistry, and finish.', 'Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.', 'A single attractive specimen is not proof of stability.', 'Replication count and environment matching may be unknown.'),
    ('missing_information', 140, 'Missing information', 'Uncertainty stays visible so a thin record never reads like certainty.', 'Use missing-information notes to decide what to observe, measure, photograph, or source next.', 'Do not fill missing evidence with invented values or AI-generated certainty.', 'Batch COAs, methods, phenotype identity, and matched trials are commonly absent.')
)
insert into public.cultivar_guide_sections (
  guide_id, section_key, sort_order, content, content_schema_version,
  confidence, last_verified_at
)
select
  g.id, s.section_key, s.sort_order,
  jsonb_build_object(
    'title', s.title,
    'summary', s.summary,
    'reported_tendencies', '[]'::jsonb,
    'guidance', jsonb_build_array(jsonb_build_object('text', s.guidance, 'risk', 'low')),
    'cautions', jsonb_build_array(s.caution),
    'missing_information', jsonb_build_array(s.missing_information),
    'sample_reference_data', true
  ),
  1, 'medium', '2026-07-22T00:00:00Z'::timestamptz
from public.cultivar_guides g
join public.cultivars c on c.id = g.cultivar_id
cross join section_seed s
where g.version = 1
  and c.slug in (
    'sour-diesel', 'og-kush', 'blue-dream', 'gg4', 'lemon-cherry-gelato',
    'oreoz', 'do-si-dos', 'blue-cookies', 'jack-herer', 'sour-stomper'
  )
on conflict (guide_id, section_key) do update set
  sort_order = excluded.sort_order,
  content = excluded.content,
  content_schema_version = excluded.content_schema_version,
  confidence = excluded.confidence,
  last_verified_at = excluded.last_verified_at;

with profile_source(slug, source_key) as (
  values
    ('sour-diesel', 'sour-diesel-public-profile'),
    ('og-kush', 'og-kush-public-profile'),
    ('blue-dream', 'blue-dream-public-profile'),
    ('gg4', 'gg4-public-profile'),
    ('lemon-cherry-gelato', 'lemon-cherry-gelato-public-profile'),
    ('oreoz', 'oreoz-public-profile'),
    ('do-si-dos', 'do-si-dos-public-profile'),
    ('blue-cookies', 'blue-cookies-public-profile'),
    ('jack-herer', 'jack-herer-public-profile'),
    ('sour-stomper', 'sour-stomper-product-info')
)
insert into public.cultivar_guide_section_sources (
  guide_section_id, source_id, support_note
)
select
  gs.id,
  src.id,
  'Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice.'
from profile_source ps
join public.cultivars c on c.slug = ps.slug
join public.cultivar_guides g on g.cultivar_id = c.id and g.version = 1
join public.cultivar_guide_sections gs on gs.guide_id = g.id and gs.section_key = 'overview'
join public.cultivar_sources src on src.source_key = ps.source_key
on conflict (guide_section_id, source_id) do update set
  support_note = excluded.support_note;
