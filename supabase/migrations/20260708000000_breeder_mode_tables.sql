-- 20260708000000_breeder_mode_tables.sql

CREATE TABLE public.hunts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  strain text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hunts_user ON public.hunts (user_id, status);

ALTER TABLE public.hunts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own hunts" ON public.hunts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own hunts" ON public.hunts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own hunts" ON public.hunts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own hunts" ON public.hunts FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_hunts_set_updated_at BEFORE UPDATE ON public.hunts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add breeding columns to public.plants
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS hunt_id uuid REFERENCES public.hunts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pheno_name text,
  ADD COLUMN IF NOT EXISTS is_keeper boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS terpene_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

-- lab_tests
CREATE TABLE public.lab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  tested_at timestamptz NOT NULL DEFAULT now(),
  thca_percent numeric,
  thc_percent numeric,
  cbda_percent numeric,
  cbd_percent numeric,
  terpenes jsonb NOT NULL DEFAULT '{}'::jsonb,
  lab_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lab_tests_user ON public.lab_tests (user_id);
CREATE INDEX idx_lab_tests_plant ON public.lab_tests (plant_id);

ALTER TABLE public.lab_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own lab tests" ON public.lab_tests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own lab tests" ON public.lab_tests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own lab tests" ON public.lab_tests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own lab tests" ON public.lab_tests FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_lab_tests_set_updated_at BEFORE UPDATE ON public.lab_tests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
