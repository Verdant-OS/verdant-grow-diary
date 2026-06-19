-- Owner-path-scoped UPDATE/DELETE policies for the `verdant` storage bucket.
-- Mirrors existing INSERT ("Users upload own verdant objects") and SELECT
-- ("Users view own verdant objects") policies. Least privilege: only the
-- authenticated owner whose user id is the first path segment may modify
-- or delete their own objects. The bucket stays private.

DROP POLICY IF EXISTS "Users update own verdant objects" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own verdant objects" ON storage.objects;

CREATE POLICY "Users update own verdant objects"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'verdant'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'verdant'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "Users delete own verdant objects"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'verdant'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );