-- Forward-only measurement of first live recurring paid access. Historical
-- memberships carry no delivery receipt. Nothing here calls an analytics vendor.
CREATE TABLE public.first_paid_activation_receipts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  activated_at timestamptz NOT NULL
);

ALTER TABLE public.first_paid_activation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.first_paid_activation_receipts
  FROM PUBLIC, anon, authenticated, service_role;

-- Reuse the existing AFTER INSERT / trial-to-active tracker so that the old
-- operator ledger is consulted before this transaction creates a membership.
-- Its original Pro/Founder criteria remain independent of analytics eligibility.
CREATE OR REPLACE FUNCTION public.record_paid_return_cohort_membership()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  same_live_subscription boolean := true;
  genuine_first_paid boolean := true;
BEGIN
  IF NEW.environment <> 'live' OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'trialing' THEN RETURN NEW; END IF;
    -- A replayed trialing upsert restores an older trial window, so created_at
    -- is not a signal. A real conversion starts the paid period at that
    -- window's end. A null or repeated period fails closed.
    IF OLD.current_period_start IS NULL
       OR OLD.current_period_end IS NULL
       OR NEW.current_period_start IS NULL
       OR NEW.current_period_start < OLD.current_period_start
       OR NEW.current_period_start <= OLD.current_period_start + interval '5 minutes'
       OR NEW.current_period_start < OLD.current_period_end - interval '5 minutes'
       OR NEW.current_period_start > OLD.current_period_end + interval '5 minutes'
    THEN
      genuine_first_paid := false;
    END IF;
    same_live_subscription := OLD.environment = 'live' AND OLD.user_id = NEW.user_id
      AND OLD.billing_provider = NEW.billing_provider
      AND OLD.stripe_subscription_id IS NOT DISTINCT FROM NEW.stripe_subscription_id
      AND OLD.paddle_subscription_id IS NOT DISTINCT FROM NEW.paddle_subscription_id;
  END IF;

  IF genuine_first_paid AND same_live_subscription
     AND NEW.price_id IN ('pro_monthly', 'pro_annual', 'craft_monthly', 'craft_annual')
     AND NEW.current_period_start <= now() AND NEW.current_period_end > now()
     AND ((NEW.billing_provider = 'stripe' AND left(NEW.stripe_subscription_id, 4) = 'sub_')
       OR (NEW.billing_provider = 'paddle' AND left(NEW.paddle_subscription_id, 4) = 'sub_'))
     AND NOT EXISTS (
       SELECT 1 FROM public.first_paid_activation_receipts WHERE user_id = NEW.user_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.paid_return_cohort_memberships WHERE user_id = NEW.user_id
     )
     AND NOT EXISTS (
       -- A previous paid row may predate the operator tracker or be a Craft
       -- membership it never covered. An ambiguous canceled trial fails closed.
       SELECT 1 FROM public.subscriptions AS prior
       WHERE prior.user_id = NEW.user_id AND prior.id <> NEW.id
         AND prior.environment = 'live' AND prior.status <> 'trialing'
         AND prior.price_id IN ('pro_monthly', 'pro_annual', 'craft_monthly',
                                'craft_annual', 'founder_lifetime')
     )
  THEN
    INSERT INTO public.first_paid_activation_receipts (user_id, activated_at)
      VALUES (NEW.user_id, NEW.current_period_start)
      ON CONFLICT (user_id) DO NOTHING;
  END IF;

  IF NEW.price_id IN ('pro_monthly', 'pro_annual', 'founder_lifetime') THEN
    INSERT INTO public.paid_return_cohort_memberships (user_id)
      VALUES (NEW.user_id) ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Own-receipt lookup only. No user-supplied ID and no direct table privileges.
CREATE FUNCTION public.get_my_first_paid_activation()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object('account_id', user_id, 'event_id', event_id, 'activated_at', activated_at)
  FROM public.first_paid_activation_receipts
  WHERE user_id = (SELECT auth.uid())
$$;

REVOKE ALL ON FUNCTION public.get_my_first_paid_activation()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_first_paid_activation() TO authenticated;
