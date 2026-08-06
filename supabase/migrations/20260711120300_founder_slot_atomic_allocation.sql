-- Trust-boundary hardening — Slice 3: Founder Lifetime seat cap (max 75).
--
-- v2 (corrected): the cap must be enforced on the path that actually CONFERS
-- founder entitlement. Adversarial verification found the original trigger only
-- fired on public.billing_subscriptions, but the live Paddle purchase path
-- (payments-webhook -> record_lifetime -> upsert) writes founder_lifetime rows
-- into public.subscriptions, and ai_credit_spend / the union entitlement helper
-- grant founder access from THAT table. So the original trigger was dead code
-- against real purchases and the offer could be oversold indefinitely.
--
-- This enforces a single combined cap of 75 across BOTH conferring surfaces:
--   * public.subscriptions   (price_id='founder_lifetime', status='active') — the live checkout path
--   * public.billing_subscriptions (plan_id='founder_lifetime')             — BYO / manual channel
-- Both insert paths take the SAME advisory lock and consult the SAME count, so
-- concurrent purchases across either table cannot collectively exceed 75.
--
-- Replay-safety: payments-webhook UPSERTs on paddle_subscription_id, and a
-- BEFORE INSERT trigger fires before conflict resolution — so a Paddle
-- re-delivery of an already-recorded founder purchase would otherwise be
-- miscounted as a new seat. The subscriptions guard skips the cap when a row
-- for that paddle_subscription_id already exists (replay, not a new seat).
--
-- NOTE: the subscriptions count is environment-agnostic (counts any active
-- founder_lifetime row) to avoid coupling to the unresolved live/sandbox
-- entitlement-environment cutover decision. Once that is decided, the count
-- predicate should match the entitlement-conferring predicate exactly.

CREATE OR REPLACE FUNCTION public.founder_seats_used()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    (SELECT count(*) FROM public.subscriptions s
       WHERE s.price_id = 'founder_lifetime' AND s.status = 'active')::int
  + (SELECT count(*) FROM public.billing_subscriptions b
       WHERE b.plan_id = 'founder_lifetime')::int;
$function$;

REVOKE ALL     ON FUNCTION public.founder_seats_used() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.founder_seats_used() FROM anon;
REVOKE EXECUTE ON FUNCTION public.founder_seats_used() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.founder_seats_used() TO service_role;

-- Live checkout path: payments-webhook upserts founder rows into subscriptions.
CREATE OR REPLACE FUNCTION public.enforce_founder_seat_cap_subscriptions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.price_id = 'founder_lifetime' AND NEW.status = 'active' THEN
    -- Upsert re-delivery of an existing purchase is a replay, not a new seat.
    IF EXISTS (SELECT 1 FROM public.subscriptions s
                WHERE s.paddle_subscription_id = NEW.paddle_subscription_id) THEN
      RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('founder_seat_cap'));
    IF public.founder_seats_used() >= 75 THEN
      RAISE EXCEPTION 'founder_slots_exhausted'
        USING errcode = 'P0001',
              detail  = 'All 75 Founder Lifetime seats are allocated.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_founder_seat_cap_subscriptions_trg ON public.subscriptions;
CREATE TRIGGER enforce_founder_seat_cap_subscriptions_trg
  BEFORE INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_founder_seat_cap_subscriptions();

-- BYO / manual channel: enforce the same combined cap AND assign a stable
-- 1..75 slot label (the unique partial index billing_subscriptions_founder_number_uniq
-- is the final backstop; CHECK(1..75) bounds the value).
CREATE OR REPLACE FUNCTION public.assign_founder_slot_on_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_slot int;
BEGIN
  IF NEW.plan_id = 'founder_lifetime' AND NEW.founder_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('founder_seat_cap'));
    IF public.founder_seats_used() >= 75 THEN
      RAISE EXCEPTION 'founder_slots_exhausted'
        USING errcode = 'P0001',
              detail  = 'All 75 Founder Lifetime seats are allocated.';
    END IF;
    SELECT s.n INTO v_slot
      FROM generate_series(1, 75) AS s(n)
     WHERE NOT EXISTS (
             SELECT 1 FROM public.billing_subscriptions b
              WHERE b.founder_number = s.n
           )
     ORDER BY s.n
     LIMIT 1;
    NEW.founder_number := v_slot;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assign_founder_slot_trg ON public.billing_subscriptions;
CREATE TRIGGER assign_founder_slot_trg
  BEFORE INSERT OR UPDATE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.assign_founder_slot_on_write();

NOTIFY pgrst, 'reload schema';
