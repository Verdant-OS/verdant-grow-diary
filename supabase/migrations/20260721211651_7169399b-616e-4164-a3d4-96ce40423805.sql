CREATE OR REPLACE FUNCTION public.has_phenoid_entitlement(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
    SELECT 1 FROM public.billing_subscriptions bs
    WHERE bs.user_id = _user_id
      AND bs.plan_id IN ('phenoid_monthly','phenoid_annual')
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
      AND s.price_id IN ('phenoid_monthly','phenoid_annual')
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