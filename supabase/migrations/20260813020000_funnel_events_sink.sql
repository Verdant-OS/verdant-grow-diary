-- First-party sink for the existing verdant:analytics CustomEvent mirror.
-- Every trackFunnelEvent() call already dispatches this event
-- (src/lib/funnelAnalytics.ts); nothing has listened for it in production
-- until now, so conversion counts have only ever lived in a third-party GA
-- account. This gives the founder the same counts queryable directly.
--
-- Client-authenticated INSERT via RLS, matching the base-schema convention
-- for user-owned tables ("Users insert own <table>" on grows/plants/
-- diary_entries: auth.uid() = user_id) rather than a SECURITY DEFINER RPC.
-- There is no cross-row validation to perform here, unlike the AI Doctor
-- completion writer, which must verify a spend row belongs to the caller.
--
-- Write-only from the client: no SELECT/UPDATE/DELETE policy for
-- authenticated, so a grower cannot read back their own or anyone else's
-- analytics rows (matches how GA already works today — nobody sees their
-- own pageview log). Only service_role and the operator-gated summary RPC
-- below can read this table.
--
-- No event_name CHECK enum on purpose. FUNNEL_EVENTS in
-- src/lib/funnelAnalytics.ts is the single source of truth for the catalog
-- and changes routinely (5 events were added in the session that built this
-- migration); mirroring the full list here would need a migration on every
-- catalog change and would silently reject valid events in the gap between
-- a TS change landing and the SQL catching up. The event NAME and its
-- PARAMS are validated client-side before insert
-- (decideFunnelEventSinkWrite re-runs sanitizeFunnelParams +
-- enforceFunnelEventSchema against the real catalog) — proportionate for
-- directional analytics, unlike the required-money-migrations list, which
-- deliberately IS duplicated with drift protection because it is money-
-- critical. A length bound is still enforced structurally as basic hygiene
-- against a forged or buggy event name.
CREATE TABLE IF NOT EXISTS public.funnel_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name text NOT NULL CHECK (char_length(event_name) BETWEEN 1 AND 64),
  props jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(props) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS funnel_events_name_created_idx
  ON public.funnel_events (event_name, created_at);

CREATE INDEX IF NOT EXISTS funnel_events_user_created_idx
  ON public.funnel_events (user_id, created_at);

REVOKE ALL ON TABLE public.funnel_events FROM PUBLIC;
REVOKE ALL ON TABLE public.funnel_events FROM anon;
REVOKE ALL ON TABLE public.funnel_events FROM authenticated;
-- INSERT only — see the write-only note above. Column-scoped, not
-- table-wide: a table-wide grant would let a direct REST insert (bypassing
-- the app) supply its own id or created_at, and RLS's WITH CHECK below only
-- constrains user_id. A forged created_at in particular could sit inside
-- every rolling window in funnel_events_operator_summary() below for as
-- long as the caller forward-dates it. Excluding both columns means the
-- DB — not client trust — is what keeps them real; the app's own insert
-- already only ever sends these three columns.
GRANT INSERT (user_id, event_name, props) ON TABLE public.funnel_events TO authenticated;
GRANT ALL ON TABLE public.funnel_events TO service_role;

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own funnel_events"
  ON public.funnel_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
-- No SELECT/UPDATE/DELETE policy for authenticated — write-only by design.

-- Accepted trade-off, stated rather than silently omitted: there is no
-- per-user rate limit on this table. A signed-in grower who dispatched fake
-- verdant:analytics events from devtools could inflate their OWN row count,
-- but RLS confines every insert to auth.uid() = user_id — there is no
-- cross-account read, write, or privilege-escalation path. Directional
-- analytics tolerates this the same way GA already does (anyone can already
-- call gtag('event', ...) from devtools). The column-scoped INSERT grant
-- above means a forged row still can't backdate/forward-date created_at, so
-- this inflation ages out of the rolling windows below like a real row would.
CREATE OR REPLACE FUNCTION public.funnel_events_operator_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_counts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT public.has_role(auth.uid(), 'operator'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operator_required');
  END IF;

  -- Aggregate only. No user_id, no per-row data ever leaves this function —
  -- counts by event name, in three rolling windows plus all-time.
  SELECT COALESCE(jsonb_agg(counts), '[]'::jsonb)
    INTO v_counts
  FROM (
    SELECT
      event_name,
      count(*)::bigint AS total,
      count(*) FILTER (WHERE created_at > now() - interval '1 day')::bigint AS last_24h,
      count(*) FILTER (WHERE created_at > now() - interval '7 days')::bigint AS last_7d,
      count(*) FILTER (WHERE created_at > now() - interval '30 days')::bigint AS last_30d
    FROM public.funnel_events
    GROUP BY event_name
    ORDER BY total DESC
  ) AS counts;

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'counts_by_event', v_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.funnel_events_operator_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.funnel_events_operator_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.funnel_events_operator_summary() TO authenticated;

COMMENT ON TABLE public.funnel_events IS
  'First-party sink for the verdant:analytics client bridge (funnelAnalytics.ts). Write-only from the client; the app pre-validates event name against the real catalog and params against that event''s own key schema before insert. Value-shape sanitization (are param values actually enum-like, not free text) happens in sanitizeFunnelParams and is a property of that shared module, not enforced by this table.';

COMMENT ON FUNCTION public.funnel_events_operator_summary() IS
  'Operator-only aggregate event counts (total/24h/7d/30d) per funnel event name. No user_id, no per-row data — counts only.';
