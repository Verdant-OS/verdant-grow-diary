-- Extend leads with operator follow-up fields
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS operator_notes text,
  ADD COLUMN IF NOT EXISTS contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Status enum-like constraint
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new','reviewed','contacted','follow_up','closed','spam'));

-- contacted_at only allowed for contacted/follow_up/closed
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_contacted_at_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_contacted_at_check
  CHECK (contacted_at IS NULL OR status IN ('contacted','follow_up','closed'));

-- follow_up_at only allowed when status = follow_up
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_follow_up_at_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_follow_up_at_check
  CHECK (follow_up_at IS NULL OR status = 'follow_up');

-- updated_at trigger using existing set_updated_at()
DROP TRIGGER IF EXISTS leads_set_updated_at ON public.leads;
CREATE TRIGGER leads_set_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Operator-only UPDATE policy on leads
DROP POLICY IF EXISTS "Operators update leads" ON public.leads;
CREATE POLICY "Operators update leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'operator'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'operator'::app_role));
