CREATE INDEX IF NOT EXISTS idx_sensor_readings_tent_effective_order
  ON public.sensor_readings (tent_id, captured_at DESC NULLS LAST, ts DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_diary_entries_user_entry_at
  ON public.diary_entries (user_id, entry_at DESC);