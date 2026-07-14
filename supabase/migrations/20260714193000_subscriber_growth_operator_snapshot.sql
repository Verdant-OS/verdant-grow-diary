-- Read-only subscriber-growth scoreboard for authenticated operators.
-- Counts paid subscribers from billing_subscriptions (the entitlement source
-- of truth) and reports lead interest separately. No PII or row identifiers
-- leave this function, and it performs no writes.

CREATE OR REPLACE FUNCTION public.subscriber_growth_operator_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_counts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT public.has_role(auth.uid(), 'operator'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operator_required');
  END IF;

  WITH active_paid AS (
    SELECT
      bs.user_id,
      bs.plan_id,
      bs.cancel_at_period_end,
      bs.created_at
    FROM public.billing_subscriptions AS bs
    WHERE bs.plan_id IN ('pro_monthly', 'pro_annual', 'founder_lifetime')
      AND bs.status = 'active'
      AND (bs.current_period_end IS NULL OR bs.current_period_end > now())
  ),
  paid_risk AS (
    SELECT bs.user_id
    FROM public.billing_subscriptions AS bs
    WHERE bs.plan_id IN ('pro_monthly', 'pro_annual', 'founder_lifetime')
      AND bs.status IN ('past_due', 'paused')
  ),
  active_counts AS (
    SELECT
      count(DISTINCT ap.user_id) AS active_paid,
      count(DISTINCT ap.user_id) FILTER (WHERE ap.plan_id = 'pro_monthly') AS pro_monthly,
      count(DISTINCT ap.user_id) FILTER (WHERE ap.plan_id = 'pro_annual') AS pro_annual,
      count(DISTINCT ap.user_id) FILTER (WHERE ap.plan_id = 'founder_lifetime') AS founder_lifetime,
      count(DISTINCT ap.user_id) FILTER (WHERE ap.cancel_at_period_end) AS scheduled_cancellation,
      count(DISTINCT ap.user_id) FILTER (
        WHERE ap.created_at >= now() - interval '7 days'
      ) AS new_active_7d,
      count(DISTINCT ap.user_id) FILTER (
        WHERE ap.created_at >= now() - interval '30 days'
      ) AS new_active_30d
    FROM active_paid AS ap
  ),
  risk_counts AS (
    SELECT count(DISTINCT pr.user_id) AS at_risk
    FROM paid_risk AS pr
  ),
  lead_counts AS (
    SELECT
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source IN (
          'pricing_interest',
          'pricing_interest_landing',
          'pricing_interest_pricing_page',
          'pricing_interest_founder_page',
          'pricing_interest_founder_share',
          'pricing_interest_referral',
          'pricing_interest_grower_invite',
          'pricing_interest_context_check'
        )
      ) AS pricing_interest_total,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source IN (
          'pricing_interest',
          'pricing_interest_landing',
          'pricing_interest_pricing_page',
          'pricing_interest_founder_page',
          'pricing_interest_founder_share',
          'pricing_interest_referral',
          'pricing_interest_grower_invite',
          'pricing_interest_context_check'
        )
          AND l.created_at >= now() - interval '7 days'
      ) AS pricing_interest_7d,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source IN (
          'pricing_interest',
          'pricing_interest_landing',
          'pricing_interest_pricing_page',
          'pricing_interest_founder_page',
          'pricing_interest_founder_share',
          'pricing_interest_referral',
          'pricing_interest_grower_invite',
          'pricing_interest_context_check'
        )
          AND l.status IN ('new', 'reviewed')
          AND l.contacted_at IS NULL
      ) AS pricing_interest_needs_contact,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source IN (
          'pricing_interest',
          'pricing_interest_landing',
          'pricing_interest_pricing_page',
          'pricing_interest_founder_page',
          'pricing_interest_founder_share',
          'pricing_interest_referral',
          'pricing_interest_grower_invite',
          'pricing_interest_context_check'
        )
          AND l.status = 'follow_up'
          AND l.follow_up_at IS NOT NULL
          AND l.follow_up_at <= now()
      ) AS pricing_interest_follow_up_due,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source IN (
          'pricing_interest',
          'pricing_interest_landing',
          'pricing_interest_pricing_page',
          'pricing_interest_founder_page',
          'pricing_interest_founder_share',
          'pricing_interest_referral',
          'pricing_interest_grower_invite',
          'pricing_interest_context_check'
        )
          AND l.contacted_at >= now() - interval '7 days'
      ) AS pricing_interest_contacted_7d,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source = 'pricing_interest'
      ) AS pricing_interest_direct,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source = 'pricing_interest_landing'
      ) AS pricing_interest_landing,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source = 'pricing_interest_pricing_page'
      ) AS pricing_interest_pricing_page,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source = 'pricing_interest_founder_page'
      ) AS pricing_interest_founder_page,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source = 'pricing_interest_founder_share'
      ) AS pricing_interest_founder_share,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source = 'pricing_interest_referral'
      ) AS pricing_interest_referral,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source = 'pricing_interest_grower_invite'
      ) AS pricing_interest_grower_invite,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.source = 'pricing_interest_context_check'
      ) AS pricing_interest_context_check,
      count(DISTINCT lower(btrim(l.email))) FILTER (
        WHERE l.created_at >= now() - interval '7 days'
      ) AS all_leads_7d
    FROM public.leads AS l
  )
  SELECT jsonb_build_object(
    'active_paid', ac.active_paid,
    'pro_monthly', ac.pro_monthly,
    'pro_annual', ac.pro_annual,
    'founder_lifetime', ac.founder_lifetime,
    'at_risk', rc.at_risk,
    'scheduled_cancellation', ac.scheduled_cancellation,
    'new_active_7d', ac.new_active_7d,
    'new_active_30d', ac.new_active_30d,
    'pricing_interest_total', lc.pricing_interest_total,
    'pricing_interest_7d', lc.pricing_interest_7d,
    'pricing_interest_needs_contact', lc.pricing_interest_needs_contact,
    'pricing_interest_follow_up_due', lc.pricing_interest_follow_up_due,
    'pricing_interest_contacted_7d', lc.pricing_interest_contacted_7d,
    'pricing_interest_direct', lc.pricing_interest_direct,
    'pricing_interest_landing', lc.pricing_interest_landing,
    'pricing_interest_pricing_page', lc.pricing_interest_pricing_page,
    'pricing_interest_founder_page', lc.pricing_interest_founder_page,
    'pricing_interest_founder_share', lc.pricing_interest_founder_share,
    'pricing_interest_referral', lc.pricing_interest_referral,
    'pricing_interest_grower_invite', lc.pricing_interest_grower_invite,
    'pricing_interest_context_check', lc.pricing_interest_context_check,
    'all_leads_7d', lc.all_leads_7d
  )
  INTO v_counts
  FROM active_counts AS ac
  CROSS JOIN risk_counts AS rc
  CROSS JOIN lead_counts AS lc;

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'counts', COALESCE(v_counts, jsonb_build_object(
      'active_paid', 0,
      'pro_monthly', 0,
      'pro_annual', 0,
      'founder_lifetime', 0,
      'at_risk', 0,
      'scheduled_cancellation', 0,
      'new_active_7d', 0,
      'new_active_30d', 0,
      'pricing_interest_total', 0,
      'pricing_interest_7d', 0,
      'pricing_interest_needs_contact', 0,
      'pricing_interest_follow_up_due', 0,
      'pricing_interest_contacted_7d', 0,
      'pricing_interest_direct', 0,
      'pricing_interest_landing', 0,
      'pricing_interest_pricing_page', 0,
      'pricing_interest_founder_page', 0,
      'pricing_interest_founder_share', 0,
      'pricing_interest_referral', 0,
      'pricing_interest_grower_invite', 0,
      'pricing_interest_context_check', 0,
      'all_leads_7d', 0
    ))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.subscriber_growth_operator_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.subscriber_growth_operator_snapshot() FROM anon;
GRANT EXECUTE ON FUNCTION public.subscriber_growth_operator_snapshot() TO authenticated;

COMMENT ON FUNCTION public.subscriber_growth_operator_snapshot() IS
  'Operator-only read snapshot. Counts authoritative paid subscribers and non-subscriber lead interest separately; returns no PII, user IDs, provider IDs, or raw payloads.';
