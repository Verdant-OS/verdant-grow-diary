-- Task 1: Fix self-referential lineage checks on public.action_queue
-- INSERT/UPDATE policies. Previous policies compared a column to itself
-- (t.grow_id = t.grow_id, p.grow_id = p.grow_id, p.tent_id = p.tent_id),
-- which silently bypassed cross-resource ownership enforcement.
-- The fix binds referenced tents/plants to the action_queue row's own
-- grow_id / tent_id columns. SELECT/DELETE policies are unchanged.

DROP POLICY IF EXISTS "Users insert own action_queue" ON public.action_queue;
DROP POLICY IF EXISTS "Users update own action_queue" ON public.action_queue;

CREATE POLICY "Users insert own action_queue"
  ON public.action_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = action_queue.user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = action_queue.grow_id
        AND g.user_id = auth.uid()
    )
    AND (
      action_queue.tent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.tents t
        WHERE t.id = action_queue.tent_id
          AND t.user_id = auth.uid()
          AND t.grow_id = action_queue.grow_id
      )
    )
    AND (
      action_queue.plant_id IS NULL OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = action_queue.plant_id
          AND p.user_id = auth.uid()
          AND p.grow_id = action_queue.grow_id
      )
    )
    AND (
      action_queue.plant_id IS NULL
      OR action_queue.tent_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = action_queue.plant_id
          AND p.user_id = auth.uid()
          AND p.grow_id = action_queue.grow_id
          AND p.tent_id = action_queue.tent_id
      )
    )
  );

CREATE POLICY "Users update own action_queue"
  ON public.action_queue
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = action_queue.user_id)
  WITH CHECK (
    auth.uid() = action_queue.user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = action_queue.grow_id
        AND g.user_id = auth.uid()
    )
    AND (
      action_queue.tent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.tents t
        WHERE t.id = action_queue.tent_id
          AND t.user_id = auth.uid()
          AND t.grow_id = action_queue.grow_id
      )
    )
    AND (
      action_queue.plant_id IS NULL OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = action_queue.plant_id
          AND p.user_id = auth.uid()
          AND p.grow_id = action_queue.grow_id
      )
    )
    AND (
      action_queue.plant_id IS NULL
      OR action_queue.tent_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = action_queue.plant_id
          AND p.user_id = auth.uid()
          AND p.grow_id = action_queue.grow_id
          AND p.tent_id = action_queue.tent_id
      )
    )
  );

-- Task 2: Add per-user RLS to the private 'verdant' storage bucket.
-- The app does not currently write or read from this bucket, so only the
-- minimum operations (SELECT, INSERT) are granted, scoped to the caller's
-- own `${auth.uid()}/...` prefix (matches the diary-photos convention).
-- UPDATE/DELETE remain implicitly denied until the app requires them.

DROP POLICY IF EXISTS "Users view own verdant objects" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own verdant objects" ON storage.objects;

CREATE POLICY "Users view own verdant objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'verdant'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "Users upload own verdant objects"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'verdant'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
