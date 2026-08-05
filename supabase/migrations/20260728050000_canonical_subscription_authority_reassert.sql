-- Reassert public.subscriptions as Verdant's sole entitlement authority.
--
-- The 2026-07-16 cutover backfilled then retired public.billing_subscriptions
-- from entitlement resolution. That legacy table remains available for
-- sandbox/operator audit, but later creation-cap, history-cap, and PhenoID
-- definitions accidentally reintroduced it as an access-granting branch.
--
-- This forward-only repair changes no rows, tables, plan catalog, or client
-- APIs. It replaces the affected server controls in place:
--   * active grow/tent Free creation-cap trigger function
--   * authenticated sensor-history restrictive SELECT policy
--   * PhenoID write-entitlement helper
--
-- Database controls deliberately consider only environment='live'. Request
-- and server environment configuration is not available inside these RLS and
-- trigger checks. Sandbox access remains an edge-function concern, gated by
-- the server-resolved PAYMENTS_ENVIRONMENT.

CREATE OR REPLACE FUNCTION public.enforce_free_creation_caps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_authenticated_owner uuid;
  v_owner_id uuid;
  v_has_paid_entitlement boolean := false;
  v_active_count integer := 0;
BEGIN
  -- Trusted setup/teardown and server-owned import fixtures use service_role.
  -- Staff/operator roles are intentionally not authoritative billing bypasses.
  IF current_setting('role', true) IS NOT DISTINCT FROM 'service_role' THEN
    RETURN NEW;
  END IF;

  v_authenticated_owner := auth.uid();

  -- A trigger runs before an INSERT/UPDATE RLS WITH CHECK. Bind the owner here
  -- before any early return or billing query so client-supplied NEW.user_id
  -- cannot choose whose entitlement or active-row count is inspected.
  IF v_authenticated_owner IS NOT NULL THEN
    IF NEW.user_id IS DISTINCT FROM v_authenticated_owner THEN
      RAISE EXCEPTION USING
        ERRCODE = 'insufficient_privilege',
        MESSAGE = 'free_creation_cap_owner_mismatch',
        DETAIL = 'The row owner must match the authenticated user.';
    END IF;

    v_owner_id := v_authenticated_owner;
  ELSIF session_user IS NOT DISTINCT FROM 'postgres' THEN
    -- Migration, restore, and direct DBA maintenance sessions have no JWT.
    -- They remain cap-checked; only service_role receives the fixture bypass.
    v_owner_id := NEW.user_id;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'free_creation_cap_authenticated_owner_required',
      DETAIL = 'An authenticated owner is required for this write.';
  END IF;

  -- Archived INSERTs consume no active slot. On UPDATE, preserve ordinary
  -- edits to an already-active row for legacy accounts that exceed the cap.
  -- An owner change is activation-like for the receiving owner and is checked.
  IF NEW.is_archived IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.is_archived IS NOT TRUE
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- NOT NULL constraints remain the owner-shape authority. Let them return
  -- their native error instead of hashing a null owner.
  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- One shared owner lock serializes grow and tent creation attempts. A
  -- namespaced 64-bit key avoids colliding with other per-user ledgers.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('verdant:free-creation-cap:' || v_owner_id::text, 0)
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = v_owner_id
      AND s.environment = 'live'
      AND (
        (
          s.price_id IN (
            'pro_monthly',
            'pro_annual',
            'craft_monthly',
            'craft_annual'
          )
          AND s.current_period_end IS NOT NULL
          AND (
            (s.status IN ('active', 'trialing') AND s.current_period_end > now())
            OR s.status = 'past_due'
            OR (s.status = 'canceled' AND s.current_period_end > now())
          )
        )
        OR (
          s.price_id = 'founder_lifetime'
          AND left(s.paddle_subscription_id, 9) = 'lifetime_'
          AND s.status = 'active'
          AND s.current_period_end IS NULL
        )
      )
  )
  INTO v_has_paid_entitlement;

  IF v_has_paid_entitlement THEN
    RETURN NEW;
  END IF;

  IF TG_RELID = 'public.grows'::regclass THEN
    SELECT count(*)::integer
      INTO v_active_count
      FROM public.grows
     WHERE user_id = v_owner_id
       AND is_archived = false;

    IF v_active_count >= 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'free_active_grow_limit_reached',
        DETAIL = 'Free accounts may have one active grow.',
        HINT = 'Archive the active grow or upgrade to a paid plan.';
    END IF;
  ELSIF TG_RELID = 'public.tents'::regclass THEN
    SELECT count(*)::integer
      INTO v_active_count
      FROM public.tents
     WHERE user_id = v_owner_id
       AND is_archived = false;

    IF v_active_count >= 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'free_active_tent_limit_reached',
        DETAIL = 'Free accounts may have one active tent.',
        HINT = 'Archive the active tent or upgrade to a paid plan.';
    END IF;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'invalid_parameter_value',
      MESSAGE = 'free_creation_cap_trigger_table_not_supported';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_free_creation_caps() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_free_creation_caps() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_free_creation_caps() FROM authenticated;

COMMENT ON FUNCTION public.enforce_free_creation_caps() IS
  'Server-authoritative Free active-grow and active-tent creation cap. '
  'Binds client authority to auth.uid(), checks only live canonical '
  'public.subscriptions, and serializes per owner; does not rewrite or '
  'revalidate existing active rows.';

DROP POLICY IF EXISTS "Free sensor history is limited to 90 days"
  ON public.sensor_readings;

CREATE POLICY "Free sensor history is limited to 90 days"
  ON public.sensor_readings
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (
      COALESCE(captured_at, ts, created_at) >= now() - interval '90 days'
      OR EXISTS (
        SELECT 1
        FROM public.subscriptions s
        WHERE s.user_id = (SELECT auth.uid())
          AND s.environment = 'live'
          AND (
            (
              s.price_id IN (
                'pro_monthly',
                'pro_annual',
                'craft_monthly',
                'craft_annual'
              )
              AND s.current_period_end IS NOT NULL
              AND (
                (s.status IN ('active', 'trialing') AND s.current_period_end > now())
                OR s.status = 'past_due'
                OR (s.status = 'canceled' AND s.current_period_end > now())
              )
            )
            OR (
              s.price_id = 'founder_lifetime'
              AND left(s.paddle_subscription_id, 9) = 'lifetime_'
              AND s.status = 'active'
              AND s.current_period_end IS NULL
            )
          )
      )
    )
  );

COMMENT ON POLICY "Free sensor history is limited to 90 days"
  ON public.sensor_readings IS
  'Authenticated Free accounts may read only their own last 90 days of sensor '
  'history. Live canonical Pro, Craft, and Founder subscriptions retain full '
  'history. The policy never deletes or rewrites stored readings.';

CREATE OR REPLACE FUNCTION public.has_phenoid_entitlement(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('role', true);
  v_uid  uuid := auth.uid();
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL OR _user_id IS NULL OR _user_id <> v_uid THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.environment = 'live'
      AND s.price_id IN ('phenoid_monthly','phenoid_annual')
      AND (
        (
          s.status IN ('active','trialing')
          AND (s.current_period_end IS NULL OR s.current_period_end > now())
        )
        OR (
          s.status = 'canceled'
          AND s.current_period_end IS NOT NULL
          AND s.current_period_end > now()
        )
      )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.has_phenoid_entitlement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_phenoid_entitlement(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_phenoid_entitlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_phenoid_entitlement(uuid) TO service_role;

COMMENT ON FUNCTION public.has_phenoid_entitlement(uuid) IS
  'Server-side highest-tier PhenoID entitlement check. Authenticated callers '
  'may inspect only themselves; service_role may inspect a resolved owner. '
  'Only live canonical public.subscriptions rows grant access.';
