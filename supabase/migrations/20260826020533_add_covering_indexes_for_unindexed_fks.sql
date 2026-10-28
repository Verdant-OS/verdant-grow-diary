-- Verdant: add covering indexes for the 23 foreign keys flagged by advisor lint 0001.
-- All target tables are currently <=120 kB / <=7 rows, so plain CREATE INDEX takes a
-- negligible ACCESS EXCLUSIVE lock. Revisit with CONCURRENTLY once these tables carry real volume.
-- Additive only: no RLS, policy, or column semantics change.
-- Rollback: DROP INDEX IF EXISTS <name>;

CREATE INDEX IF NOT EXISTS action_queue_plant_id_idx ON public.action_queue (plant_id);
CREATE INDEX IF NOT EXISTS action_queue_tent_id_idx ON public.action_queue (tent_id);
CREATE INDEX IF NOT EXISTS action_queue_events_grow_id_idx ON public.action_queue_events (grow_id);
CREATE INDEX IF NOT EXISTS ai_credit_grants_reverses_idx ON public.ai_credit_grants (reverses);
CREATE INDEX IF NOT EXISTS alert_events_grow_id_idx ON public.alert_events (grow_id);
CREATE INDEX IF NOT EXISTS alerts_plant_id_idx ON public.alerts (plant_id);
CREATE INDEX IF NOT EXISTS alerts_tent_id_idx ON public.alerts (tent_id);
CREATE INDEX IF NOT EXISTS billing_subscription_update_audit_processing_id_idx ON public.billing_subscription_update_audit (processing_id);
CREATE INDEX IF NOT EXISTS billing_subscription_update_audit_user_id_idx ON public.billing_subscription_update_audit (user_id);
CREATE INDEX IF NOT EXISTS breeding_programs_current_step_id_idx ON public.breeding_programs (current_step_id);
CREATE INDEX IF NOT EXISTS diary_entries_user_id_idx ON public.diary_entries (user_id);
CREATE INDEX IF NOT EXISTS manual_sensor_snapshot_edits_plant_id_idx ON public.manual_sensor_snapshot_edits (plant_id);
CREATE INDEX IF NOT EXISTS manual_sensor_snapshot_edits_tent_id_idx ON public.manual_sensor_snapshot_edits (tent_id);
CREATE INDEX IF NOT EXISTS pheno_keeper_decisions_log_plant_id_idx ON public.pheno_keeper_decisions_log (plant_id);
CREATE INDEX IF NOT EXISTS pheno_sex_observations_plant_id_idx ON public.pheno_sex_observations (plant_id);
CREATE INDEX IF NOT EXISTS pheno_stress_observations_linked_diary_entry_id_idx ON public.pheno_stress_observations (linked_diary_entry_id);
CREATE INDEX IF NOT EXISTS pi_ingest_idempotency_keys_sensor_reading_id_idx ON public.pi_ingest_idempotency_keys (sensor_reading_id);
CREATE INDEX IF NOT EXISTS pi_ingest_idempotency_keys_tent_id_idx ON public.pi_ingest_idempotency_keys (tent_id);
CREATE INDEX IF NOT EXISTS plants_grow_id_idx ON public.plants (grow_id);
CREATE INDEX IF NOT EXISTS soil_moisture_calibrations_grow_id_idx ON public.soil_moisture_calibrations (grow_id);
CREATE INDEX IF NOT EXISTS soil_moisture_calibrations_plant_id_idx ON public.soil_moisture_calibrations (plant_id);
CREATE INDEX IF NOT EXISTS soil_moisture_calibrations_tent_id_idx ON public.soil_moisture_calibrations (tent_id);
CREATE INDEX IF NOT EXISTS tents_grow_id_idx ON public.tents (grow_id);;
