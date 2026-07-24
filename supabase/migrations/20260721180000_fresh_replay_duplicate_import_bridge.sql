-- Fresh-replay bridge for the immutable 20260721 Lovable import batch.
--
-- The deploy branch contains two already-published representations of the
-- same schema changes: descriptive migrations ending at 20260721107000 and
-- later immutable UUID migrations beginning at 20260721182752. The UUID
-- files must remain byte-for-byte unchanged, but a fresh replay reaches them
-- after the descriptive files and otherwise stops on duplicate objects.
--
-- This bridge is deliberately ordered immediately before the imported batch.
-- Existing environments that have recorded any imported version NO-OP. A
-- fresh/partial environment may continue only when every duplicated table is
-- empty; any data aborts the migration before cleanup. The imported migrations
-- then recreate the canonical objects from their published bodies.

DO $bridge$
DECLARE
  v_table text;
  v_count bigint;
  v_duplicate_tables constant text[] := ARRAY[
    'public.referrals',
    'public.quarantine_transition_events',
    'public.quarantine_episodes',
    'public.genetics_screening_results',
    'public.plant_origin_assignment_events',
    'public.plant_origin_assignments',
    'public.propagation_batch_status_events',
    'public.propagation_batches',
    'public.genetics_accessions',
    'public.genetics_mutation_idempotency',
    'public.phenoid_ingest_idempotency',
    'public.phenoid_fights',
    'public.phenoid_candidate_extras',
    'public.ai_doctor_review_evidence_receipts',
    'public.vpd_measurement_provenance',
    'public.vpd_calibration_records',
    'public.ai_credit_spend_results',
    'public.ai_credit_grants'
  ];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version >= '20260721182752'
  ) THEN
    RAISE NOTICE
      'fresh replay bridge skipped: imported migration batch is already recorded';
    RETURN;
  END IF;

  FOREACH v_table IN ARRAY v_duplicate_tables LOOP
    IF to_regclass(v_table) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM %s', v_table) INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'fresh replay bridge refused to remove a non-empty duplicate object',
        DETAIL = format('table=%s row_count=%s', v_table, v_count),
        HINT =
          'Do not bypass this guard. Reconcile migration history for this environment manually.';
    END IF;
  END LOOP;

  -- Constraints added by the earlier descriptive copies live on base tables
  -- and therefore are not removed by dropping the duplicate sidecar tables.
  ALTER TABLE public.ai_doctor_sessions
    DROP CONSTRAINT IF EXISTS ai_doctor_sessions_user_id_fkey;
  ALTER TABLE public.ai_credit_spends
    DROP CONSTRAINT IF EXISTS ai_credit_spends_new_result_must_be_null;
  ALTER TABLE public.ai_credit_spends
    ADD CONSTRAINT ai_credit_spends_grow_id_fkey
    FOREIGN KEY (grow_id)
    REFERENCES public.grows(id)
    ON DELETE CASCADE;

  -- Reverse dependency order. CASCADE is safe only after the empty-table guard
  -- above and only before the imported batch has been recorded.
  FOREACH v_table IN ARRAY v_duplicate_tables LOOP
    IF to_regclass(v_table) IS NOT NULL THEN
      EXECUTE format('DROP TABLE %s CASCADE', v_table);
    END IF;
  END LOOP;

  -- Local Supabase hardens default ACLs before replay. The later immutable
  -- irrigation migration validates production-parity read/server grants while
  -- revoking client writes, so establish that baseline before it executes.
  GRANT SELECT ON TABLE
    public.grow_events,
    public.watering_events,
    public.feeding_events
  TO authenticated;
  GRANT ALL ON TABLE
    public.grow_events,
    public.watering_events,
    public.feeding_events
  TO service_role;
END
$bridge$;
