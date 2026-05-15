
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP POLICY "Public can view diary photos" ON storage.objects;
CREATE POLICY "Users list own diary photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'diary-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
