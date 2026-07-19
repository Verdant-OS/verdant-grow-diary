-- CONTRACT STAGE TEMPLATE -- NOT AUTO-APPLIED BY `supabase db push`.
--
-- After the expand migration is applied, PostgREST has reloaded its schema,
-- both updated edge functions have produced verified service-overload spends,
-- and the expand-phase runtime harness passes, copy this exact SQL into a new
-- timestamped file under supabase/migrations/ in a separate contract release.
-- Do not move this file into the automatic migration directory sooner.

-- Fail closed unless the database is in the expected verified expand shape.
-- External edge receipts are still required by the runbook; this preflight
-- prevents contraction against a missing or mis-granted overload.
DO $contract_preflight$
DECLARE
  v_service_spend regprocedure := to_regprocedure(
    'public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)'
  );
  v_service_refund regprocedure := to_regprocedure(
    'public.ai_credit_refund(uuid,uuid,text,text)'
  );
  v_attach_result regprocedure := to_regprocedure(
    'public.ai_credit_attach_result(uuid,uuid,text,jsonb)'
  );
  v_result_cache regclass := to_regclass('public.ai_credit_spend_results');
  v_legacy_spend regprocedure := to_regprocedure(
    'public.ai_credit_spend(text,uuid,text,text,jsonb)'
  );
  v_legacy_refund regprocedure := to_regprocedure(
    'public.ai_credit_refund(uuid,text,text)'
  );
BEGIN
  IF v_service_spend IS NULL OR v_service_refund IS NULL
     OR v_attach_result IS NULL OR v_result_cache IS NULL
     OR v_legacy_spend IS NULL OR v_legacy_refund IS NULL THEN
    RAISE EXCEPTION 'ai-credit contract blocked: expected expand overloads are missing';
  END IF;

  IF NOT has_function_privilege('service_role', v_service_spend::oid, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_service_refund::oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_service_spend::oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_service_refund::oid, 'EXECUTE')
     OR has_function_privilege('anon', v_service_spend::oid, 'EXECUTE')
     OR has_function_privilege('anon', v_service_refund::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ai-credit contract blocked: service overload grants do not match expand state';
  END IF;

  IF NOT has_function_privilege('service_role', v_attach_result::oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_attach_result::oid, 'EXECUTE')
     OR has_function_privilege('anon', v_attach_result::oid, 'EXECUTE')
     OR NOT has_table_privilege('service_role', v_result_cache::oid, 'SELECT')
     OR has_table_privilege('service_role', v_result_cache::oid, 'INSERT')
     OR has_table_privilege('service_role', v_result_cache::oid, 'UPDATE')
     OR has_table_privilege('service_role', v_result_cache::oid, 'DELETE')
     OR has_table_privilege('authenticated', v_result_cache::oid, 'SELECT')
     OR has_table_privilege('authenticated', v_result_cache::oid, 'INSERT')
     OR has_table_privilege('anon', v_result_cache::oid, 'SELECT')
     OR has_table_privilege('anon', v_result_cache::oid, 'INSERT') THEN
    RAISE EXCEPTION 'ai-credit contract blocked: result cache grants do not match expand state';
  END IF;

  IF NOT has_function_privilege('authenticated', v_legacy_spend::oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_legacy_refund::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ai-credit contract blocked: legacy compatibility grants are already missing';
  END IF;
END;
$contract_preflight$;

-- Retire the browser-callable spend/refund overloads. Leaving their
-- definitions owner-only keeps an explicit emergency rollback possible while
-- removing authenticated self-spend and self-refund in the final state.
REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.ai_credit_spend(text, uuid, text, text, jsonb) FROM service_role;

REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, text, text) FROM service_role;

-- Reassert the final grants on the service-only overloads.
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_spend(uuid, text, text, uuid, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.ai_credit_refund(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_refund(uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.ai_credit_attach_result(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_credit_attach_result(uuid, uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ai_credit_attach_result(uuid, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_credit_attach_result(uuid, uuid, text, jsonb) TO service_role;

REVOKE ALL ON TABLE public.ai_credit_spend_results FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_credit_spend_results FROM anon;
REVOKE ALL ON TABLE public.ai_credit_spend_results FROM authenticated;
REVOKE ALL ON TABLE public.ai_credit_spend_results FROM service_role;
GRANT SELECT ON TABLE public.ai_credit_spend_results TO service_role;

NOTIFY pgrst, 'reload schema';
