-- Tighten action_queue ownership: also validate plant_id / tent_id ownership
-- and plant-in-tent consistency when both are provided.

DROP POLICY IF EXISTS "Users insert own action_queue" ON public.action_queue;
DROP POLICY IF EXISTS "Users update own action_queue" ON public.action_queue;

CREATE POLICY "Users insert own action_queue"
  ON public.action_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = grow_id AND g.user_id = auth.uid()
    )
    AND (
      plant_id IS NULL OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = plant_id AND p.user_id = auth.uid()
      )
    )
    AND (
      tent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.tents t
        WHERE t.id = tent_id AND t.user_id = auth.uid()
      )
    )
    AND (
      plant_id IS NULL OR tent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = plant_id AND p.tent_id = tent_id
      )
    )
  );

CREATE POLICY "Users update own action_queue"
  ON public.action_queue
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = grow_id AND g.user_id = auth.uid()
    )
    AND (
      plant_id IS NULL OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = plant_id AND p.user_id = auth.uid()
      )
    )
    AND (
      tent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.tents t
        WHERE t.id = tent_id AND t.user_id = auth.uid()
      )
    )
    AND (
      plant_id IS NULL OR tent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = plant_id AND p.tent_id = tent_id
      )
    )
  );