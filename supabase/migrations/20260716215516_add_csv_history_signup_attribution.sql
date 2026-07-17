-- Add a fixed, analytics-only first-touch source for growers who create an
-- account from the public CSV-history acquisition path.
--
-- This source is reporting data only. raw_user_meta_data remains user-editable
-- and must never grant billing, roles, credits, Founder access, or any other
-- capability. The existing attribution table stays immutable and inaccessible
-- to anon/authenticated clients. Existing rows remain valid.

ALTER TABLE public.signup_acquisition_attributions
  DROP CONSTRAINT IF EXISTS signup_acquisition_attributions_source_check;

ALTER TABLE public.signup_acquisition_attributions
  ADD CONSTRAINT signup_acquisition_attributions_source_check CHECK (
    source IN (
      'landing_page',
      'pricing_page',
      'founder_page',
      'founder_share',
      'pricing_interest_share',
      'operator_outreach',
      'grower_invite',
      'context_check',
      'vpd_calculator',
      'csv_history'
    )
  );

-- Preserve profile creation and marketing-consent behavior while extending
-- the fixed first-touch allowlist by exactly one reporting source.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_signup_source text;
  v_marketing_opt_in boolean;
BEGIN
  v_signup_source := CASE
    WHEN NEW.raw_user_meta_data->>'verdant_signup_source' IN (
      'landing_page',
      'pricing_page',
      'founder_page',
      'founder_share',
      'pricing_interest_share',
      'operator_outreach',
      'grower_invite',
      'context_check',
      'vpd_calculator',
      'csv_history'
    ) THEN NEW.raw_user_meta_data->>'verdant_signup_source'
    ELSE NULL
  END;

  v_marketing_opt_in := CASE
    WHEN NEW.raw_user_meta_data->'marketing_opt_in' = 'true'::jsonb THEN true
    ELSE false
  END;

  INSERT INTO public.profiles (
    user_id,
    display_name,
    marketing_opt_in,
    marketing_opt_in_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_marketing_opt_in,
    CASE WHEN v_marketing_opt_in THEN COALESCE(NEW.created_at, now()) ELSE NULL END
  )
  ON CONFLICT (user_id) DO NOTHING;

  IF v_signup_source IS NOT NULL THEN
    INSERT INTO public.signup_acquisition_attributions (user_id, source, created_at)
    VALUES (NEW.id, v_signup_source, COALESCE(NEW.created_at, now()))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

-- Managed OAuth does not carry application signup metadata into auth.users.
-- Let a newly authenticated account persist one pending, fixed source without
-- ever accepting a client user_id. The time bound prevents established users
-- from rewriting missing historical attribution, and the primary key keeps
-- first touch immutable when the auth trigger already inserted a row.
CREATE OR REPLACE FUNCTION public.record_signup_acquisition_first_touch(p_source text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_created_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF p_source NOT IN (
    'landing_page',
    'pricing_page',
    'founder_page',
    'founder_share',
    'pricing_interest_share',
    'operator_outreach',
    'grower_invite',
    'context_check',
    'vpd_calculator',
    'csv_history'
  ) THEN
    RETURN false;
  END IF;

  SELECT u.created_at
  INTO v_created_at
  FROM auth.users AS u
  WHERE u.id = auth.uid();

  IF v_created_at IS NULL OR v_created_at < now() - interval '30 minutes' THEN
    RETURN false;
  END IF;

  INSERT INTO public.signup_acquisition_attributions (user_id, source, created_at)
  VALUES (auth.uid(), p_source, v_created_at)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_signup_acquisition_first_touch(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_signup_acquisition_first_touch(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_signup_acquisition_first_touch(text) TO authenticated;

COMMENT ON FUNCTION public.record_signup_acquisition_first_touch(text) IS
  'Records one analytics-only first-touch source for a newly authenticated account. Uses auth.uid(), accepts only fixed sources, never grants capabilities, and never overwrites an existing attribution.';

-- Keep account-start reporting aggregate-only and operator-only while adding
-- the CSV-history cohort.
CREATE OR REPLACE FUNCTION public.signup_acquisition_operator_snapshot()
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

  WITH profile_counts AS (
    SELECT
      count(*) AS accounts_total,
      count(*) FILTER (WHERE p.created_at >= now() - interval '7 days') AS accounts_7d
    FROM public.profiles AS p
  ),
  attribution_counts AS (
    SELECT
      count(*) AS attributed_total,
      count(*) FILTER (WHERE a.created_at >= now() - interval '7 days') AS attributed_7d,
      count(*) FILTER (WHERE a.source = 'landing_page') AS landing_page,
      count(*) FILTER (WHERE a.source = 'pricing_page') AS pricing_page,
      count(*) FILTER (WHERE a.source = 'founder_page') AS founder_page,
      count(*) FILTER (WHERE a.source = 'founder_share') AS founder_share,
      count(*) FILTER (WHERE a.source = 'pricing_interest_share') AS pricing_interest_share,
      count(*) FILTER (WHERE a.source = 'operator_outreach') AS operator_outreach,
      count(*) FILTER (WHERE a.source = 'grower_invite') AS grower_invite,
      count(*) FILTER (WHERE a.source = 'context_check') AS context_check,
      count(*) FILTER (WHERE a.source = 'vpd_calculator') AS vpd_calculator,
      count(*) FILTER (WHERE a.source = 'csv_history') AS csv_history
    FROM public.signup_acquisition_attributions AS a
  )
  SELECT jsonb_build_object(
    'accounts_total', pc.accounts_total,
    'accounts_7d', pc.accounts_7d,
    'attributed_total', ac.attributed_total,
    'attributed_7d', ac.attributed_7d,
    'unattributed_total', greatest(pc.accounts_total - ac.attributed_total, 0),
    'landing_page', ac.landing_page,
    'pricing_page', ac.pricing_page,
    'founder_page', ac.founder_page,
    'founder_share', ac.founder_share,
    'pricing_interest_share', ac.pricing_interest_share,
    'operator_outreach', ac.operator_outreach,
    'grower_invite', ac.grower_invite,
    'context_check', ac.context_check,
    'vpd_calculator', ac.vpd_calculator,
    'csv_history', ac.csv_history
  )
  INTO v_counts
  FROM profile_counts AS pc
  CROSS JOIN attribution_counts AS ac;

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'counts', COALESCE(v_counts, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.signup_acquisition_operator_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_acquisition_operator_snapshot() FROM anon;
GRANT EXECUTE ON FUNCTION public.signup_acquisition_operator_snapshot() TO authenticated;

COMMENT ON FUNCTION public.signup_acquisition_operator_snapshot() IS
  'Operator-only, read-only account-start attribution counts. Returns no email, user ID, provider ID, raw metadata, or billing entitlement.';

-- Keep signup-to-active-paid reporting on the existing deduplicated,
-- authoritative paid union and add the CSV-history cohort key.
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
      ('operator_outreach'::text),
      ('grower_invite'::text),
      ('context_check'::text),
      ('vpd_calculator'::text),
      ('csv_history'::text),
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
  active_paid_candidates AS (
    SELECT
      bs.user_id,
      bs.plan_id,
      bs.created_at,
      0 AS source_priority
    FROM public.billing_subscriptions AS bs
    WHERE bs.plan_id IN ('pro_monthly', 'pro_annual', 'founder_lifetime')
      AND bs.status = 'active'
      AND (bs.current_period_end IS NULL OR bs.current_period_end > now())

    UNION ALL

    SELECT
      s.user_id,
      s.price_id AS plan_id,
      s.created_at,
      1 AS source_priority
    FROM public.subscriptions AS s
    WHERE s.environment = 'live'
      AND s.price_id IN ('pro_monthly', 'pro_annual', 'founder_lifetime')
      AND s.status = 'active'
      AND (
        (
          s.price_id = 'founder_lifetime'
          AND s.paddle_subscription_id LIKE 'lifetime_%'
          AND s.current_period_end IS NULL
        )
        OR (
          s.price_id IN ('pro_monthly', 'pro_annual')
          AND s.current_period_end > now()
        )
      )
  ),
  active_paid AS (
    SELECT DISTINCT ON (candidate.user_id) candidate.user_id
    FROM active_paid_candidates AS candidate
    ORDER BY
      candidate.user_id,
      CASE WHEN candidate.plan_id = 'founder_lifetime' THEN 0 ELSE 1 END,
      candidate.source_priority,
      candidate.created_at DESC
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
