
-- Drop previous v1 pheno hunt schema (created in prior migration).
DROP TABLE IF EXISTS public.pheno_hunt_candidates;
DROP TABLE IF EXISTS public.pheno_hunts;

-- Trigger function: auto-set user_id from auth.uid() on INSERT.
CREATE OR REPLACE FUNCTION public.set_user_id_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END
$$;

-- Minimal pheno_hunts table.
CREATE TABLE public.pheno_hunts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  grow_id uuid NOT NULL REFERENCES public.grows(id) ON DELETE CASCADE,
  tent_id uuid REFERENCES public.tents(id) ON DELETE SET NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pheno_hunts TO authenticated;
GRANT ALL ON public.pheno_hunts TO service_role;

CREATE INDEX pheno_hunts_user_id_idx ON public.pheno_hunts (user_id);
CREATE INDEX pheno_hunts_grow_id_idx ON public.pheno_hunts (grow_id);
CREATE INDEX pheno_hunts_tent_id_idx ON public.pheno_hunts (tent_id);

CREATE TRIGGER trg_pheno_hunts_set_user_id
  BEFORE INSERT ON public.pheno_hunts
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_auth();

CREATE TRIGGER trg_pheno_hunts_set_updated_at
  BEFORE UPDATE ON public.pheno_hunts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pheno_hunts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pheno_hunts"
  ON public.pheno_hunts FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own pheno_hunts"
  ON public.pheno_hunts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own pheno_hunts"
  ON public.pheno_hunts FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own pheno_hunts"
  ON public.pheno_hunts FOR DELETE
  USING (auth.uid() = user_id);
CREATE POLICY "Operators view all pheno_hunts"
  ON public.pheno_hunts FOR SELECT
  USING (public.has_role(auth.uid(), 'operator'::public.app_role));
CREATE POLICY "Operators update all pheno_hunts"
  ON public.pheno_hunts FOR UPDATE
  USING (public.has_role(auth.uid(), 'operator'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'operator'::public.app_role));

-- Tag candidate plants directly on plants. No separate candidates table.
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS pheno_hunt_id uuid REFERENCES public.pheno_hunts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS candidate_label text;

CREATE INDEX IF NOT EXISTS plants_pheno_hunt_id_idx
  ON public.plants (pheno_hunt_id);
