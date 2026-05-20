-- Harden tents UPDATE policy so users can only assign grow_id to their own grows
DROP POLICY IF EXISTS "Users update own tents" ON public.tents;

CREATE POLICY "Users update own tents"
ON public.tents
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    grow_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = tents.grow_id AND g.user_id = auth.uid()
    )
  )
);

-- Mirror on INSERT
DROP POLICY IF EXISTS "Users insert own tents" ON public.tents;

CREATE POLICY "Users insert own tents"
ON public.tents
FOR INSERT
TO public
WITH CHECK (
  auth.uid() = user_id
  AND (
    grow_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = tents.grow_id AND g.user_id = auth.uid()
    )
  )
);