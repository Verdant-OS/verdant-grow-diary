-- Craft tier staging.
--
-- Introduces the craft_monthly / craft_annual paid SKUs to every place the
-- database reasons about entitlements, so the tier is fully resolvable BEFORE
-- the Paddle products exist. Craft = everything Pro has plus a 300/month
-- AI-credit bucket (and, in the client capability set, the Blueprint overlay) —
-- matching the deploy branch's Craft so the lineages stay converged. Activation
-- after this lands is only: create the Paddle Craft products and map price ids.
--
-- Additive + idempotent-friendly: widens the billing_subscriptions.plan_id
-- CHECK and CREATE-OR-REPLACEs the two AI-credit SQL functions to know craft.
-- The Paddle webhook plan-recognition CHECKs (paddle_event_processing,
-- billing_subscription_update_audit) are intentionally left for the Paddle
-- activation step — no craft billing row can be written until then anyway.

BEGIN;

-- 1) Widen the billing_subscriptions.plan_id CHECK. The original constraint is
--    an unnamed inline column check; drop whatever check references plan_id,
--    then add a named, widened one.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.billing_subscriptions'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%plan_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.billing_subscriptions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_plan_id_check
  CHECK (plan_id IN (
    'free','pro_monthly','pro_annual','founder_lifetime','craft_monthly','craft_annual'
  ));

-- 2) ai_credit_allowance: craft mirrors pro (per_month 100, no per_grow).
--    Must stay in parity with TS PLAN_CATALOG (ai-credit-allowance-parity.test).
CREATE OR REPLACE FUNCTION public.ai_credit_allowance(p_plan_id text)
RETURNS TABLE(per_grow int, per_month int)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    CASE p_plan_id
      WHEN 'free' THEN 3
      WHEN 'pro_monthly' THEN NULL
      WHEN 'pro_annual' THEN NULL
      WHEN 'founder_lifetime' THEN NULL
      WHEN 'craft_monthly' THEN NULL
      WHEN 'craft_annual' THEN NULL
      ELSE 0
    END::int AS per_grow,
    CASE p_plan_id
      WHEN 'free' THEN NULL
      WHEN 'pro_monthly' THEN 100
      WHEN 'pro_annual' THEN 100
      WHEN 'founder_lifetime' THEN 100
      WHEN 'craft_monthly' THEN 300
      WHEN 'craft_annual' THEN 300
      ELSE 0
    END::int AS per_month;
$$;

REVOKE ALL ON FUNCTION public.ai_credit_allowance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_credit_allowance(text) TO authenticated, service_role;

-- 3) ai_credit_effective_credit_plan_id: recognise craft as a known plan so an
--    ACTIVE, unexpired craft row keeps its plan (not degraded to free). All
--    other degrade rules (inactive/elapsed/unknown → free) are unchanged.
CREATE OR REPLACE FUNCTION public.ai_credit_effective_credit_plan_id(
  p_plan_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_now timestamptz
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_plan_id IS NULL OR p_plan_id NOT IN ('free','pro_monthly','pro_annual','founder_lifetime','craft_monthly','craft_annual') THEN 'free'
    WHEN p_status IS DISTINCT FROM 'active' THEN 'free'
    WHEN p_current_period_end IS NOT NULL AND p_current_period_end <= p_now THEN 'free'
    ELSE p_plan_id
  END;
$$;

REVOKE ALL ON FUNCTION public.ai_credit_effective_credit_plan_id(text, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_credit_effective_credit_plan_id(text, text, timestamptz, timestamptz) TO authenticated, service_role;

COMMIT;
