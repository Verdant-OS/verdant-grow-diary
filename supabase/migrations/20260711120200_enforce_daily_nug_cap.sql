-- Trust-boundary hardening — Slice 4: bound daily nug accrual per user.
--
-- v2 (corrected per adversarial verification):
--   * 'harvest' is EXEMPT. Harvest is a real, plant-bounded award (per_kind_cap
--     1500) and a multi-plant harvest day would otherwise false-reject once the
--     flat cap was hit. Feature unlocks are already bounded independently
--     (award_nugs caps level at max_level_for_user(), which is harvest-gated),
--     so exempting harvest does not open a premium-unlock path.
--   * The check is serialized with a per-user advisory lock so concurrent
--     award_nugs calls cannot race past the cap (the SUM alone, under READ
--     COMMITTED, is not atomic).
--   * The day boundary is pinned to UTC explicitly (parity with ai_credit_spend's
--     period_key), independent of any session TimeZone GUC.
--
-- Scope: bounds only the replay-prone non-harvest kinds (daily_log, photo_log,
-- sensor_snapshot, quick_log, quest, ai_coach — each with small per-kind caps).
-- The residual target is leaderboard / nugs_total inflation, not entitlement.

CREATE OR REPLACE FUNCTION public.enforce_daily_nug_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cap   constant int := 2000;   -- non-harvest daily ceiling per user
  v_today bigint;
BEGIN
  -- No-op inserts and exempt harvest awards pass through unbounded.
  IF NEW.amount IS NULL OR NEW.amount <= 0 OR NEW.kind = 'harvest' THEN
    RETURN NEW;
  END IF;

  -- Serialize per-user accrual so concurrent awards observe committed state.
  PERFORM pg_advisory_xact_lock(hashtext('nug_cap:' || NEW.user_id::text));

  SELECT COALESCE(SUM(amount), 0) INTO v_today
    FROM public.nug_events
   WHERE user_id = NEW.user_id
     AND kind <> 'harvest'
     AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  IF v_today + NEW.amount > v_cap THEN
    RAISE EXCEPTION 'daily_nug_cap_exceeded'
      USING errcode = 'P0001',
            detail  = format('user=%s kind=%s today=%s attempted=%s cap=%s',
                             NEW.user_id, NEW.kind, v_today, NEW.amount, v_cap);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_daily_nug_cap_trg ON public.nug_events;
CREATE TRIGGER enforce_daily_nug_cap_trg
  BEFORE INSERT ON public.nug_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_nug_cap();
