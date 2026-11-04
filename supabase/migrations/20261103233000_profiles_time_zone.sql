-- Grower time zone on the profile (grower bug brief 2026-11-03, item 12).
-- Spec: docs/specs/user-time-zone-profile-setting.md (PR #2820).
--
-- Additive only. NULL means "follow the browser", which is today's behavior,
-- so existing rows are unchanged and nothing is backfilled. RLS is unchanged:
-- "Users update own profile" (20260515204616) already limits writes to the
-- owner's row, and profiles_block_gamification_updates() still blocks
-- nugs_total, level and tier.

alter table public.profiles
  add column if not exists time_zone text null;

comment on column public.profiles.time_zone is
  'Grower-chosen IANA zone for displaying and entering times (e.g. America/Chicago). NULL = follow the browser. Must name a zone in pg_timezone_names.';

-- A CHECK cannot hold a subquery, so validation lives in a small SQL function.
-- SECURITY INVOKER: it only reads the public pg_timezone_names view.
create or replace function public.profiles_time_zone_is_valid(z text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select z is null
    or (length(z) <= 64 and exists (
      select 1 from pg_catalog.pg_timezone_names where name = z
    ))
$$;

-- The CHECK runs with the writer's privileges, so the roles that write
-- profiles need EXECUTE; anon never writes profiles.
revoke all on function public.profiles_time_zone_is_valid(text) from public, anon;
grant execute on function public.profiles_time_zone_is_valid(text) to authenticated, service_role;

alter table public.profiles
  drop constraint if exists profiles_time_zone_valid;
alter table public.profiles
  add constraint profiles_time_zone_valid
  check (public.profiles_time_zone_is_valid(time_zone));
