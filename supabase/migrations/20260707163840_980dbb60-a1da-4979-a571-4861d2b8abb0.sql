-- === breeding_programs ==================================================
CREATE TABLE public.breeding_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  sop_version text NOT NULL DEFAULT 'v1',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','complete','archived')),
  starting_generation text NOT NULL DEFAULT 'P1'
    CHECK (starting_generation IN ('P1','F1','F2','BX1F1','BX1F2','BX2F1','BX3F1','BX3Fn')),
  p1_maternal_label text,
  p1_paternal_label text,
  cross_pair_label text,
  target_traits text[] NOT NULL DEFAULT '{}'::text[],
  grow_id uuid REFERENCES public.grows(id) ON DELETE SET NULL,
  tent_id uuid REFERENCES public.tents(id) ON DELETE SET NULL,
  current_step_id uuid, -- FK added after breeding_program_steps exists
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX breeding_programs_user_id_idx ON public.breeding_programs(user_id);
CREATE INDEX breeding_programs_grow_id_idx ON public.breeding_programs(grow_id);
CREATE INDEX breeding_programs_tent_id_idx ON public.breeding_programs(tent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.breeding_programs TO authenticated;
GRANT ALL ON public.breeding_programs TO service_role;

ALTER TABLE public.breeding_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY breeding_programs_select_own ON public.breeding_programs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY breeding_programs_insert_own ON public.breeding_programs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (grow_id IS NULL OR EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = breeding_programs.grow_id AND g.user_id = auth.uid()
    ))
    AND (tent_id IS NULL OR EXISTS (
      SELECT 1 FROM public.tents t
      WHERE t.id = breeding_programs.tent_id AND t.user_id = auth.uid()
    ))
  );

CREATE POLICY breeding_programs_update_own ON public.breeding_programs
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (grow_id IS NULL OR EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = breeding_programs.grow_id AND g.user_id = auth.uid()
    ))
    AND (tent_id IS NULL OR EXISTS (
      SELECT 1 FROM public.tents t
      WHERE t.id = breeding_programs.tent_id AND t.user_id = auth.uid()
    ))
  );

CREATE POLICY breeding_programs_delete_own ON public.breeding_programs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- === breeding_program_steps =============================================
CREATE TABLE public.breeding_program_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.breeding_programs(id) ON DELETE CASCADE,
  step_index int NOT NULL CHECK (step_index >= 0),
  step_key text NOT NULL,
  generation_label text NOT NULL,
  instruction_summary text NOT NULL,
  required_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  criteria_met jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','complete','skipped')),
  completed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, step_index),
  UNIQUE (program_id, step_key)
);

CREATE INDEX breeding_program_steps_user_id_idx ON public.breeding_program_steps(user_id);
CREATE INDEX breeding_program_steps_program_id_idx ON public.breeding_program_steps(program_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.breeding_program_steps TO authenticated;
GRANT ALL ON public.breeding_program_steps TO service_role;

ALTER TABLE public.breeding_program_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY breeding_program_steps_select_own ON public.breeding_program_steps
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY breeding_program_steps_insert_own ON public.breeding_program_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.breeding_programs p
      WHERE p.id = breeding_program_steps.program_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY breeding_program_steps_update_own ON public.breeding_program_steps
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.breeding_programs p
      WHERE p.id = breeding_program_steps.program_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY breeding_program_steps_delete_own ON public.breeding_program_steps
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Now that breeding_program_steps exists, wire the current_step_id FK.
ALTER TABLE public.breeding_programs
  ADD CONSTRAINT breeding_programs_current_step_fk
  FOREIGN KEY (current_step_id)
  REFERENCES public.breeding_program_steps(id)
  ON DELETE SET NULL;

-- === breeding_step_evidence =============================================
CREATE TABLE public.breeding_step_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.breeding_programs(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.breeding_program_steps(id) ON DELETE CASCADE,
  diary_entry_id uuid NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  criterion_key text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (step_id, diary_entry_id, criterion_key)
);

CREATE INDEX breeding_step_evidence_user_id_idx ON public.breeding_step_evidence(user_id);
CREATE INDEX breeding_step_evidence_step_id_idx ON public.breeding_step_evidence(step_id);
CREATE INDEX breeding_step_evidence_program_id_idx ON public.breeding_step_evidence(program_id);
CREATE INDEX breeding_step_evidence_diary_entry_id_idx ON public.breeding_step_evidence(diary_entry_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.breeding_step_evidence TO authenticated;
GRANT ALL ON public.breeding_step_evidence TO service_role;

ALTER TABLE public.breeding_step_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY breeding_step_evidence_select_own ON public.breeding_step_evidence
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY breeding_step_evidence_insert_own ON public.breeding_step_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.breeding_programs p
      WHERE p.id = breeding_step_evidence.program_id AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.breeding_program_steps s
      WHERE s.id = breeding_step_evidence.step_id
        AND s.user_id = auth.uid()
        AND s.program_id = breeding_step_evidence.program_id
    )
    AND EXISTS (
      SELECT 1 FROM public.diary_entries d
      WHERE d.id = breeding_step_evidence.diary_entry_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY breeding_step_evidence_update_own ON public.breeding_step_evidence
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.breeding_programs p
      WHERE p.id = breeding_step_evidence.program_id AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.breeding_program_steps s
      WHERE s.id = breeding_step_evidence.step_id
        AND s.user_id = auth.uid()
        AND s.program_id = breeding_step_evidence.program_id
    )
    AND EXISTS (
      SELECT 1 FROM public.diary_entries d
      WHERE d.id = breeding_step_evidence.diary_entry_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY breeding_step_evidence_delete_own ON public.breeding_step_evidence
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- === updated_at triggers ================================================
CREATE TRIGGER breeding_programs_set_updated_at
  BEFORE UPDATE ON public.breeding_programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER breeding_program_steps_set_updated_at
  BEFORE UPDATE ON public.breeding_program_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();