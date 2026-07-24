
ALTER TABLE public.customer_feedback
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

GRANT UPDATE (reviewed_at, reviewed_by, admin_notes) ON public.customer_feedback TO authenticated;
GRANT UPDATE (reviewed_at, reviewed_by, admin_notes) ON public.contact_messages TO authenticated;

DROP POLICY IF EXISTS "Operators can update feedback review" ON public.customer_feedback;
CREATE POLICY "Operators can update feedback review"
  ON public.customer_feedback FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'operator'::public.app_role));

DROP POLICY IF EXISTS "Operators can update contact review" ON public.contact_messages;
CREATE POLICY "Operators can update contact review"
  ON public.contact_messages FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'operator'::public.app_role));

CREATE INDEX IF NOT EXISTS customer_feedback_reviewed_at_idx
  ON public.customer_feedback (reviewed_at NULLS FIRST, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_reviewed_at_idx
  ON public.contact_messages (reviewed_at NULLS FIRST, created_at DESC);
