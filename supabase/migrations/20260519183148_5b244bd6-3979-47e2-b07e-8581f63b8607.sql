ALTER TABLE public.diary_entries
  ADD COLUMN IF NOT EXISTS plant_id uuid,
  ADD COLUMN IF NOT EXISTS tent_id uuid;

UPDATE public.diary_entries
SET plant_id = (details->>'plant_id')::uuid
WHERE plant_id IS NULL
  AND details ? 'plant_id'
  AND (details->>'plant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE public.diary_entries
SET tent_id = (details->>'tent_id')::uuid
WHERE tent_id IS NULL
  AND details ? 'tent_id'
  AND (details->>'tent_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

CREATE INDEX IF NOT EXISTS idx_diary_entries_plant_entry_at
  ON public.diary_entries (plant_id, entry_at DESC)
  WHERE plant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_diary_entries_tent_entry_at
  ON public.diary_entries (tent_id, entry_at DESC)
  WHERE tent_id IS NOT NULL;