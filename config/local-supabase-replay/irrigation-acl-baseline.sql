-- Disposable local-replay compatibility baseline.
--
-- Hosted Verdant inherited these read/server grants before the immutable
-- irrigation trust-boundary migration ran. Fresh Supabase projects use
-- hardened defaults, so establish the same precondition locally before that
-- migration verifies its post-conditions. Browser write grants stay absent.
GRANT SELECT ON TABLE
  public.grow_events,
  public.watering_events,
  public.feeding_events
TO authenticated;

GRANT ALL ON TABLE
  public.grow_events,
  public.watering_events,
  public.feeding_events
TO service_role;
