
DROP POLICY IF EXISTS "Users view own diary videos" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own diary videos" ON storage.objects;
DROP POLICY IF EXISTS "Users update own diary videos" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own diary videos" ON storage.objects;

CREATE POLICY "Users view own diary videos" ON storage.objects FOR SELECT
  USING (bucket_id = 'diary-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own diary videos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'diary-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own diary videos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'diary-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own diary videos" ON storage.objects FOR DELETE
  USING (bucket_id = 'diary-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
