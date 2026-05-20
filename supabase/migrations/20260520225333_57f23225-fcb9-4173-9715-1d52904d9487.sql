-- Per-grow environment target ranges
CREATE TABLE public.grow_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  grow_id uuid NOT NULL REFERENCES public.grows(id) ON DELETE CASCADE,
  temp_min numeric,
  temp_max numeric,
  rh_min numeric,
  rh_max numeric,
  vpd_min numeric,
  vpd_max numeric,
  soil_wc_min numeric,
  soil_wc_max numeric,
  soil_ec_min numeric,
  soil_ec_max numeric,
  soil_temp_min numeric,
  soil_temp_max numeric,
  ppfd_min numeric,
  ppfd_max numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grow_targets_grow_unique UNIQUE (grow_id),
  CONSTRAINT grow_targets_temp_range CHECK (temp_min IS NULL OR temp_max IS NULL OR temp_min <= temp_max),
  CONSTRAINT grow_targets_rh_range CHECK (rh_min IS NULL OR rh_max IS NULL OR rh_min <= rh_max),
  CONSTRAINT grow_targets_vpd_range CHECK (vpd_min IS NULL OR vpd_max IS NULL OR vpd_min <= vpd_max),
  CONSTRAINT grow_targets_soil_wc_range CHECK (soil_wc_min IS NULL OR soil_wc_max IS NULL OR soil_wc_min <= soil_wc_max),
  CONSTRAINT grow_targets_soil_ec_range CHECK (soil_ec_min IS NULL OR soil_ec_max IS NULL OR soil_ec_min <= soil_ec_max),
  CONSTRAINT grow_targets_soil_temp_range CHECK (soil_temp_min IS NULL OR soil_temp_max IS NULL OR soil_temp_min <= soil_temp_max),
  CONSTRAINT grow_targets_ppfd_range CHECK (ppfd_min IS NULL OR ppfd_max IS NULL OR ppfd_min <= ppfd_max)
);

ALTER TABLE public.grow_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own grow_targets"
  ON public.grow_targets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own grow_targets"
  ON public.grow_targets FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = grow_targets.grow_id AND g.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update own grow_targets"
  ON public.grow_targets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = grow_targets.grow_id AND g.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own grow_targets"
  ON public.grow_targets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER grow_targets_set_updated_at
  BEFORE UPDATE ON public.grow_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_grow_targets_user ON public.grow_targets(user_id);
CREATE INDEX idx_grow_targets_grow ON public.grow_targets(grow_id);