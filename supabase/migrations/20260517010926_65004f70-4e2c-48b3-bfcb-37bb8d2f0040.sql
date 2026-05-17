-- =====================================================================
-- 1. ROLES INFRASTRUCTURE
-- =====================================================================

-- Enum of supported roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('operator', 'customer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_roles table (NEVER store roles on profiles)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security-definer role check (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Policies on user_roles itself
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'operator'));

DROP POLICY IF EXISTS "Operators manage roles" ON public.user_roles;
CREATE POLICY "Operators manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'operator'));

-- =====================================================================
-- 2. PLANTS — operator access (customer policies already exist)
-- =====================================================================

DROP POLICY IF EXISTS "Operators view all plants" ON public.plants;
CREATE POLICY "Operators view all plants"
  ON public.plants FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'));

DROP POLICY IF EXISTS "Operators update all plants" ON public.plants;
CREATE POLICY "Operators update all plants"
  ON public.plants FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'operator'));

-- =====================================================================
-- 3. DIARY ENTRIES — operator read-only (customer policies already exist)
-- =====================================================================

DROP POLICY IF EXISTS "Operators view all entries" ON public.diary_entries;
CREATE POLICY "Operators view all entries"
  ON public.diary_entries FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'));

-- =====================================================================
-- 4. DIARY PHOTOS STORAGE BUCKET
--    Convention: files are stored under "<user_id>/<filename>"
-- =====================================================================

-- Customer: full CRUD on own folder
DROP POLICY IF EXISTS "Customers view own diary photos" ON storage.objects;
CREATE POLICY "Customers view own diary photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'diary-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Customers upload own diary photos" ON storage.objects;
CREATE POLICY "Customers upload own diary photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'diary-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Customers update own diary photos" ON storage.objects;
CREATE POLICY "Customers update own diary photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'diary-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Customers delete own diary photos" ON storage.objects;
CREATE POLICY "Customers delete own diary photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'diary-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Operator: read any photo for moderation (no writes)
DROP POLICY IF EXISTS "Operators view all diary photos" ON storage.objects;
CREATE POLICY "Operators view all diary photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'diary-photos'
    AND public.has_role(auth.uid(), 'operator')
  );
