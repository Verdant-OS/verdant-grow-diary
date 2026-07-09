-- Phase 2b: Additive Data API grants on public.subscriptions so the
-- entitlement resolver (authenticated) and webhook (service_role) can reach
-- the table. RLS policy already scopes SELECT to auth.uid() = user_id.
-- No RLS/column changes. No INSERT/UPDATE/DELETE for authenticated.
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL    ON public.subscriptions TO service_role;