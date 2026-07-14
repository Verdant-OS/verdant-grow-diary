DROP POLICY IF EXISTS "Users insert own readings" ON public.sensor_readings;

CREATE POLICY "Users insert own readings"
ON public.sensor_readings
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.tents t
    WHERE t.id = sensor_readings.tent_id
      AND t.user_id = auth.uid()
  )
);