-- Staff role auto-grant for allow-listed verified emails.
-- (Backfill of repo migration 20260709015647 lines 1-39 ONLY — its
-- ai_credit_spend redefinition is deliberately EXCLUDED because it
-- regressed the union/hardening; the fixed version is already applied.)

CREATE OR REPLACE FUNCTION public.grant_staff_role_for_verified_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_email text := lower(coalesce(NEW.email, ''));
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND v_email IN ('matt@verdantgrowdiary.com', 'cheekhimself@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'staff'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_staff ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_staff
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_staff_role_for_verified_email();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_staff ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_staff
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_staff_role_for_verified_email();

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'staff'::public.app_role
FROM auth.users u
WHERE u.email_confirmed_at IS NOT NULL
  AND lower(u.email) IN ('matt@verdantgrowdiary.com', 'cheekhimself@gmail.com')
ON CONFLICT DO NOTHING;;
