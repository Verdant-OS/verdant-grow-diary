-- Enforce global uniqueness of bridge_id on public.pi_ingest_bridge_credentials.
-- This satisfies Option A of the bridge credential lookup contract and unlocks
-- a future singular server-only lookup. Migration is strictly defensive: it
-- raises if duplicate bridge_id values already exist instead of silently
-- merging/deleting rows. The existing (user_id, bridge_id) uniqueness is
-- preserved.

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT bridge_id
    FROM public.pi_ingest_bridge_credentials
    GROUP BY bridge_id
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add global unique constraint on pi_ingest_bridge_credentials.bridge_id: % duplicate bridge_id value(s) exist. Resolve duplicates before re-running this migration.',
      dup_count;
  END IF;
END $$;

ALTER TABLE public.pi_ingest_bridge_credentials
  ADD CONSTRAINT pi_ingest_bridge_credentials_bridge_id_global_unique
  UNIQUE (bridge_id);