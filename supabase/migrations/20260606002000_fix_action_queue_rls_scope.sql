-- Fix action_queue RLS lineage checks so referenced tents/plants are bound
-- to the action_queue row being inserted or updated, not to the inner
-- subquery row aliases.

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
      action_queue.tent_id IS NULL OR (
        action_queue.tent_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.tents t
          WHERE t.id = action_queue.tent_id
            AND t.user_id = auth.uid()
            AND t.grow_id = action_queue.grow_id
        )
      )
    )
    AND (
      action_queue.plant_id IS NULL OR (
        action_queue.plant_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.plants p
          WHERE p.id = action_queue.plant_id
            AND p.user_id = auth.uid()
            AND p.grow_id = action_queue.grow_id
        )
      )
    )
    AND (
      action_queue.plant_id IS NULL OR action_queue.tent_id IS NULL OR (
        action_queue.plant_id IS NOT NULL
        AND action_queue.tent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.plants p
          WHERE p.id = action_queue.plant_id
            AND p.user_id = auth.uid()
            AND p.grow_id = action_queue.grow_id
            AND p.tent_id = action_queue.tent_id
        )
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
      action_queue.tent_id IS NULL OR (
        action_queue.tent_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.tents t
          WHERE t.id = action_queue.tent_id
            AND t.user_id = auth.uid()
            AND t.grow_id = action_queue.grow_id
        )
      )
    )
    AND (
      action_queue.plant_id IS NULL OR (
        action_queue.plant_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.plants p
          WHERE p.id = action_queue.plant_id
            AND p.user_id = auth.uid()
            AND p.grow_id = action_queue.grow_id
        )
      )
    )
    AND (
      action_queue.plant_id IS NULL OR action_queue.tent_id IS NULL OR (
        action_queue.plant_id IS NOT NULL
        AND action_queue.tent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.plants p
          WHERE p.id = action_queue.plant_id
            AND p.user_id = auth.uid()
            AND p.grow_id = action_queue.grow_id
            AND p.tent_id = action_queue.tent_id
        )
      )
    )
  );
