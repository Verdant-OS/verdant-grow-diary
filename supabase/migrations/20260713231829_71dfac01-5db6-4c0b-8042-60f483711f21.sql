
CREATE TYPE public.agreement_type AS ENUM ('terms', 'privacy');

CREATE TABLE public.user_agreement_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agreement_type public.agreement_type NOT NULL,
  version TEXT NOT NULL,
  effective_date DATE NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, agreement_type, version)
);

CREATE INDEX idx_user_agreement_acceptances_user
  ON public.user_agreement_acceptances (user_id, agreement_type, accepted_at DESC);

GRANT SELECT, INSERT ON public.user_agreement_acceptances TO authenticated;
GRANT ALL ON public.user_agreement_acceptances TO service_role;

ALTER TABLE public.user_agreement_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own acceptances"
  ON public.user_agreement_acceptances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own acceptances"
  ON public.user_agreement_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
