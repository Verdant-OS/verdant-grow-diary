-- Trust-boundary hardening — Slice 3: atomic Founder Lifetime slot allocation.
--
-- billing_subscriptions.founder_number was scaffolded with CHECK (1..75) and a
-- unique partial index, but the column comment defers allocation: "Slot
-- allocation enforced in a later slice (S6)." Today the payment path inserts
-- founder_number = NULL, so the 75-slot scarcity is NOT enforced — the offer
-- could be oversold indefinitely.
--
-- This implements S6 as a DATA-LAYER guard rather than wiring it into the
-- payment RPC. That is deliberate: the deployed webhook calls
-- apply_paddle_subscription_update_with_audit, which is currently MISSING from
-- prod (migration drift), so any RPC-level hook would be unreliable. Enforcing
-- at the billing_subscriptions table means the cap holds no matter which write
-- path (RPC, reconciled RPC, or manual) materializes a founder row.
--
--   * allocate_founder_slot(): atomically returns the lowest free slot (1..75)
--     under an advisory lock, or raises 'founder_slots_exhausted' when full.
--   * BEFORE INSERT/UPDATE trigger: whenever a row becomes plan_id
--     'founder_lifetime' with a NULL founder_number, a slot is auto-claimed.
--     Rows that already carry a founder_number (e.g. existing founders) are
--     untouched. When all 75 are taken the write fails -> no oversell.

CREATE OR REPLACE FUNCTION public.allocate_founder_slot()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_slot int;
BEGIN
  -- Serialize concurrent founder purchases so two buyers cannot race onto the
  -- same free slot (the unique partial index is the final backstop).
  PERFORM pg_advisory_xact_lock(hashtext('billing_subscriptions.founder_number'));

  SELECT s.n INTO v_slot
    FROM generate_series(1, 75) AS s(n)
   WHERE NOT EXISTS (
           SELECT 1 FROM public.billing_subscriptions b
            WHERE b.founder_number = s.n
         )
   ORDER BY s.n
   LIMIT 1;

  IF v_slot IS NULL THEN
    RAISE EXCEPTION 'founder_slots_exhausted'
      USING errcode = 'P0001',
            detail  = 'All 75 Founder Lifetime slots are allocated.';
  END IF;

  RETURN v_slot;
END;
$function$;

REVOKE ALL     ON FUNCTION public.allocate_founder_slot() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_founder_slot() FROM anon;
REVOKE EXECUTE ON FUNCTION public.allocate_founder_slot() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.allocate_founder_slot() TO service_role;

CREATE OR REPLACE FUNCTION public.assign_founder_slot_on_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.plan_id = 'founder_lifetime' AND NEW.founder_number IS NULL THEN
    NEW.founder_number := public.allocate_founder_slot();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assign_founder_slot_trg ON public.billing_subscriptions;
CREATE TRIGGER assign_founder_slot_trg
  BEFORE INSERT OR UPDATE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.assign_founder_slot_on_write();

NOTIFY pgrst, 'reload schema';
