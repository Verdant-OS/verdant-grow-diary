-- Server-authoritative Free sensor-history read window.
--
-- The capability catalog grants Free accounts 90 days of sensor history and
-- paid accounts full history. Until this migration, that limit was only a
-- client-side cutoff helper; direct PostgREST reads could request every stored
-- sensor_readings row.
--
-- This is a read filter only. No row is deleted, rewritten, archived, or
-- reclassified. service_role retains its normal RLS bypass for trusted ingest,
-- fixtures, and administrative recovery. Existing owner isolation remains the
-- permissive SELECT policy; this RESTRICTIVE policy is an additional AND fence
-- for authenticated reads.
--
-- Billing authority:
--   * public.billing_subscriptions is the incumbent/canonical branch.
--   * live public.subscriptions rows are retained as a compatibility branch
--     for the current Lovable Pro, Craft, and Founder checkout reality.
--   * absence of an entitling server-written row resolves to Free.
-- profiles.tier, staff presentation lifts, request input, and credit packs are
-- intentionally absent.

CREATE POLICY "Free sensor history is limited to 90 days"
  ON public.sensor_readings
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (
      COALESCE(captured_at, ts, created_at) >= now() - interval '90 days'
      OR EXISTS (
        SELECT 1
        FROM public.billing_subscriptions bs
        WHERE bs.user_id = (SELECT auth.uid())
          AND (
            (
              bs.plan_id IN ('pro_monthly', 'pro_annual')
              AND bs.current_period_end IS NOT NULL
              AND (
                (bs.status IN ('active', 'trialing') AND bs.current_period_end > now())
                OR bs.status = 'past_due'
                OR (bs.status = 'canceled' AND bs.current_period_end > now())
              )
            )
            OR (
              bs.plan_id = 'founder_lifetime'
              AND bs.status = 'active'
              AND bs.current_period_end IS NULL
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.subscriptions s
        WHERE s.user_id = (SELECT auth.uid())
          AND s.environment = 'live'
          AND (
            (
              s.price_id IN (
                'pro_monthly',
                'pro_annual',
                'craft_monthly',
                'craft_annual'
              )
              AND s.current_period_end IS NOT NULL
              AND (
                (s.status IN ('active', 'trialing') AND s.current_period_end > now())
                OR s.status = 'past_due'
                OR (s.status = 'canceled' AND s.current_period_end > now())
              )
            )
            OR (
              s.price_id = 'founder_lifetime'
              AND left(s.paddle_subscription_id, 9) = 'lifetime_'
              AND s.status = 'active'
              AND s.current_period_end IS NULL
            )
          )
      )
    )
  );

COMMENT ON POLICY "Free sensor history is limited to 90 days"
  ON public.sensor_readings IS
  'Authenticated Free accounts may read only their own last 90 days of sensor '
  'history. Server-entitled Pro, Craft, and Founder accounts retain full '
  'history. The policy never deletes or rewrites stored readings.';
