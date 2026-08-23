-- Deny-all marker policy: silences the rls_enabled_no_policy advisor on the
-- server-only receipts sidecar WITHOUT changing behavior. Receipts stay
-- server-only (see 20260719180000_ai_doctor_review_evidence_receipts): RLS
-- remains default-deny for every role, all table privileges stay revoked from
-- anon/authenticated, and writes flow only through the SECURITY DEFINER
-- finalizer public.ai_doctor_finalize_review.
CREATE POLICY "server_only_no_client_access"
  ON public.ai_doctor_review_evidence_receipts
  FOR SELECT TO authenticated
  USING (false);;
