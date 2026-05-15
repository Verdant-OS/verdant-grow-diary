UPDATE storage.buckets SET public = false WHERE id = 'diary-photos';

DROP POLICY IF EXISTS "Public can view diary photos" ON storage.objects;

CREATE POLICY "Users view own diary photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'diary-photos' AND auth.uid()::text = (storage.foldername(name))[1]);