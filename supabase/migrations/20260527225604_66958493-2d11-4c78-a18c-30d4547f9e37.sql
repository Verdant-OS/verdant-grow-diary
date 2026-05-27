CREATE TABLE public.ai_doctor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  grow_id uuid,
  tent_id uuid,
  plant_id uuid,
  question text,
  analysis jsonb,
  diagnosis jsonb,
  raw_confidence numeric,
  displayed_confidence numeric,
  context_confidence_ceiling text,
  context_sufficiency jsonb,
  suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_doctor_sessions_user_created
  ON public.ai_doctor_sessions (user_id, created_at DESC);
CREATE INDEX idx_ai_doctor_sessions_plant
  ON public.ai_doctor_sessions (plant_id, created_at DESC)
  WHERE plant_id IS NOT NULL;
CREATE INDEX idx_ai_doctor_sessions_tent
  ON public.ai_doctor_sessions (tent_id, created_at DESC)
  WHERE tent_id IS NOT NULL;
CREATE INDEX idx_ai_doctor_sessions_grow
  ON public.ai_doctor_sessions (grow_id, created_at DESC)
  WHERE grow_id IS NOT NULL;

GRANT SELECT, INSERT ON public.ai_doctor_sessions TO authenticated;
GRANT ALL ON public.ai_doctor_sessions TO service_role;

ALTER TABLE public.ai_doctor_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai_doctor_sessions"
  ON public.ai_doctor_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ai_doctor_sessions"
  ON public.ai_doctor_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      grow_id IS NULL
      OR EXISTS (SELECT 1 FROM public.grows g WHERE g.id = ai_doctor_sessions.grow_id AND g.user_id = auth.uid())
    )
    AND (
      tent_id IS NULL
      OR EXISTS (SELECT 1 FROM public.tents t WHERE t.id = ai_doctor_sessions.tent_id AND t.user_id = auth.uid())
    )
    AND (
      plant_id IS NULL
      OR EXISTS (SELECT 1 FROM public.plants p WHERE p.id = ai_doctor_sessions.plant_id AND p.user_id = auth.uid())
    )
  );
