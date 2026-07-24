-- Preserve grower-authored manual readings and CSV history imports while
-- reserving trusted live / transport provenance for server-side bridge
-- ingestion.  The service role bypasses RLS, so validated Edge Functions
-- can still write live, ecowitt, mqtt, webhook, and pi_bridge rows.

DROP POLICY IF EXISTS "Users insert own readings" ON public.sensor_readings;

CREATE POLICY "Users insert own readings"
ON public.sensor_readings
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND source IN ('manual', 'csv')
  AND EXISTS (
    SELECT 1
    FROM public.tents t
    WHERE t.id = sensor_readings.tent_id
      AND t.user_id = auth.uid()
  )
);

COMMENT ON POLICY "Users insert own readings" ON public.sensor_readings IS
  'Authenticated clients may insert only manual or CSV readings into tents they own. Trusted live and transport sources are server-only.';
