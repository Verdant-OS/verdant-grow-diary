-- Prevent authenticated callers from using has_pheno_tracker_entitlement as an
-- oracle to probe other users' Pro/Free/canceled/founder status.
--
-- Rules:
--  * service_role: unrestricted (needed for migrations, admin, RLS internals).
--  * authenticated: allowed only when _user_id = auth.uid(); other args -> false.
--  * anon: still permission denied at GRANT layer (unchanged).
--
-- RESTRICTIVE pheno write policies call this with auth.uid(), so real writes
-- are unaffected. Return type/signature unchanged.

CREATE OR REPLACE FUNCTION public.has_pheno_tracker_entitlement(_user_id uuid)
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
  -- Anti-oracle guard: authenticated callers can only probe themselves.
  -- service_role bypasses (admin/migration/RLS internal evaluation).
  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL OR _user_id IS NULL OR _user_id <> v_uid THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
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
END;
$function$;

-- Re-assert grant posture (no change): authenticated + service_role only.
REVOKE ALL ON FUNCTION public.has_pheno_tracker_entitlement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_pheno_tracker_entitlement(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_pheno_tracker_entitlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pheno_tracker_entitlement(uuid) TO service_role;