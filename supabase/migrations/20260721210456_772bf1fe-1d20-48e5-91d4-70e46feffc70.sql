
-- ============ alerts: validate tent_id and plant_id ownership on INSERT/UPDATE ============
DROP POLICY IF EXISTS "Users insert own alerts" ON public.alerts;
DROP POLICY IF EXISTS "Users update own alerts" ON public.alerts;

CREATE POLICY "Users insert own alerts"
ON public.alerts
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.grows g
    WHERE g.id = alerts.grow_id AND g.user_id = auth.uid()
  )
  AND (
    alerts.tent_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.tents t
      WHERE t.id = alerts.tent_id AND t.user_id = auth.uid()
    )
  )
  AND (
    alerts.plant_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = alerts.plant_id AND p.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users update own alerts"
ON public.alerts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.grows g
    WHERE g.id = alerts.grow_id AND g.user_id = auth.uid()
  )
  AND (
    alerts.tent_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.tents t
      WHERE t.id = alerts.tent_id AND t.user_id = auth.uid()
    )
  )
  AND (
    alerts.plant_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = alerts.plant_id AND p.user_id = auth.uid()
    )
  )
);

-- ============ bridge_tokens: re-validate tent ownership on UPDATE ============
DROP POLICY IF EXISTS "Users update own bridge_tokens" ON public.bridge_tokens;

CREATE POLICY "Users update own bridge_tokens"
ON public.bridge_tokens
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.tents t
    WHERE t.id = bridge_tokens.tent_id AND t.user_id = auth.uid()
  )
);

-- ============ pi_ingest_bridge_credentials: validate allowed_tent_ids ownership ============
DROP POLICY IF EXISTS "Users insert own pi_ingest_bridge_credentials" ON public.pi_ingest_bridge_credentials;
DROP POLICY IF EXISTS "Users update own pi_ingest_bridge_credentials" ON public.pi_ingest_bridge_credentials;

CREATE POLICY "Users insert own pi_ingest_bridge_credentials"
ON public.pi_ingest_bridge_credentials
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    allowed_tent_ids IS NULL
    OR array_length(allowed_tent_ids, 1) IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(allowed_tent_ids) AS tid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tents t
        WHERE t.id = tid AND t.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Users update own pi_ingest_bridge_credentials"
ON public.pi_ingest_bridge_credentials
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    allowed_tent_ids IS NULL
    OR array_length(allowed_tent_ids, 1) IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(allowed_tent_ids) AS tid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tents t
        WHERE t.id = tid AND t.user_id = auth.uid()
      )
    )
  )
);
