-- Forward-looking, operator-only 60-day paid-return measurement.
--
-- The canonical billing lane is public.subscriptions. Its mutable subscription
-- rows do not contain a trustworthy historical first-paid timestamp, so this
-- ledger deliberately starts at this migration rather than inventing a
-- retroactive cohort. It records one verified live paid activation per user,
-- then keeps that membership even if the subscription later cancels or expires.
--
-- This is reporting only. It never grants access, changes billing, writes a
-- grow log, or reads sensor telemetry into the return definition.

CREATE TABLE IF NOT EXISTS public.paid_return_cohort_memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_paid_at timestamptz NOT NULL DEFAULT now(),
  captured_from text NOT NULL DEFAULT 'subscriptions'
    CHECK (captured_from = 'subscriptions')
);

CREATE INDEX IF NOT EXISTS paid_return_cohort_memberships_first_paid_at_idx
  ON public.paid_return_cohort_memberships (first_paid_at);

-- The operator snapshot qualifies a manual grow return by record time, not
-- user-backdated occurred_at. Keep the per-user lookup bounded as cohorts grow.
CREATE INDEX IF NOT EXISTS paid_return_manual_grow_events_user_created_idx
  ON public.grow_events (user_id, created_at)
  WHERE source = 'manual'
    AND is_deleted = false
    AND event_type IN ('watering', 'observation');

-- A review completion is recorded only by the protected edge function after a
-- fresh provider response has passed the AI Doctor output contract. It stores
-- no prompt, model response, grow, plant, photo, or provider identifier.
CREATE TABLE IF NOT EXISTS public.ai_doctor_review_completions (
  spend_id uuid PRIMARY KEY REFERENCES public.ai_credit_spends(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL DEFAULT 'ai_doctor_review_edge'
    CHECK (recorded_by = 'ai_doctor_review_edge')
);

CREATE INDEX IF NOT EXISTS ai_doctor_review_completions_user_completed_idx
  ON public.ai_doctor_review_completions (user_id, completed_at);

-- A later append-only refund invalidates a completion for return measurement.
CREATE INDEX IF NOT EXISTS ai_credit_spends_refund_of_refunded_idx
  ON public.ai_credit_spends (refund_of)
  WHERE refund_of IS NOT NULL
    AND status = 'refunded';

REVOKE ALL ON TABLE public.paid_return_cohort_memberships FROM PUBLIC;
REVOKE ALL ON TABLE public.paid_return_cohort_memberships FROM anon;
REVOKE ALL ON TABLE public.paid_return_cohort_memberships FROM authenticated;
GRANT ALL ON TABLE public.paid_return_cohort_memberships TO service_role;

ALTER TABLE public.paid_return_cohort_memberships ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies. Only the trusted subscription writer and
-- the aggregate-only RPC below may use this tracking ledger.

REVOKE ALL ON TABLE public.ai_doctor_review_completions FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_doctor_review_completions FROM anon;
REVOKE ALL ON TABLE public.ai_doctor_review_completions FROM authenticated;
GRANT ALL ON TABLE public.ai_doctor_review_completions TO service_role;

ALTER TABLE public.ai_doctor_review_completions ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies. The client cannot create or inspect review
-- completion rows; the server-recorded completion is measurement-only.

CREATE OR REPLACE FUNCTION public.record_paid_return_cohort_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_should_capture boolean := false;
BEGIN
  -- Capture a new live paid subscription immediately, or a trial that becomes
  -- active after this tracker exists. Do not treat a past-due resume or plan
  -- switch as a new first-paid cohort; ON CONFLICT is the final idempotency
  -- fence across webhook retries and a later re-subscription.
  IF NEW.environment = 'live'
     AND NEW.price_id IN ('pro_monthly', 'pro_annual', 'founder_lifetime')
     AND NEW.status = 'active' THEN
    IF TG_OP = 'INSERT' THEN
      v_should_capture := true;
    ELSIF OLD.status = 'trialing' THEN
      v_should_capture := true;
    END IF;
  END IF;

  IF v_should_capture THEN
    INSERT INTO public.paid_return_cohort_memberships (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_paid_return_cohort_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_paid_return_cohort_membership() FROM anon;
REVOKE ALL ON FUNCTION public.record_paid_return_cohort_membership() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_paid_return_cohort_membership() TO service_role;

DROP TRIGGER IF EXISTS paid_return_cohort_membership_subscription_insert
  ON public.subscriptions;
CREATE TRIGGER paid_return_cohort_membership_subscription_insert
  AFTER INSERT ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.record_paid_return_cohort_membership();

DROP TRIGGER IF EXISTS paid_return_cohort_membership_subscription_paid_transition
  ON public.subscriptions;
CREATE TRIGGER paid_return_cohort_membership_subscription_paid_transition
  AFTER UPDATE OF status, price_id, environment ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.record_paid_return_cohort_membership();

-- The only supported writer is the server-side AI Doctor review edge function.
-- It proves that the supplied spend belongs to the JWT-verified user, is an
-- unrefunded AI Doctor spend, and is still in the append-only spent state.
CREATE OR REPLACE FUNCTION public.record_ai_doctor_review_completion(
  p_spend_id uuid,
  p_expected_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_spend record;
  v_completion_user_id uuid;
BEGIN
  SELECT spend.id, spend.user_id, spend.feature, spend.status, spend.refund_of
    INTO v_spend
  FROM public.ai_credit_spends AS spend
  WHERE spend.id = p_spend_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'spend_not_eligible');
  END IF;

  IF v_spend.user_id IS DISTINCT FROM p_expected_user_id
     OR v_spend.feature IS DISTINCT FROM 'ai_doctor_review'
     OR v_spend.status IS DISTINCT FROM 'spent'
     OR v_spend.refund_of IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'spend_not_eligible');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ai_credit_spends AS reversal
    WHERE reversal.refund_of = v_spend.id
      AND reversal.status = 'refunded'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'spend_refunded');
  END IF;

  INSERT INTO public.ai_doctor_review_completions (spend_id, user_id)
  VALUES (v_spend.id, v_spend.user_id)
  ON CONFLICT (spend_id) DO NOTHING;

  SELECT completion.user_id
    INTO v_completion_user_id
  FROM public.ai_doctor_review_completions AS completion
  WHERE completion.spend_id = v_spend.id;

  IF v_completion_user_id IS DISTINCT FROM v_spend.user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'completion_conflict');
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'recorded');
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_doctor_review_completion(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ai_doctor_review_completion(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.record_ai_doctor_review_completion(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_doctor_review_completion(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.paid_return_operator_snapshot()
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

  WITH tracked AS (
    SELECT membership.user_id, membership.first_paid_at
    FROM public.paid_return_cohort_memberships AS membership
  ),
  matured AS (
    SELECT tracked.user_id, tracked.first_paid_at
    FROM tracked
    WHERE tracked.first_paid_at + interval '60 days' <= now()
  ),
  return_flags AS (
    SELECT
      cohort.user_id,
      EXISTS (
        SELECT 1
        FROM public.grow_events AS ge
        WHERE ge.user_id = cohort.user_id
          AND ge.source = 'manual'
          AND ge.is_deleted = false
          -- The current Quick Log path persists one primary manual watering
          -- or observation event. Its optional environment sibling is not a
          -- second grower return and is therefore deliberately excluded.
          AND ge.event_type IN ('watering', 'observation')
          -- Record time is intentionally used instead of grower-supplied
          -- occurred_at so this is post-payment behavior, not backfilled history.
          AND ge.created_at > cohort.first_paid_at
          AND ge.created_at < cohort.first_paid_at + interval '60 days'
      ) AS has_manual_grow_return,
      EXISTS (
        SELECT 1
        FROM public.ai_doctor_review_completions AS completion
        INNER JOIN public.ai_credit_spends AS spend
          ON spend.id = completion.spend_id
          AND spend.user_id = completion.user_id
        WHERE completion.user_id = cohort.user_id
          AND completion.completed_at > cohort.first_paid_at
          AND completion.completed_at < cohort.first_paid_at + interval '60 days'
          AND spend.feature = 'ai_doctor_review'
          AND spend.status = 'spent'
          AND spend.refund_of IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.ai_credit_spends AS reversal
            WHERE reversal.refund_of = spend.id
              AND reversal.status = 'refunded'
          )
      ) AS has_server_completed_ai_doctor_return
      -- Client-persisted AI sessions are excluded. They are best-effort history
      -- that can represent AI Coach and cannot attest to a server-validated AI
      -- Doctor completion. Replays are also excluded because they are not fresh
      -- provider work.
    FROM matured AS cohort
  ),
  tracked_counts AS (
    SELECT
      count(*)::bigint AS tracked_paid_activations,
      count(*) FILTER (
        WHERE tracked.first_paid_at + interval '60 days' > now()
      )::bigint AS in_flight_paid_activations
    FROM tracked
  ),
  return_counts AS (
    SELECT
      count(*)::bigint AS matured_paid_activations_60d,
      count(*) FILTER (WHERE flags.has_manual_grow_return)::bigint AS manual_grow_returned_60d,
      count(*) FILTER (
        WHERE flags.has_server_completed_ai_doctor_return
      )::bigint AS server_completed_ai_doctor_returned_60d,
      count(*) FILTER (
        WHERE flags.has_manual_grow_return
          OR flags.has_server_completed_ai_doctor_return
      )::bigint AS paid_returned_60d
    FROM return_flags AS flags
  )
  SELECT jsonb_build_object(
    'tracked_paid_activations', tracked_counts.tracked_paid_activations,
    'in_flight_paid_activations', tracked_counts.in_flight_paid_activations,
    'matured_paid_activations_60d', return_counts.matured_paid_activations_60d,
    'manual_grow_returned_60d', return_counts.manual_grow_returned_60d,
    'server_completed_ai_doctor_returned_60d',
      return_counts.server_completed_ai_doctor_returned_60d,
    'paid_returned_60d', return_counts.paid_returned_60d
  )
  INTO v_counts
  FROM tracked_counts
  CROSS JOIN return_counts;

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'counts', COALESCE(v_counts, jsonb_build_object(
      'tracked_paid_activations', 0,
      'in_flight_paid_activations', 0,
      'matured_paid_activations_60d', 0,
      'manual_grow_returned_60d', 0,
      'server_completed_ai_doctor_returned_60d', 0,
      'paid_returned_60d', 0
    ))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.paid_return_operator_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.paid_return_operator_snapshot() FROM anon;
GRANT EXECUTE ON FUNCTION public.paid_return_operator_snapshot() TO authenticated;

COMMENT ON TABLE public.paid_return_cohort_memberships IS
  'Forward-only first-live-paid cohort ledger. It intentionally excludes paid activations that predate the tracker rather than estimating historic first-paid timestamps.';

COMMENT ON TABLE public.ai_doctor_review_completions IS
  'Private, server-recorded evidence that a fresh AI Doctor provider response passed the review contract. It stores no prompt, response, or grow data.';

COMMENT ON FUNCTION public.record_ai_doctor_review_completion(uuid, uuid) IS
  'Service-role-only idempotent writer for fresh validated AI Doctor review completions. It rejects a mismatched, refunded, non-spent, or non-review credit row.';

COMMENT ON FUNCTION public.paid_return_operator_snapshot() IS
  'Operator-only aggregate 60-day paid-return report. It retains churned cohort members, qualifies manual grow activity or a server-recorded fresh validated AI Doctor review, excludes passive sensor ingest and client-persisted AI sessions, and returns no user, provider, or raw-payload identifiers.';
