
-- Pheno Tracker Pro entitlement — server-side enforcement.
--
-- Adds a SECURITY DEFINER check that returns TRUE iff the caller currently
-- has an active Pro-tier subscription (BYO billing_subscriptions OR Lovable
-- Paddle live subscriptions). Then adds RESTRICTIVE RLS policies on every
-- pheno_* write-capable table so that INSERT/UPDATE/DELETE additionally
-- require Pro entitlement. Reads (SELECT) are unchanged — growers keep
-- history access even if their plan lapses.

CREATE OR REPLACE FUNCTION public.has_pheno_tracker_entitlement(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.billing_subscriptions bs
      WHERE bs.user_id = _user_id
        AND bs.plan_id IN ('pro_monthly','pro_annual','founder_lifetime')
        AND (
          (bs.status IN ('active','trialing')
             AND (bs.current_period_end IS NULL OR bs.current_period_end > now()))
          OR (bs.status = 'canceled'
             AND bs.current_period_end IS NOT NULL
             AND bs.current_period_end > now())
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.environment = 'live'
        AND (
          (s.status IN ('active','trialing')
             AND (s.current_period_end IS NULL OR s.current_period_end > now()))
          OR (s.status = 'canceled'
             AND s.current_period_end IS NOT NULL
             AND s.current_period_end > now())
        )
    );
$$;

REVOKE ALL ON FUNCTION public.has_pheno_tracker_entitlement(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.has_pheno_tracker_entitlement(uuid) TO authenticated, service_role;

-- Restrictive policies: applied in addition to existing owner policies, they
-- REQUIRE Pro entitlement for every INSERT / UPDATE / DELETE across every
-- pheno_* write table. Restrictive policies AND with permissive ones.
DO $$
DECLARE
  t text;
  pheno_tables text[] := ARRAY[
    'pheno_hunts',
    'pheno_candidate_scores',
    'pheno_keeper_decisions',
    'pheno_keeper_decisions_log',
    'pheno_keepers',
    'pheno_keeper_clones',
    'pheno_crosses',
    'pheno_score_rounds',
    'pheno_sex_observations',
    'pheno_smoke_tests',
    'pheno_lab_results',
    'pheno_reversals',
    'pheno_stress_observations'
  ];
BEGIN
  FOREACH t IN ARRAY pheno_tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      t || '_pro_required_insert', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      t || '_pro_required_update', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      t || '_pro_required_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated '
      'WITH CHECK (public.has_pheno_tracker_entitlement(auth.uid()))',
      t || '_pro_required_insert', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated '
      'USING (public.has_pheno_tracker_entitlement(auth.uid())) '
      'WITH CHECK (public.has_pheno_tracker_entitlement(auth.uid()))',
      t || '_pro_required_update', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated '
      'USING (public.has_pheno_tracker_entitlement(auth.uid()))',
      t || '_pro_required_delete', t);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.has_pheno_tracker_entitlement(uuid) IS
  'Server-side Pro entitlement check for Pheno Tracker writes. Returns true iff the user holds an active/trialing Pro subscription (BYO or Lovable Paddle live), or a canceled Pro sub still within its paid period. Used by RESTRICTIVE RLS policies on pheno_* tables.';
