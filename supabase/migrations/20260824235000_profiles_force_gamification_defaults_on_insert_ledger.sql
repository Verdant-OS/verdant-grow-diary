-- LEDGER ONLY of SQL already present on production 2026-08-24.
-- Do not treat merge as APPLY.
-- Do not APPLY 20260813030000.
-- Grants/EXECUTE privileges were NOT captured (NOT_MEASURED).
-- Capture source: Lovable Cloud SQL pg_get_functiondef / pg_get_triggerdef
--
-- Project: knkwiiywfkbqznbxwqfh (Lovable-managed production).
-- This file is a GitHub ledger for independent review (Blue Dream). It is NOT
-- authorization to re-APPLY these objects. The definitions below were read
-- read-only from Cloud SQL on 2026-08-24 and are recorded as CREATE OR REPLACE
-- / DROP TRIGGER IF EXISTS + CREATE TRIGGER for idempotent ledger shape only.

CREATE OR REPLACE FUNCTION public.profiles_force_gamification_defaults_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.nugs_total    := 0;
  NEW.level         := 0;
  NEW.tier          := 'seedling';
  NEW.current_badge := NULL;
  NEW.referral_code := NULL;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.profiles_block_gamification_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.nugs_total IS DISTINCT FROM OLD.nugs_total
     OR NEW.level IS DISTINCT FROM OLD.level
     OR NEW.tier  IS DISTINCT FROM OLD.tier
     OR NEW.current_badge IS DISTINCT FROM OLD.current_badge THEN
    RAISE EXCEPTION 'gamification fields (nugs_total, level, tier, current_badge) are not directly writable';
  END IF;

  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'referral_code is not directly writable';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_force_gamification_defaults_on_insert_trg ON public.profiles;
CREATE TRIGGER profiles_force_gamification_defaults_on_insert_trg BEFORE INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION profiles_force_gamification_defaults_on_insert();

DROP TRIGGER IF EXISTS profiles_block_gamification_updates ON public.profiles;
CREATE TRIGGER profiles_block_gamification_updates BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION profiles_block_gamification_updates();
