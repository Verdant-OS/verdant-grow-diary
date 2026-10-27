-- Verdant security hardening: remove PostgREST RPC exposure from server-only SECURITY DEFINER functions.
-- Findings: Supabase advisor lints 0013 + 0028, verified against pg_proc.proacl and pg_proc.prosrc.
-- service_role and postgres grants are intentionally preserved -> Edge Functions unaffected.
-- Excluded by design: has_pheno_tracker_entitlement (39 RLS policy refs), has_phenoid_entitlement.
-- Rollback: GRANT EXECUTE ON FUNCTION <sig> TO anon, authenticated;

-- Group A: server-only (Edge Function / service_role callers). No auth.uid() guard in body.
REVOKE EXECUTE ON FUNCTION public.ai_credit_attach_result(p_expected_user_id uuid, p_spend_id uuid, p_expected_feature text, p_result jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_credit_refund(p_expected_user_id uuid, p_spend_id uuid, p_idempotency_key text, p_reason text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_credit_spend(p_user_id uuid, p_billing_environment text, p_feature text, p_grow_id uuid, p_model_tier text, p_idempotency_key text, p_result jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_doctor_finalize_review(p_expected_user_id uuid, p_spend_id uuid, p_result jsonb, p_evidence jsonb, p_prompt_hmac_sha256 text, p_prompt_hmac_key_id text, p_model_id text, p_tool_schema_version text, p_prompt_contract_version text, p_session_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_paddle_subscription_update(p_processing_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_paddle_subscription_update_with_audit(p_processing_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_bridge_token_usage(p_id uuid, p_inserted integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.convert_referral(p_referrer_user_id uuid, p_referee_user_id uuid, p_code text, p_environment text, p_verified boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(queue_name text, message_id bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(queue_name text, payload jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_lovable_credit_pack(p_expected_user_id uuid, p_paddle_transaction_id text, p_credits integer, p_sku text, p_environment text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_lovable_credits(p_expected_user_id uuid, p_credits integer, p_source text, p_grant_ref text, p_environment text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_billing_subscription_update_audit(p_retention_days integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_ai_doctor_review_completion(p_spend_id uuid, p_expected_user_id uuid) FROM anon, authenticated;

-- Group B: trigger functions. Not RPC-callable by PostgREST; trigger firing does not re-check EXECUTE.
REVOKE EXECUTE ON FUNCTION public.enforce_free_creation_caps() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_staff_role_for_verified_email() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_block_gamification_updates() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_level_after_harvest() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_paid_return_cohort_membership() FROM anon, authenticated;

-- Advisor ERROR 0013: public."Verdant" is an empty (id bigint, created_at timestamptz) dashboard scaffold
-- with RLS disabled. Enabling RLS with no policy = deny-all for anon/authenticated. Reversible.
ALTER TABLE public."Verdant" ENABLE ROW LEVEL SECURITY;;
