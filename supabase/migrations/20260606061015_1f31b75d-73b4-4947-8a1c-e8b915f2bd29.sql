-- Restore deleted tent as archived placeholder to resolve orphan tent_id references.
-- One-shot data repair. INSERT-only into public.tents. No schema, RLS, FK, or policy changes.
-- Orphan rows are NOT touched; their tent_id values will simply resolve again once this row exists.
--
-- Precheck verified (2026-06-06):
--   missing tent id : d43e3ea9-5790-4fe2-89f3-7102b7e44b62
--   owner user_id   : 7f361b2d-087a-4a77-af36-e1cc19cc64a8
--   grow_id         : fee28aa8-c0f3-442a-8c81-3b005f4d83c2 ("Flowering", owner-matched, archived)
--   orphan rows     : sensor_readings=8, plants=2, diary_entries=2 (others=0) -> 12 total
--
-- Note: the operator request mentioned a `room_type` column; that column does not
-- exist on public.tents. To avoid a schema change in this isolated data-cleanup
-- migration, the "recovered" marker is recorded inside hardware_config instead.
INSERT INTO public.tents (
  id,
  user_id,
  grow_id,
  name,
  stage,
  light_on,
  is_archived,
  schema_version,
  hardware_config
)
SELECT
  'd43e3ea9-5790-4fe2-89f3-7102b7e44b62'::uuid,
  '7f361b2d-087a-4a77-af36-e1cc19cc64a8'::uuid,
  'fee28aa8-c0f3-442a-8c81-3b005f4d83c2'::uuid,
  'Recovered Tent (auto-restored)',
  'veg',
  true,
  true,
  1,
  jsonb_build_object(
    'restored_from_orphan_cleanup', true,
    'restored_reason', 'orphan_tent_reference_repair',
    'restored_at', now(),
    'orphan_rows_repaired', 12,
    'source', 'one_shot_migration',
    'room_type', 'recovered'
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.tents WHERE id = 'd43e3ea9-5790-4fe2-89f3-7102b7e44b62'::uuid
);