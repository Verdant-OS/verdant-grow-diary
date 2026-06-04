-- =============================================================================
-- VPD target table hardening + EWMA drift evaluator
--
-- Safety contract:
--   * Helper functions use SECURITY INVOKER so caller RLS applies to
--     sensor_readings + vpd_targets lookups. No path bypasses ownership.
--   * No automation, no device control, no automatic action_queue writes.
--   * Global rows have user_id IS NULL and are owned/managed by service_role.
--   * Authenticated users may read global defaults + their own overrides
--     and may only insert/update/delete rows where user_id = auth.uid().
--   * Uniqueness is enforced by partial unique indexes so a NULL user_id
--     does not silently allow duplicate global stages.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.vpd_targets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  stage       text NOT NULL,
  vpd_low_kpa  numeric(4,2) NOT NULL,
  vpd_high_kpa numeric(4,2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vpd_targets_stage_chk
    CHECK (stage IN ('seedling','veg','preflower','flower','late_flower')),
  CONSTRAINT vpd_targets_band_chk
    CHECK (vpd_low_kpa > 0 AND vpd_high_kpa > vpd_low_kpa AND vpd_high_kpa <= 3.0)
);

-- Partial unique indexes harden uniqueness. UNIQUE(user_id, stage) alone is
-- NOT enough because NULL user_id rows are never equal to each other.
CREATE UNIQUE INDEX IF NOT EXISTS vpd_targets_global_stage_uidx
  ON public.vpd_targets (stage)
  WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vpd_targets_user_stage_uidx
  ON public.vpd_targets (user_id, stage)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS vpd_targets_user_id_idx
  ON public.vpd_targets (user_id)
  WHERE user_id IS NOT NULL;

-- Grants. service_role manages global rows; authenticated users manage their
-- own overrides under RLS. No anon access.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vpd_targets TO authenticated;
GRANT ALL ON public.vpd_targets TO service_role;

ALTER TABLE public.vpd_targets ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users may read global defaults and their own overrides.
DROP POLICY IF EXISTS "vpd_targets_select_global_or_own" ON public.vpd_targets;
CREATE POLICY "vpd_targets_select_global_or_own"
  ON public.vpd_targets
  FOR SELECT
  TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

-- INSERT: only own rows; cannot create global (user_id IS NULL) rows.
DROP POLICY IF EXISTS "vpd_targets_insert_own_only" ON public.vpd_targets;
CREATE POLICY "vpd_targets_insert_own_only"
  ON public.vpd_targets
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());

-- UPDATE: only own rows. Cannot reassign a row to another user or to global.
DROP POLICY IF EXISTS "vpd_targets_update_own_only" ON public.vpd_targets;
CREATE POLICY "vpd_targets_update_own_only"
  ON public.vpd_targets
  FOR UPDATE
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());

-- DELETE: only own rows.
DROP POLICY IF EXISTS "vpd_targets_delete_own_only" ON public.vpd_targets;
CREATE POLICY "vpd_targets_delete_own_only"
  ON public.vpd_targets
  FOR DELETE
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

-- updated_at trigger (reuses existing helper)
DROP TRIGGER IF EXISTS trg_vpd_targets_updated_at ON public.vpd_targets;
CREATE TRIGGER trg_vpd_targets_updated_at
  BEFORE UPDATE ON public.vpd_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed conservative global defaults (one row per stage). service_role bypasses
-- RLS, so this insert is allowed from migration context.
INSERT INTO public.vpd_targets (user_id, stage, vpd_low_kpa, vpd_high_kpa) VALUES
  (NULL, 'seedling',    0.40, 0.80),
  (NULL, 'veg',         0.80, 1.20),
  (NULL, 'preflower',   0.90, 1.30),
  (NULL, 'flower',      1.00, 1.50),
  (NULL, 'late_flower', 1.10, 1.50)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- evaluate_vpd_drift_ewma
--
-- Returns the EWMA of recent VPD readings for a tent and classifies it
-- against the effective stage target band (user override if present, else
-- global default). SECURITY INVOKER ensures caller RLS on both
-- sensor_readings and vpd_targets applies — bridge/ingest paths without a
-- trusted user/plant context cannot use it to discover user-specific bands.
--
-- Classification values:
--   'insufficient'   - fewer than p_min_readings valid VPD samples in window,
--                      OR no target band available for the stage
--   'sustained_high' - EWMA above the high bound
--   'sustained_low'  - EWMA below the low bound
--   'in_band'        - EWMA within [low, high]
--
-- NOTE: This function returns advisory context only. It NEVER writes to
-- action_queue, alerts, or sensor_readings.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.evaluate_vpd_drift_ewma(
  p_tent_id        uuid,
  p_stage          text,
  p_alpha          numeric DEFAULT 0.3,
  p_window_minutes integer DEFAULT 360,
  p_min_readings   integer DEFAULT 6
)
RETURNS TABLE (
  classification text,
  ewma           numeric,
  sample_count   integer,
  low_kpa        numeric,
  high_kpa       numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER  -- caller RLS on sensor_readings + vpd_targets applies
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_low      numeric;
  v_high     numeric;
  v_ewma     numeric := NULL;
  v_count    integer := 0;
  v_row      record;
BEGIN
  -- Defensive parameter validation. No exceptions for missing context — return
  -- 'insufficient' so callers degrade gracefully.
  IF p_tent_id IS NULL OR p_stage IS NULL THEN
    RETURN QUERY SELECT 'insufficient'::text, NULL::numeric, 0, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;
  IF p_alpha IS NULL OR p_alpha <= 0 OR p_alpha > 1 THEN
    p_alpha := 0.3;
  END IF;
  IF p_window_minutes IS NULL OR p_window_minutes <= 0 THEN
    p_window_minutes := 360;
  END IF;
  IF p_min_readings IS NULL OR p_min_readings < 1 THEN
    p_min_readings := 6;
  END IF;

  -- Resolve effective band: user override first, then global default.
  -- RLS will already restrict visible rows; this just prefers the user row.
  SELECT vpd_low_kpa, vpd_high_kpa
    INTO v_low, v_high
    FROM public.vpd_targets
   WHERE stage = p_stage
     AND user_id = v_uid
   LIMIT 1;

  IF v_low IS NULL THEN
    SELECT vpd_low_kpa, vpd_high_kpa
      INTO v_low, v_high
      FROM public.vpd_targets
     WHERE stage = p_stage
       AND user_id IS NULL
     LIMIT 1;
  END IF;

  IF v_low IS NULL OR v_high IS NULL THEN
    RETURN QUERY SELECT 'insufficient'::text, NULL::numeric, 0, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  -- Stream VPD readings oldest→newest, computing the EWMA.
  FOR v_row IN
    SELECT value
      FROM public.sensor_readings
     WHERE tent_id = p_tent_id
       AND metric  = 'vpd_kpa'
       AND quality = 'ok'
       AND value IS NOT NULL
       AND captured_at >= now() - make_interval(mins => p_window_minutes)
     ORDER BY captured_at ASC
  LOOP
    IF v_ewma IS NULL THEN
      v_ewma := v_row.value;
    ELSE
      v_ewma := (p_alpha * v_row.value) + ((1 - p_alpha) * v_ewma);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  IF v_count < p_min_readings OR v_ewma IS NULL THEN
    RETURN QUERY SELECT 'insufficient'::text, v_ewma, v_count, v_low, v_high;
    RETURN;
  END IF;

  IF v_ewma > v_high THEN
    RETURN QUERY SELECT 'sustained_high'::text, round(v_ewma, 3), v_count, v_low, v_high;
  ELSIF v_ewma < v_low THEN
    RETURN QUERY SELECT 'sustained_low'::text, round(v_ewma, 3), v_count, v_low, v_high;
  ELSE
    RETURN QUERY SELECT 'in_band'::text, round(v_ewma, 3), v_count, v_low, v_high;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_vpd_drift_ewma(uuid, text, numeric, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_vpd_drift_ewma(uuid, text, numeric, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_vpd_drift_ewma(uuid, text, numeric, integer, integer) TO service_role;
