
CREATE OR REPLACE FUNCTION public.grant_staff_role_for_verified_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;
  v_email := lower(NEW.email);
  IF v_email IN ('matt@verdantgrowdiary.com', 'cheekhimself@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'staff'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_staff ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_staff
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_staff_role_for_verified_allowlist();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_staff ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_staff
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_staff_role_for_verified_allowlist();

-- Backfill: grant staff to any currently-existing verified allow-list users.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'staff'::public.app_role
FROM auth.users u
WHERE u.email_confirmed_at IS NOT NULL
  AND lower(u.email) IN ('matt@verdantgrowdiary.com', 'cheekhimself@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;
