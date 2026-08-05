-- Server-authoritative Free creation-cap backstop.
--
-- The browser already presents these product limits:
--   * Free: one non-archived grow
--   * Free: one non-archived tent, account-wide
--   * paid Pro / Craft / Founder: unlimited grows and multi-tent
--
-- Those checks were UX-only. A caller could bypass them with direct
-- PostgREST INSERTs or by changing is_archived from true to false. This
-- migration closes every table-write path without replacing the existing
-- client API, rewriting old rows, or changing RLS.
--
-- Existing over-limit accounts remain usable: the trigger checks only a new
-- active INSERT, an archive-to-active UPDATE, or an active row moved to a new
-- owner. Ordinary edits to existing active rows are never revalidated.
--
-- Concurrency: both tables share one transaction-scoped advisory lock per
-- owner. The trigger is VOLATILE (the PL/pgSQL default), so the count query
-- after a waiter acquires the lock observes the preceding committed insert.
--
-- Identity authority: a signed-in client is bound to auth.uid() before any
-- archived-row shortcut or entitlement lookup. A cross-owner NEW.user_id
-- fails with one stable authorization error, so it cannot select another
-- account's paid bypass or reveal whether that bypass exists. Direct database
-- maintenance by the postgres owner remains cap-checked against the explicit
-- target owner; it does not receive a paid/cap bypass.
--
-- Billing authority mirrors the current server union:
--   * public.billing_subscriptions (incumbent BYO authority)
--   * live public.subscriptions rows (Lovable Paddle, including Craft)
-- No profiles.tier, staff presentation lift, client plan, or pack SKU can
-- grant the bypass.

CREATE OR REPLACE FUNCTION public.enforce_free_creation_caps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_authenticated_owner uuid;
  v_owner_id uuid;
  v_has_paid_entitlement boolean := false;
  v_active_count integer := 0;
BEGIN
  -- Trusted setup/teardown and server-owned import fixtures use service_role.
  -- Staff/operator roles are intentionally not authoritative billing bypasses.
  IF current_setting('role', true) IS NOT DISTINCT FROM 'service_role' THEN
    RETURN NEW;
  END IF;

  v_authenticated_owner := auth.uid();

  -- A trigger runs before an INSERT/UPDATE RLS WITH CHECK. Bind the owner here
  -- before any early return or billing query so client-supplied NEW.user_id
  -- cannot choose whose entitlement or active-row count is inspected.
  IF v_authenticated_owner IS NOT NULL THEN
    IF NEW.user_id IS DISTINCT FROM v_authenticated_owner THEN
      RAISE EXCEPTION USING
        ERRCODE = 'insufficient_privilege',
        MESSAGE = 'free_creation_cap_owner_mismatch',
        DETAIL = 'The row owner must match the authenticated user.';
    END IF;

    v_owner_id := v_authenticated_owner;
  ELSIF session_user IS NOT DISTINCT FROM 'postgres' THEN
    -- Migration, restore, and direct DBA maintenance sessions have no JWT.
    -- They remain cap-checked; only service_role receives the fixture bypass.
    v_owner_id := NEW.user_id;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'free_creation_cap_authenticated_owner_required',
      DETAIL = 'An authenticated owner is required for this write.';
  END IF;

  -- Archived INSERTs consume no active slot. On UPDATE, preserve ordinary
  -- edits to an already-active row for legacy accounts that exceed the cap.
  -- An owner change is activation-like for the receiving owner and is checked.
  IF NEW.is_archived IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.is_archived IS NOT TRUE
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- NOT NULL constraints remain the owner-shape authority. Let them return
  -- their native error instead of hashing a null owner.
  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- One shared owner lock serializes grow and tent creation attempts. A
  -- namespaced 64-bit key avoids colliding with other per-user ledgers.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('verdant:free-creation-cap:' || v_owner_id::text, 0)
  );

  SELECT
    EXISTS (
      SELECT 1
      FROM public.billing_subscriptions bs
      WHERE bs.user_id = v_owner_id
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
      WHERE s.user_id = v_owner_id
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
  INTO v_has_paid_entitlement;

  IF v_has_paid_entitlement THEN
    RETURN NEW;
  END IF;

  IF TG_RELID = 'public.grows'::regclass THEN
    SELECT count(*)::integer
      INTO v_active_count
      FROM public.grows
     WHERE user_id = v_owner_id
       AND is_archived = false;

    IF v_active_count >= 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'free_active_grow_limit_reached',
        DETAIL = 'Free accounts may have one active grow.',
        HINT = 'Archive the active grow or upgrade to a paid plan.';
    END IF;
  ELSIF TG_RELID = 'public.tents'::regclass THEN
    SELECT count(*)::integer
      INTO v_active_count
      FROM public.tents
     WHERE user_id = v_owner_id
       AND is_archived = false;

    IF v_active_count >= 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'free_active_tent_limit_reached',
        DETAIL = 'Free accounts may have one active tent.',
        HINT = 'Archive the active tent or upgrade to a paid plan.';
    END IF;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'invalid_parameter_value',
      MESSAGE = 'free_creation_cap_trigger_table_not_supported';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_free_creation_caps() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_free_creation_caps() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_free_creation_caps() FROM authenticated;

DROP TRIGGER IF EXISTS enforce_free_creation_cap_grows ON public.grows;
CREATE TRIGGER enforce_free_creation_cap_grows
  BEFORE INSERT OR UPDATE OF is_archived, user_id ON public.grows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_free_creation_caps();

DROP TRIGGER IF EXISTS enforce_free_creation_cap_tents ON public.tents;
CREATE TRIGGER enforce_free_creation_cap_tents
  BEFORE INSERT OR UPDATE OF is_archived, user_id ON public.tents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_free_creation_caps();

COMMENT ON FUNCTION public.enforce_free_creation_caps() IS
  'Server-authoritative Free active-grow and active-tent creation cap. '
  'Binds client authority to auth.uid(), then uses the server billing union '
  'and a per-owner transaction advisory lock; '
  'does not rewrite or revalidate existing active rows.';
