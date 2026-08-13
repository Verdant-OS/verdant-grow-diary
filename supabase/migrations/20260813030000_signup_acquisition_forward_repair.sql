-- Forward repair: stand up signup acquisition attribution, and add the
-- blueprint-targets source in the same pass.
--
-- WHY THIS EXISTS. A live probe of production on 2026-08-12 found
-- public.signup_acquisition_attributions absent, and of the four functions only
-- handle_new_user present -- it survives because a later migration
-- (20260721194325) recreated it. So 20260714231627, 20260715002000 and
-- 20260716215516 never reached prod. Repairing forward in one apply is cheaper
-- and safer than replaying three historical migrations in order.
--
-- THIS IS NOT MERELY A REPORTING GAP -- IT BREAKS ACCOUNT CREATION. The live
-- handle_new_user does, at its line 113 equivalent:
--     IF v_signup_source IS NOT NULL THEN
--       INSERT INTO public.signup_acquisition_attributions ...
-- and that INSERT sits OUTSIDE the BEGIN/EXCEPTION WHEN OTHERS block, which
-- wraps only the referral logic. The target relation does not exist, so any
-- signup carrying an allowlisted verdant_signup_source raises 42P01, the
-- unhandled error aborts the AFTER INSERT trigger on auth.users, the row rolls
-- back, and GoTrue returns HTTP 500 "Database error saving new user". The
-- account is never created. This has been true since 20260721194325 applied on
-- 2026-07-21. Verified against prod: on_auth_user_created is enabled
-- (tgenabled='O'), the live body allowlists 'landing_page', and the table is
-- absent. Scope: the front-door CTA and the other attributed entry points --
-- NOT every signup. Google OAuth sends no metadata, magic link uses
-- shouldCreateUser:false, and a bare /auth?mode=signup or any non-exact utm
-- triple resolves to NULL, so all of those still succeed.
--
-- Not yet known to have harmed anyone: auth.users holds 7 accounts, all with a
-- NULL verdant_signup_source, the newest created 2026-07-02 -- BEFORE the
-- breaking body landed. A failed signup rolls back and leaves no row, so
-- "nobody tried" and "everyone who tried failed" are indistinguishable from
-- the table. Treat this as a live defect that has not yet been exercised.
--
-- The new 'blueprint_targets' source is folded in here rather than added by a
-- follow-up, because the client half is ALREADY DEPLOYED and ahead of the repo:
-- the live bundle's attribution table carries blueprint_targets while the repo
-- base branch does not. Widening the allowlist here is catch-up to published
-- Lovable code, not same-PR coordination. Note the ordering consequence --
-- /tools/blueprint-targets currently SUCCEEDS precisely because the live
-- allowlist omits its source, so it resolves to NULL and never reaches the
-- missing table. CREATE TABLE (below) therefore has to precede the allowlist
-- widening, and it does, so no partial-apply prefix can widen the allowlist
-- while the table is still absent.
--
-- Analytics only. raw_user_meta_data stays client-editable and must never grant
-- a role, entitlement, billing state, credit, or Founder allocation. The table
-- keeps RLS on with all privileges revoked from anon/authenticated, so it is
-- unreachable through the Data API; only the SECURITY DEFINER functions below
-- touch it.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, a separate DROP/ADD for the CHECK so
-- an existing table also gains the new values, CREATE OR REPLACE throughout,
-- and ON CONFLICT DO NOTHING on the backfill. Safe to re-run, and safe whether
-- or not any prior migration in this chain was applied.
--
-- handle_new_user is re-issued from its CURRENT definition (20260721194325),
-- NOT from 20260716215516. The older body predates referral_code on the
-- profiles INSERT and the whole convert_referral block; carrying that forward
-- would silently drop both.

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
      'vpd_calculator',
      'csv_history',
      'blueprint_targets'
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

-- Re-assert the allowlist independently of CREATE TABLE so an existing
-- table (sandbox, or a partial earlier apply) also gains the new sources.
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
      'csv_history',
      'blueprint_targets'
    )
  );

-- Preserve profile creation, marketing consent, and referral conversion
-- while copying one allowlisted first-touch source at account creation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_signup_source text;
  v_marketing_opt_in boolean;
  v_ref_code text;
  v_referrer uuid;
BEGIN
  v_signup_source := CASE
    WHEN NEW.raw_user_meta_data->>'verdant_signup_source' IN (
      'landing_page','pricing_page','founder_page','founder_share',
      'pricing_interest_share','operator_outreach','grower_invite',
      'context_check','vpd_calculator','csv_history','blueprint_targets'
    ) THEN NEW.raw_user_meta_data->>'verdant_signup_source'
    ELSE NULL
  END;

  v_marketing_opt_in := CASE
    WHEN NEW.raw_user_meta_data->'marketing_opt_in' = 'true'::jsonb THEN true
    ELSE false
  END;

  INSERT INTO public.profiles (
    user_id, display_name, marketing_opt_in, marketing_opt_in_at, referral_code
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_marketing_opt_in,
    CASE WHEN v_marketing_opt_in THEN COALESCE(NEW.created_at, now()) ELSE NULL END,
    public.generate_referral_code()
  )
  ON CONFLICT (user_id) DO NOTHING;

  IF v_signup_source IS NOT NULL THEN
    INSERT INTO public.signup_acquisition_attributions (user_id, source, created_at)
    VALUES (NEW.id, v_signup_source, COALESCE(NEW.created_at, now()))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  BEGIN
    v_ref_code := lower(btrim(NEW.raw_user_meta_data->>'verdant_ref_code'));
    IF v_ref_code IS NOT NULL AND v_ref_code ~ '^[a-z0-9]{6,16}$' THEN
      SELECT p.user_id INTO v_referrer
        FROM public.profiles p
       WHERE p.referral_code = v_ref_code
       LIMIT 1;
      IF v_referrer IS NOT NULL AND v_referrer <> NEW.id THEN
        PERFORM public.convert_referral(
          v_referrer, NEW.id, v_ref_code,
          COALESCE(NULLIF(current_setting('app.payments_environment', true), ''), 'live'),
          NEW.email_confirmed_at IS NOT NULL
            AND NULLIF(current_setting('app.payments_environment', true), '') IS NOT NULL
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

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
  'vpd_calculator',
  'csv_history',
  'blueprint_targets'
)
ON CONFLICT (user_id) DO NOTHING;


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
    'csv_history',
    'blueprint_targets'
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
      count(*) FILTER (WHERE a.source = 'csv_history') AS csv_history,
      count(*) FILTER (WHERE a.source = 'blueprint_targets') AS blueprint_targets
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
    'csv_history', ac.csv_history,
    'blueprint_targets', ac.blueprint_targets
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
      ('blueprint_targets'::text),
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
  -- Paid cohorts come solely from public.subscriptions. The retired
  -- public.billing_subscriptions branch is deliberately NOT revived here:
  -- AGENTS.md is explicit that it is a legacy sandbox/operator-audit surface
  -- that must never grant an entitlement, and because this forward repair is
  -- the FIRST install of this function in production, carrying it over would
  -- have counted legacy rows as authoritative active-paid subscribers and
  -- inflated every operator conversion total.
  active_paid_candidates AS (
    SELECT
      s.user_id,
      s.price_id AS plan_id,
      s.created_at
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

NOTIFY pgrst, 'reload schema';
