-- Expand the stage check constraint to allow the six canonical stages
-- plus the legacy stages already present in production data. Then
-- idempotently insert any missing global default rows.
--
-- Safety:
--   * RLS unchanged. Global rows (user_id IS NULL) remain readable by all
--     authenticated users and are NOT writable by any client policy.
--   * Partial unique index vpd_targets_global_stage_uidx still enforces
--     one global row per stage, so re-running is a no-op.
--   * No automation, no Action Queue inserts, no device control.

ALTER TABLE public.vpd_targets DROP CONSTRAINT IF EXISTS vpd_targets_stage_chk;
ALTER TABLE public.vpd_targets
  ADD CONSTRAINT vpd_targets_stage_chk
  CHECK (stage = ANY (ARRAY[
    -- canonical six
    'seedling','early_veg','late_veg','early_flower','mid_late_flower','ripening',
    -- legacy values retained for backwards compatibility
    'veg','preflower','flower','late_flower'
  ]));

INSERT INTO public.vpd_targets (user_id, stage, vpd_low_kpa, vpd_high_kpa)
VALUES
  (NULL, 'seedling',         0.40, 0.80),
  (NULL, 'early_veg',        0.70, 1.10),
  (NULL, 'late_veg',         0.90, 1.20),
  (NULL, 'early_flower',     1.00, 1.30),
  (NULL, 'mid_late_flower',  1.10, 1.50),
  (NULL, 'ripening',         1.20, 1.60)
ON CONFLICT (stage) WHERE user_id IS NULL DO NOTHING;