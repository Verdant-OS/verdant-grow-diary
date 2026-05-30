CREATE TABLE public.ai_doctor_session_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  session_id uuid NOT NULL,
  event_type text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_doctor_session_reviews_event_type_chk
    CHECK (event_type IN ('marked_reviewed','needs_follow_up','cleared')),
  CONSTRAINT ai_doctor_session_reviews_note_len_chk
    CHECK (note IS NULL OR char_length(note) <= 1000)
);

CREATE INDEX ai_doctor_session_reviews_user_session_created_idx
  ON public.ai_doctor_session_reviews (user_id, session_id, created_at DESC);

CREATE INDEX ai_doctor_session_reviews_user_created_idx
  ON public.ai_doctor_session_reviews (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.ai_doctor_session_reviews TO authenticated;
GRANT ALL ON public.ai_doctor_session_reviews TO service_role;

ALTER TABLE public.ai_doctor_session_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai_doctor_session_reviews"
ON public.ai_doctor_session_reviews
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ai_doctor_session_reviews"
ON public.ai_doctor_session_reviews
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.ai_doctor_sessions s
     WHERE s.id = ai_doctor_session_reviews.session_id
       AND s.user_id = auth.uid()
  )
);