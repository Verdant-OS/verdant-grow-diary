
-- Grows table
CREATE TABLE public.grows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grow_type TEXT NOT NULL DEFAULT 'tent',
  stage TEXT NOT NULL DEFAULT 'seedling',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.grows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own grows" ON public.grows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own grows" ON public.grows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own grows" ON public.grows FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own grows" ON public.grows FOR DELETE USING (auth.uid() = user_id);

-- Diary entries
CREATE TABLE public.diary_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grow_id UUID NOT NULL REFERENCES public.grows(id) ON DELETE CASCADE,
  photo_url TEXT,
  note TEXT NOT NULL,
  stage TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  entry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own entries" ON public.diary_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own entries" ON public.diary_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own entries" ON public.diary_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own entries" ON public.diary_entries FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_diary_entries_grow_at ON public.diary_entries(grow_id, entry_at DESC);
CREATE INDEX idx_grows_user ON public.grows(user_id, is_archived);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER grows_updated_at BEFORE UPDATE ON public.grows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for diary photos
INSERT INTO storage.buckets (id, name, public) VALUES ('diary-photos', 'diary-photos', true);

CREATE POLICY "Public can view diary photos" ON storage.objects FOR SELECT USING (bucket_id = 'diary-photos');
CREATE POLICY "Users upload own diary photos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'diary-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own diary photos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'diary-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own diary photos" ON storage.objects FOR DELETE
  USING (bucket_id = 'diary-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
