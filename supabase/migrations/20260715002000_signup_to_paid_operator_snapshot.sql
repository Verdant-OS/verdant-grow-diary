-- Operator-only signup-to-active-paid acquisition snapshot.
--
-- This function joins immutable, analytics-only first-touch attribution to
-- the authoritative billing entitlement table. It returns fixed aggregate
-- cohorts only: no email, user ID, provider identifier, raw metadata, or row
-- payload leaves the database. It performs no writes.

CREATE OR REPLACE FUNCTION public.signup_to_paid_operator_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_counts jsonb;
  v_sources jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT public.has_role(auth.uid(), 'operator'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operator_required');
  END IF;

  WITH source_keys(source) AS (
    VALUES
      ('landing_page'::text),
      ('pricing_page'::text),
      ('founder_page'::text),
      ('founder_share'::text),
      ('pricing_interest_share'::text),
      ('grower_invite'::text),
      ('context_check'::text),
      ('vpd_calculator'::text),
      ('unattributed'::text)
  ),
  account_counts AS (
    SELECT
      COALESCE(a.source, 'unattributed') AS source,
      count(*)::bigint AS accounts
    FROM public.profiles AS p
    LEFT JOIN public.signup_acquisition_attributions AS a
      ON a.user_id = p.user_id
    GROUP BY COALESCE(a.source, 'unattributed')
  ),
  active_paid AS (
    SELECT DISTINCT bs.user_id
    FROM public.billing_subscriptions AS bs
    WHERE bs.plan_id IN ('pro_monthly', 'pro_annual', 'founder_lifetime')
      AND bs.status = 'active'
      AND (bs.current_period_end IS NULL OR bs.current_period_end > now())
  ),
  paid_counts AS (
    SELECT
      COALESCE(a.source, 'unattributed') AS source,
      count(*)::bigint AS active_paid
    FROM active_paid AS ap
    LEFT JOIN public.signup_acquisition_attributions AS a
      ON a.user_id = ap.user_id
    GROUP BY COALESCE(a.source, 'unattributed')
  ),
  source_counts AS (
    SELECT
      sk.source,
      COALESCE(ac.accounts, 0)::bigint AS accounts,
      COALESCE(pc.active_paid, 0)::bigint AS active_paid
    FROM source_keys AS sk
    LEFT JOIN account_counts AS ac ON ac.source = sk.source
    LEFT JOIN paid_counts AS pc ON pc.source = sk.source
  )
  SELECT
    jsonb_build_object(
      'accounts_total', COALESCE(sum(sc.accounts), 0),
      'active_paid_total', COALESCE(sum(sc.active_paid), 0),
      'attributed_accounts_total', COALESCE(sum(sc.accounts) FILTER (WHERE sc.source <> 'unattributed'), 0),
      'attributed_active_paid_total', COALESCE(sum(sc.active_paid) FILTER (WHERE sc.source <> 'unattributed'), 0),
      'unattributed_accounts_total', COALESCE(max(sc.accounts) FILTER (WHERE sc.source = 'unattributed'), 0),
      'unattributed_active_paid_total', COALESCE(max(sc.active_paid) FILTER (WHERE sc.source = 'unattributed'), 0)
    ),
    jsonb_object_agg(
      sc.source,
      jsonb_build_object('accounts', sc.accounts, 'active_paid', sc.active_paid)
      ORDER BY sc.source
    )
  INTO v_counts, v_sources
  FROM source_counts AS sc;

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'counts', COALESCE(v_counts, '{}'::jsonb),
    'sources', COALESCE(v_sources, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.signup_to_paid_operator_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_to_paid_operator_snapshot() FROM anon;
GRANT EXECUTE ON FUNCTION public.signup_to_paid_operator_snapshot() TO authenticated;

COMMENT ON FUNCTION public.signup_to_paid_operator_snapshot() IS
  'Operator-only, read-only acquisition cohort snapshot. Joins analytics-only first-touch signup attribution to authoritative active paid entitlements and returns fixed aggregate counts only.';
