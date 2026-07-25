-- Craft must grant Pheno Tracker, exactly as Pro does.
--
-- Craft is sold with the bullet "Everything in Pro" (src/constants/pricing.ts)
-- and src/lib/entitlements/planCatalog.ts defines CRAFT_CAPABILITIES as a
-- literal superset of PRO_CAPABILITIES. But Pheno Tracker is gated by a
-- separate mechanism whose plan allow-list omitted Craft at three independent
-- sites: the client (featureEntitlements.PRO_PLAN_IDS), the edge gate
-- (_shared/assertPhenoTrackerEntitlement.ts), and this function. A paying
-- Craft subscriber was therefore denied a feature the pricing page promises.
--
-- This migration closes the database site. The client and edge sites are
-- fixed alongside it; src/test/sell-vs-grant-parity.test.ts fails if the three
-- ever disagree again, so a two-of-three fix can no longer ship looking whole.
--
-- The body below reproduces 20260717193000_entitlement_status_parity.sql
-- byte-for-byte EXCEPT the recurring-plan IN list, which gains the two Craft
-- ids. Every other clause is load-bearing and is asserted literally by
-- src/test/pheno-tracker-entitlement-oracle-guard.test.ts:
--   * the auth.uid() cross-user guard (an authenticated caller may only ask
--     about itself; service_role may evaluate anyone)
--   * current_period_end IS NOT NULL on recurring rows, so a malformed paid
--     row cannot entitle
--   * the past_due dunning grace and the canceled paid-through window
--   * the Founder branch's literal 9-character 'lifetime_' prefix check
--     (NOT a LIKE pattern — `_` is a LIKE wildcard, so 'lifetimeXabc' would
--     impersonate a Founder row)
--   * RETURNS boolean only — never leaks provider/customer/subscription ids
--
-- No credit-pack SKU is added here: packs are not plans and must never
-- resolve to an entitlement. ai_credit_spend already recognises Craft
-- (20260721104000_ai_credit_spend_pack_overflow.sql) and is left untouched.

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
  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL OR _user_id IS NULL OR _user_id <> v_uid THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.environment = 'live'
      AND (
        (
          s.price_id IN ('pro_monthly','pro_annual','craft_monthly','craft_annual')
          AND s.current_period_end IS NOT NULL
          AND (
            (s.status IN ('active','trialing') AND s.current_period_end > now())
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
  );
END;
$function$;

-- CREATE OR REPLACE does not preserve grants; re-issue them or the function
-- silently becomes unexecutable for the roles that need it.
REVOKE ALL ON FUNCTION public.has_pheno_tracker_entitlement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_pheno_tracker_entitlement(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_pheno_tracker_entitlement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pheno_tracker_entitlement(uuid) TO service_role;
