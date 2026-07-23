-- Shared normalized global search layer (grows, tents, plants).
-- Recorded as a migration after being applied out-of-band; idempotent no-op.
create extension if not exists pg_trgm;

create or replace function public.verdant_normalize_search_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

create index if not exists idx_grows_name_trgm
  on public.grows using gin (public.verdant_normalize_search_text(name) gin_trgm_ops);
create index if not exists idx_tents_name_trgm
  on public.tents using gin (public.verdant_normalize_search_text(name) gin_trgm_ops);
create index if not exists idx_plants_name_trgm
  on public.plants using gin (public.verdant_normalize_search_text(name) gin_trgm_ops);

create or replace function public.verdant_search(q text, max_results int default 20)
returns table (
  entity_type text,
  id uuid,
  label text,
  sublabel text,
  match_kind text,
  rank int,
  score real
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with params as (
    select auth.uid() as uid, public.verdant_normalize_search_text(q) as nq
  ),
  hits as (
    select 'grow'::text as entity_type, g.id, g.name as label,
           coalesce(nullif(g.stage, ''), 'Grow') as sublabel,
           public.verdant_normalize_search_text(g.name) as nn
    from public.grows g cross join params p
    where g.user_id = p.uid and g.is_archived = false and p.nq <> ''
      and ( public.verdant_normalize_search_text(g.name) like '%' || p.nq || '%'
            or public.verdant_normalize_search_text(g.name) % p.nq )
    union all
    select 'tent'::text, t.id, t.name,
           coalesce(nullif(t.brand, ''), 'Tent'),
           public.verdant_normalize_search_text(t.name)
    from public.tents t cross join params p
    where t.user_id = p.uid and t.is_archived = false and p.nq <> ''
      and ( public.verdant_normalize_search_text(t.name) like '%' || p.nq || '%'
            or public.verdant_normalize_search_text(t.name) % p.nq )
    union all
    select 'plant'::text, pl.id, pl.name,
           coalesce(nullif(pl.strain, ''), 'Plant'),
           public.verdant_normalize_search_text(pl.name)
    from public.plants pl cross join params p
    where pl.user_id = p.uid and pl.is_archived = false and p.nq <> ''
      and ( public.verdant_normalize_search_text(pl.name) like '%' || p.nq || '%'
            or public.verdant_normalize_search_text(pl.name) % p.nq
            or public.verdant_normalize_search_text(coalesce(pl.strain, '')) like '%' || p.nq || '%'
            or public.verdant_normalize_search_text(coalesce(pl.strain, '')) % p.nq )
  )
  select
    h.entity_type, h.id, h.label, h.sublabel,
    case when h.nn = p.nq then 'exact'
         when h.nn like p.nq || '%' then 'prefix'
         else 'fuzzy' end as match_kind,
    case when h.nn = p.nq then 0
         when h.nn like p.nq || '%' then 1
         else 2 end as rank,
    similarity(h.nn, p.nq) as score
  from hits h cross join params p
  order by rank asc, score desc, h.label asc
  limit greatest(1, least(coalesce(max_results, 20), 50));
$$;

revoke all on function public.verdant_normalize_search_text(text) from public;
grant execute on function public.verdant_normalize_search_text(text) to authenticated;
revoke all on function public.verdant_search(text, int) from public;
revoke all on function public.verdant_search(text, int) from anon;
grant execute on function public.verdant_search(text, int) to authenticated;