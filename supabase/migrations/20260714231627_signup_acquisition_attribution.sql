-- First-touch account acquisition attribution.
--
-- raw_user_meta_data is client-editable, so this source is intentionally
-- analytics-only. It never grants a role, entitlement, billing state, credit,
-- Founder allocation, or any other capability. The trigger copies one
-- allowlisted source at account creation; clients cannot read or mutate the
-- resulting table through the Data API.

CREATE TABLE IF NOT EXISTS public.signup_acquisition_attributions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signup_acquisition_attributions_source_check CHECK (
    source IN (
      'landing_page',
      'pricing_page',
      'founder_page',
      'founder_share',
      'pricing_interest_share',
      'operator_outreach',
      'grower_invite',
      'context_check',
      'vpd_calculator'
    )
  )
);

ALTER TABLE public.signup_acquisition_attributions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.signup_acquisition_attributions FROM PUBLIC;
REVOKE ALL ON TABLE public.signup_acquisition_attributions FROM anon;
REVOKE ALL ON TABLE public.signup_acquisition_attributions FROM authenticated;

COMMENT ON TABLE public.signup_acquisition_attributions IS
  'Immutable, analytics-only first-touch source copied from allowlisted signup metadata. Never an authorization, billing, entitlement, role, Founder, or AI-credit source.';
COMMENT ON COLUMN public.signup_acquisition_attributions.source IS
  'Self-reported first-touch campaign source. Allowlisted for reporting only; user metadata is not trusted for authorization.';

-- Keep the existing profile creation behavior and copy only the first
-- allowlisted attribution source. CREATE OR REPLACE preserves the trigger and
-- is re-locked below because this SECURITY DEFINER function is in public.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_signup_source text;
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
      'vpd_calculator'
    ) THEN NEW.raw_user_meta_data->>'verdant_signup_source'
    ELSE NULL
  END;

  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
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

-- Safe replay/backfill for accounts created by application code carrying the
-- allowlisted metadata before this migration is applied. No email or other PII
-- is copied, and ON CONFLICT preserves first touch.
INSERT INTO public.signup_acquisition_attributions (user_id, source, created_at)
SELECT
  u.id,
  u.raw_user_meta_data->>'verdant_signup_source',
  COALESCE(u.created_at, now())
FROM auth.users AS u
WHERE u.raw_user_meta_data->>'verdant_signup_source' IN (
  'landing_page',
  'pricing_page',
  'founder_page',
  'founder_share',
  'pricing_interest_share',
  'operator_outreach',
  'grower_invite',
  'context_check',
  'vpd_calculator'
)
ON CONFLICT (user_id) DO NOTHING;

-- Read-only, operator-only aggregate. Account starts and campaign sources are
-- kept explicitly separate from billing_subscriptions and paid subscribers.
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
      count(*) FILTER (WHERE a.source = 'vpd_calculator') AS vpd_calculator
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
    'vpd_calculator', ac.vpd_calculator
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
