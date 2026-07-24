-- AI Doctor history is append-only for browser roles.
--
-- The hosted project uses Supabase's legacy default table privileges, so the
-- original SELECT/INSERT grant was additive and did not remove inherited
-- UPDATE/DELETE privileges. RLS prevented mutation side effects, but browser
-- clients could still issue mutation statements that resolved to zero rows.
-- Keep the intended capability explicit at both the grant and RLS layers.

REVOKE ALL ON TABLE public.ai_doctor_sessions
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE public.ai_doctor_sessions TO authenticated;
GRANT ALL ON TABLE public.ai_doctor_sessions TO service_role;
