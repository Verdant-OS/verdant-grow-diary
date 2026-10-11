-- Additive forward-repair. Reasserts the current git INSERT contract for
-- environments that missed 20260721185958 / 20260728031940. Idempotent
-- DROP/CREATE. Not a history rewrite. Not for knk production APPLY in this PR.
--
-- WITH CHECK is byte-equivalent to
-- 20260728031940_reserve_operator_ggs_attestation_provenance.sql.

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
