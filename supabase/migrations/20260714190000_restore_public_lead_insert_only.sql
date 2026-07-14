-- Restore the public lead-capture contract used by Landing and Pricing.
-- Production drift had replaced the original anon/authenticated INSERT policy
-- with an authenticated-only policy, making signed-out submissions fail.

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit a lead" ON public.leads;
DROP POLICY IF EXISTS "Users can submit a lead" ON public.leads;
DROP POLICY IF EXISTS "Public can submit a lead" ON public.leads;

CREATE POLICY "Public can submit a lead"
ON public.leads
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(btrim(email)) BETWEEN 3 AND 255
  AND position('@' IN btrim(email)) > 1
  AND lead_type IN ('beta_user', 'hardware_partner', 'grower', 'investor', 'other')
  AND source IN (
    'landing',
    'pricing_interest',
    'pricing_interest_landing',
    'pricing_interest_founder_page',
    'pricing_interest_founder_share',
    'pricing_interest_referral',
    'pricing_interest_grower_invite',
    'pricing_interest_context_check'
  )
  AND length(COALESCE(message, '')) <= 2000
);

-- Keep the anonymous role at the minimum privilege needed by the public form.
REVOKE ALL ON TABLE public.leads FROM anon;
GRANT INSERT ON TABLE public.leads TO anon;
