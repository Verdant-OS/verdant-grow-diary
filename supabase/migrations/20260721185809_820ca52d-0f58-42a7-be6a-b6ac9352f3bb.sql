-- Backfill schema_migrations for 5 verified near-duplicate pairs.
-- Remote already has equivalent rows applied under +1..+3s timestamps
-- (same `name` field, distinctive objects verified present). Inserting the
-- local version keys so tooling stops flagging the local files as pending.
-- Data-only: no DDL executed against public schema.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('20260719044601', '20260719044601_4a9e443b-d980-4890-b85e-5ae6549a907f', ARRAY['-- backfilled: equivalent applied as 20260719044602']),
  ('20260719052812', '20260719052812_c25ba6a6-dcdb-40c7-9dbf-292b35af9150', ARRAY['-- backfilled: equivalent applied as 20260719052814']),
  ('20260719063713', '20260719063713_387faf67-35ad-4d20-ae4e-4a7419ec8966', ARRAY['-- backfilled: equivalent applied as 20260719063714']),
  ('20260720162307', '20260720162307_7553dade-f540-4641-95ff-f647054e7bcc', ARRAY['-- backfilled: equivalent applied as 20260720162310']),
  ('20260720163146', '20260720163146_262abccd-33d7-4431-8b43-5ce7683a15e5', ARRAY['-- backfilled: equivalent applied as 20260720163148'])
ON CONFLICT (version) DO NOTHING;