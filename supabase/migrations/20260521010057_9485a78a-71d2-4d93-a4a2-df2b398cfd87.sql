
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL,
  company text,
  role text,
  lead_type text NOT NULL DEFAULT 'beta_user',
  message text,
  source text NOT NULL DEFAULT 'landing',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_email_present CHECK (length(btrim(email)) > 0),
  CONSTRAINT leads_lead_type_valid CHECK (lead_type IN ('beta_user','hardware_partner','grower','investor','other'))
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a lead"
ON public.leads
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Operators view all leads"
ON public.leads
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'operator'::app_role));
