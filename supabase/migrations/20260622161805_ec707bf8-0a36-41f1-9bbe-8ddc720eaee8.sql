-- Owner-scoped DELETE policy for bridge_tokens so users can hard-revoke
-- their own tokens from the client. Soft-revoke via revoked_at remains
-- available through the existing UPDATE policy and edge function.
DROP POLICY IF EXISTS "Users delete own bridge_tokens" ON public.bridge_tokens;

CREATE POLICY "Users delete own bridge_tokens"
ON public.bridge_tokens
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);