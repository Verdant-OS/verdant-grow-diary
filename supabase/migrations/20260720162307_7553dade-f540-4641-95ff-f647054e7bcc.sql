
CREATE TABLE public.customer_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  ai_doctor_rating SMALLINT CHECK (ai_doctor_rating BETWEEN 1 AND 5),
  sensors_rating SMALLINT CHECK (sensors_rating BETWEEN 1 AND 5),
  quicklog_rating SMALLINT CHECK (quicklog_rating BETWEEN 1 AND 5),
  trust_rating SMALLINT CHECK (trust_rating BETWEEN 1 AND 5),
  whats_working TEXT,
  whats_friction TEXT,
  one_improvement TEXT,
  grow_context TEXT,
  contact_email TEXT,
  follow_up_ok BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.customer_feedback TO anon, authenticated;
GRANT ALL ON public.customer_feedback TO service_role;
ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit feedback"
  ON public.customer_feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Operators can read feedback"
  ON public.customer_feedback FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'::public.app_role));


CREATE TABLE public.contact_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  category TEXT NOT NULL CHECK (category IN (
    'technical_support','bug_report','feature_idea','billing_account','hardware_integration','other'
  )),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 8000),
  grow_context TEXT,
  attachment_path TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can send a contact message"
  ON public.contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Operators can read contact messages"
  ON public.contact_messages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'::public.app_role));
