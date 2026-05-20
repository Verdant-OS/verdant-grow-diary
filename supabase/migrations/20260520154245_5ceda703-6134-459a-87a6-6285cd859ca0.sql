-- 1. Add nullable grow_id to tents and plants.
ALTER TABLE public.tents
  ADD COLUMN IF NOT EXISTS grow_id uuid REFERENCES public.grows(id) ON DELETE SET NULL;

ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS grow_id uuid REFERENCES public.grows(id) ON DELETE SET NULL;

-- 2. Backfill tents.grow_id from diary_entries when unambiguous (single distinct grow).
UPDATE public.tents t
SET grow_id = sub.grow_id
FROM (
  SELECT tent_id,
         (array_agg(DISTINCT grow_id))[1] AS grow_id
  FROM public.diary_entries
  WHERE tent_id IS NOT NULL
  GROUP BY tent_id
  HAVING COUNT(DISTINCT grow_id) = 1
) sub
WHERE t.id = sub.tent_id AND t.grow_id IS NULL;

-- 2b. Backfill tents.grow_id where the user has exactly one grow.
UPDATE public.tents t
SET grow_id = g.id
FROM (
  SELECT user_id, (array_agg(id))[1] AS id
  FROM public.grows
  GROUP BY user_id
  HAVING COUNT(*) = 1
) g
WHERE t.user_id = g.user_id AND t.grow_id IS NULL;

-- 3. Backfill plants.grow_id from diary_entries when unambiguous.
UPDATE public.plants p
SET grow_id = sub.grow_id
FROM (
  SELECT plant_id,
         (array_agg(DISTINCT grow_id))[1] AS grow_id
  FROM public.diary_entries
  WHERE plant_id IS NOT NULL
  GROUP BY plant_id
  HAVING COUNT(DISTINCT grow_id) = 1
) sub
WHERE p.id = sub.plant_id AND p.grow_id IS NULL;

-- 3b. Backfill plants.grow_id via owning tent's now-known grow.
UPDATE public.plants p
SET grow_id = t.grow_id
FROM public.tents t
WHERE p.tent_id = t.id
  AND p.grow_id IS NULL
  AND t.grow_id IS NOT NULL;

-- 3c. Backfill plants.grow_id where the user has exactly one grow.
UPDATE public.plants p
SET grow_id = g.id
FROM (
  SELECT user_id, (array_agg(id))[1] AS id
  FROM public.grows
  GROUP BY user_id
  HAVING COUNT(*) = 1
) g
WHERE p.user_id = g.user_id AND p.grow_id IS NULL;

-- 4. Indexes.
CREATE INDEX IF NOT EXISTS tents_user_grow_idx  ON public.tents  (user_id, grow_id);
CREATE INDEX IF NOT EXISTS plants_user_grow_idx ON public.plants (user_id, grow_id);
CREATE INDEX IF NOT EXISTS plants_tent_idx      ON public.plants (tent_id);

-- 5. action_queue policies: same-grow tightening.
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
      tent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.tents t
        WHERE t.id = tent_id
          AND t.user_id = auth.uid()
          AND t.grow_id = grow_id
      )
    )
    AND (
      plant_id IS NULL OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = plant_id
          AND p.user_id = auth.uid()
          AND p.grow_id = grow_id
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
      tent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.tents t
        WHERE t.id = tent_id
          AND t.user_id = auth.uid()
          AND t.grow_id = grow_id
      )
    )
    AND (
      plant_id IS NULL OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = plant_id
          AND p.user_id = auth.uid()
          AND p.grow_id = grow_id
      )
    )
    AND (
      plant_id IS NULL OR tent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = plant_id AND p.tent_id = tent_id
      )
    )
  );