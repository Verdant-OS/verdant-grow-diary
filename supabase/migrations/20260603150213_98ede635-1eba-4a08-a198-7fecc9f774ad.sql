-- Plant-specific lookup (single-column, complements existing plant_time composite)
CREATE INDEX IF NOT EXISTS idx_grow_events_plant_id
  ON public.grow_events (plant_id);

-- General event type filtering (single-column, complements existing type_time composite)
CREATE INDEX IF NOT EXISTS idx_grow_events_event_type
  ON public.grow_events (event_type);