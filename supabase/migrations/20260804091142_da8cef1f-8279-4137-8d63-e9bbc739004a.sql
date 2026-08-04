-- Server/trigger-only routines: no client execution at all.
REVOKE EXECUTE ON FUNCTION public.action_queue_guard_decision_fields() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_diary_entry_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_block_gamification_updates() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.genetics_assignment_cycle_guard() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.genetics_batch_mother_cycle_guard() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_staff_role_for_verified_email() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_staff_role_for_verified_allowlist() FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.purge_edge_function_metric_events(integer, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_credit_refund(uuid, text, text) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.genetics_lock_lineage(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.genetics_lineage_has_cycle(uuid, text, uuid, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.genetics_subject_evidence(uuid, text, uuid) FROM anon, authenticated;

-- Grower-only routines: signed-in growers keep access, signed-out visitors lose it.
REVOKE EXECUTE ON FUNCTION public.admin_schema_audit(text[], text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_schema_audit(text[], text[], jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.quicklog_save_manual(text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.genetics_accession_upsert(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.genetics_accession_archive(text, uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.genetics_assign_plants(text, uuid, uuid[], text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.genetics_batch_upsert(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.genetics_quarantine_open(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.genetics_quarantine_transition(text, uuid, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.genetics_screening_record(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.genetics_trace_resolve(text, uuid, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pheno_ingest(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_phenoid_entitlement(uuid) FROM anon;
