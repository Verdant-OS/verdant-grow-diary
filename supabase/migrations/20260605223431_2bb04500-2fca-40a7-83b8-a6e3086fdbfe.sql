
-- Slice 1: Entitlement source of truth. No checkout / webhook / gating yet.
-- profiles.tier is XP/gamification and is intentionally untouched.

CREATE TABLE public.billing_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                  text NOT NULL DEFAULT 'free'
                             CHECK (plan_id IN ('free','pro_monthly','pro_annual','founder_lifetime')),
  status                   text NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','past_due','canceled','paused','expired')),
  provider                 text
                             CHECK (provider IS NULL OR provider IN ('stripe','paddle')),
  provider_customer_id     text,
  provider_subscription_id text,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  founder_number           int
                             CHECK (founder_number IS NULL OR (founder_number BETWEEN 1 AND 75)),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.billing_subscriptions IS
  'Entitlement source of truth. Absence of row = free plan. Client SELECT-own only; all writes via service_role (future webhook).';
COMMENT ON COLUMN public.billing_subscriptions.current_period_end IS
  'NULL means no expiry (free or founder_lifetime). Otherwise the access window end.';
COMMENT ON COLUMN public.billing_subscriptions.founder_number IS
  'Founder Lifetime slot 1..75. Unique when set. Slot allocation enforced in a later slice (S6).';

-- Unique partial indexes (NULLs allowed multiple times).
CREATE UNIQUE INDEX billing_subscriptions_founder_number_uniq
  ON public.billing_subscriptions (founder_number)
  WHERE founder_number IS NOT NULL;

CREATE UNIQUE INDEX billing_subscriptions_provider_sub_uniq
  ON public.billing_subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- GRANTs (no anon — entitlement existence itself is auth-only).
GRANT SELECT ON public.billing_subscriptions TO authenticated;
GRANT ALL    ON public.billing_subscriptions TO service_role;

-- RLS: read-own only. NO insert/update/delete policy for any client role.
-- Writes happen exclusively via service_role (future webhook), which bypasses RLS.
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own billing_subscriptions"
  ON public.billing_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- updated_at trigger via existing public.set_updated_at() convention.
DROP TRIGGER IF EXISTS billing_subscriptions_set_updated_at ON public.billing_subscriptions;
CREATE TRIGGER billing_subscriptions_set_updated_at
  BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
