-- Reserve the operator-attested GGS provenance envelope for the
-- service-role-only pi_ingest_commit_batch path. Growers retain direct
-- manual/CSV inserts into their own tents, but an authenticated client may
-- not self-assert either server-authored marker in raw_payload.

DROP POLICY IF EXISTS "Users insert own readings" ON public.sensor_readings;

CREATE POLICY "Users insert own readings"
ON public.sensor_readings
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND source IN ('manual', 'csv')
  AND COALESCE(raw_payload ->> 'provenance', '') <> 'operator_attested_real_payload'
  AND COALESCE(
    raw_payload #>> '{operator_attestation,boundary}',
    ''
  ) <> 'operator-ggs-real-payload-commit'
  AND EXISTS (
    SELECT 1
    FROM public.tents t
    WHERE t.id = sensor_readings.tent_id
      AND t.user_id = auth.uid()
  )
);

COMMENT ON POLICY "Users insert own readings" ON public.sensor_readings IS
  'Authenticated clients may insert manual or CSV readings into tents they own, but cannot self-assert server-authored operator GGS attestation provenance. Trusted live/transport and operator-attested writes remain server-only.';
