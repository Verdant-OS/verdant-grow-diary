-- Pheno Crosses foundation (the breeding endgame).
--
-- The hunt endgame: a keeper becomes a parent. A cross records a two-parent
-- pairing of a FEMALE keeper and a MALE keeper (both preserved phenotypes in
-- pheno_keepers). Record-only: recording a cross starts no grow and drives
-- nothing; any follow-up (label seeds, start a grow) routes through the
-- approval-required Action Queue elsewhere, never from here.
--
-- Privacy: RLS keeps every row private to its owning grower on read AND write.
-- Ownership is via BOTH referenced keepers (and the hunt, if set). No anon grant.

CREATE TABLE public.pheno_crosses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid REFERENCES public.pheno_hunts(id) ON DELETE SET NULL,
  female_keeper_id uuid NOT NULL REFERENCES public.pheno_keepers(id) ON DELETE CASCADE,
  male_keeper_id uuid NOT NULL REFERENCES public.pheno_keepers(id) ON DELETE CASCADE,
  cross_name text,
  note text,
  crossed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pheno_crosses_distinct_parents CHECK (female_keeper_id <> male_keeper_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_crosses TO authenticated;
GRANT ALL ON public.pheno_crosses TO service_role;

ALTER TABLE public.pheno_crosses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pheno_crosses_select_own"
  ON public.pheno_crosses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert: caller owns the row AND both keeper parents; if a hunt is set it must
-- be the caller's.
CREATE POLICY "pheno_crosses_insert_own"
  ON public.pheno_crosses FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers f
      WHERE f.id = female_keeper_id AND f.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers m
      WHERE m.id = male_keeper_id AND m.user_id = auth.uid()
    )
    AND (
      hunt_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "pheno_crosses_update_own"
  ON public.pheno_crosses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers f
      WHERE f.id = female_keeper_id AND f.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers m
      WHERE m.id = male_keeper_id AND m.user_id = auth.uid()
    )
    AND (
      hunt_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "pheno_crosses_delete_own"
  ON public.pheno_crosses FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX pheno_crosses_user_id_idx ON public.pheno_crosses (user_id);
CREATE INDEX pheno_crosses_hunt_id_idx ON public.pheno_crosses (hunt_id);
CREATE INDEX pheno_crosses_female_idx ON public.pheno_crosses (female_keeper_id);
CREATE INDEX pheno_crosses_male_idx ON public.pheno_crosses (male_keeper_id);

CREATE TRIGGER pheno_crosses_set_updated_at
  BEFORE UPDATE ON public.pheno_crosses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
