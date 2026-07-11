-- Trust-boundary hardening — Slice 4: bound daily nug accrual per user.
--
-- award_nugs is intentionally client-callable (documented contract in
-- supabase/tests/permissions.sql: {anon:false, authenticated:true}) and caps
-- each award per-kind, but non-quest kinds have no replay guard, so a caller
-- could loop awards to inflate their nugs_total. Feature UNLOCKS are already
-- bounded — award_nugs caps level at max_level_for_user(), which is
-- harvest-gated — so this is NOT a premium-entitlement leak; the residual is
-- leaderboard / total inflation.
--
-- Defense in depth: enforce a per-user, per-day accrual ceiling at the
-- nug_events layer. All gamification writes flow through award_nugs ->
-- nug_events (enforced by scripts/scan-gamification-direct-inserts.mjs), so the
-- guard holds regardless of caller and without changing award_nugs' signature
-- or its documented contract. The ceiling (3000) sits well above any
-- legitimate single day (the largest single award is harvest = 1500). Supabase
-- Postgres runs in UTC, so date_trunc('day', now()) is the UTC day boundary.

CREATE OR REPLACE FUNCTION public.enforce_daily_nug_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cap   constant int := 3000;
  v_today bigint;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_today
    FROM public.nug_events
   WHERE user_id = NEW.user_id
     AND created_at >= date_trunc('day', now());

  IF v_today + NEW.amount > v_cap THEN
    RAISE EXCEPTION 'daily_nug_cap_exceeded'
      USING errcode = 'P0001',
            detail  = format('user=%s today=%s attempted=%s cap=%s',
                             NEW.user_id, v_today, NEW.amount, v_cap);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_daily_nug_cap_trg ON public.nug_events;
CREATE TRIGGER enforce_daily_nug_cap_trg
  BEFORE INSERT ON public.nug_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_nug_cap();
