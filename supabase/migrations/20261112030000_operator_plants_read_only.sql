-- =========================================================================
-- Operators are read-only on growers' plants.
--
-- 20260517010926 created "Operators update all plants": any account holding
-- the operator role could UPDATE every column of every grower's plant row,
-- with no owner check. It is the only operator write policy on a core grow
-- table (operator access to diary entries, tents, sensor readings and alerts
-- is SELECT only), and no application surface uses it.
--
-- This migration removes that one policy. It changes nothing else:
--   * "Operators view all plants" (SELECT) stays, so operator read views work.
--   * "Users update own plants" stays, so growers edit their own plants.
--   * No grant, table, column, function or other policy is touched.
--
-- Idempotent: re-applying is a no-op.
--
-- Rollback (restores the previous behavior exactly):
--   CREATE POLICY "Operators update all plants"
--     ON public.plants FOR UPDATE
--     TO authenticated
--     USING (public.has_role(auth.uid(), 'operator'))
--     WITH CHECK (public.has_role(auth.uid(), 'operator'));
-- =========================================================================

DROP POLICY IF EXISTS "Operators update all plants" ON public.plants;

-- Fail closed: abort (and roll the DROP back) if the policy is still present.
DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plants'
      AND policyname = 'Operators update all plants'
  ) THEN
    RAISE EXCEPTION
      'operator plants read-only: policy "Operators update all plants" still exists on public.plants';
  END IF;
END;
$postflight$;
