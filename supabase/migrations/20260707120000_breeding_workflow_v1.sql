-- Breeding Workflow v1
-- Completes the previously-orphaned breeding crossing workflow (Step 5 of the
-- AI & Data-Driven Breeding Model). Before this migration the workflow could not
-- function: validate_grow_event() rejected the 6 breeding event types, there was
-- no payload table for breeding details, and the client wrote directly with a
-- client-supplied user_id (out of pattern with the RPC trust boundary).
--
-- This migration:
--   1. Extends the grow_events event_type allow-list to accept breeding subtypes.
--   2. Adds a breeding_events subtype table (mirrors watering/feeding pattern).
--   3. Adds a breeding_log_save_event RPC (SECURITY DEFINER, auth.uid() trust
--      boundary, ownership-checked) so writes never trust a client user_id.
--
-- Safety: breeding events are advisory log entries only. Follow-up suggestions
-- are created separately by the create-breeding-suggestions edge function as
-- approval-required Action Queue items. No device control, no auto-execution.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend grow_events event_type validation to allow breeding subtypes.
--    (Preserves the existing cultivation types and source allow-list verbatim.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_grow_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.event_type NOT IN (
    'watering','feeding','training','observation','photo','environment',
    'harvest','cure_check',
    'reversal_application','isolation_start','pollination',
    'pollen_shed_observed','stigmas_receptive','cross_harvest'
  ) THEN
    RAISE EXCEPTION 'invalid event_type: %', NEW.event_type;
  END IF;
  IF NEW.source NOT IN ('manual','voice','import','ai') THEN
    RAISE EXCEPTION 'invalid source: %', NEW.source;
  END IF;
  IF NEW.is_deleted = true AND NEW.deleted_at IS NULL THEN
    NEW.deleted_at := now();
  END IF;
  IF NEW.is_deleted = false THEN
    NEW.deleted_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 2. breeding_events subtype table (one row per breeding grow_event).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.breeding_events (
  event_id        UUID PRIMARY KEY REFERENCES public.grow_events(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  method          TEXT,
  intensity       TEXT,
  donor_plant_id  UUID REFERENCES public.plants(id) ON DELETE SET NULL,
  notes           TEXT,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.breeding_events IS
  'Breeding-specific payload (method, intensity, donor) for grow_events of a breeding subtype. Advisory log only.';

CREATE INDEX IF NOT EXISTS idx_breeding_events_user
  ON public.breeding_events (user_id);
CREATE INDEX IF NOT EXISTS idx_breeding_events_donor
  ON public.breeding_events (donor_plant_id) WHERE donor_plant_id IS NOT NULL;

-- Owner + parent-type validation: the parent grow_event must belong to the same
-- user and carry one of the 6 breeding event types. Any donor_plant_id must also
-- be owned by the caller, so a client/API write cannot attach a cross-tenant
-- plant UUID as a breeding donor (lineage/provenance integrity).
CREATE OR REPLACE FUNCTION public.validate_breeding_event_owner()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  parent_user UUID;
  parent_type TEXT;
BEGIN
  SELECT user_id, event_type INTO parent_user, parent_type
    FROM public.grow_events WHERE id = NEW.event_id;
  IF parent_user IS NULL THEN
    RAISE EXCEPTION 'parent grow_event not found: %', NEW.event_id;
  END IF;
  IF parent_user <> NEW.user_id THEN
    RAISE EXCEPTION 'breeding_events user_id does not match parent grow_event user_id';
  END IF;
  IF parent_type NOT IN (
    'reversal_application','isolation_start','pollination',
    'pollen_shed_observed','stigmas_receptive','cross_harvest'
  ) THEN
    RAISE EXCEPTION 'breeding_events attached to non-breeding grow_event of type %', parent_type;
  END IF;
  -- Donor plant (optional) must be owned by the same user — prevents attaching a
  -- cross-tenant plant UUID as a breeding donor via a direct client write.
  IF NEW.donor_plant_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.plants p
        WHERE p.id = NEW.donor_plant_id AND p.user_id = NEW.user_id
     ) THEN
    RAISE EXCEPTION 'breeding_events donor_plant_id % is not owned by the caller', NEW.donor_plant_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_breeding_event_owner
  BEFORE INSERT OR UPDATE ON public.breeding_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_breeding_event_owner();

ALTER TABLE public.breeding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own breeding_events"
  ON public.breeding_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own breeding_events"
  ON public.breeding_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own breeding_events"
  ON public.breeding_events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own breeding_events"
  ON public.breeding_events FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.breeding_events TO authenticated;
GRANT ALL ON public.breeding_events TO service_role;

-- ---------------------------------------------------------------------------
-- 3. breeding_log_save_event RPC — auth.uid() trust boundary, ownership-checked.
--    Minimal by design: no diary entry, no idempotency contract (breeding events
--    are low-frequency, deliberate log entries — distinct from Quick Log).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.breeding_log_save_event(
  p_grow_id uuid,
  p_plant_id uuid,
  p_event_type text,
  p_tent_id uuid DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_intensity text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_details jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_event_id uuid;
  v_plant_grow uuid;
  v_plant_tent uuid;
  v_tent_grow uuid;
  v_occurred timestamptz := COALESCE(p_occurred_at, now());
  v_details jsonb := COALESCE(p_details, '{}'::jsonb);
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_event_type NOT IN (
    'reversal_application','isolation_start','pollination',
    'pollen_shed_observed','stigmas_receptive','cross_harvest'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_event_type');
  END IF;

  IF jsonb_typeof(v_details) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_details');
  END IF;

  -- Grow ownership.
  IF NOT EXISTS (SELECT 1 FROM public.grows WHERE id = p_grow_id AND user_id = uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'grow_not_owned');
  END IF;

  -- Plant is required for breeding events and must belong to caller + grow.
  IF p_plant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plant_required');
  END IF;
  SELECT grow_id, tent_id INTO v_plant_grow, v_plant_tent
    FROM public.plants WHERE id = p_plant_id AND user_id = uid;
  IF NOT FOUND OR v_plant_grow IS DISTINCT FROM p_grow_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_in_grow');
  END IF;

  -- Tent (optional) must belong to caller and match the grow + plant.
  IF p_tent_id IS NOT NULL THEN
    SELECT grow_id INTO v_tent_grow FROM public.tents
      WHERE id = p_tent_id AND user_id = uid;
    IF NOT FOUND OR v_tent_grow IS DISTINCT FROM p_grow_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'tent_not_in_grow');
    END IF;
    IF v_plant_tent IS NOT NULL AND v_plant_tent <> p_tent_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_in_tent');
    END IF;
  END IF;

  -- Spine + subtype are atomic. A trigger failure rolls back the whole save.
  INSERT INTO public.grow_events
    (user_id, grow_id, tent_id, plant_id, event_type, source, occurred_at, note)
  VALUES
    (uid, p_grow_id, p_tent_id, p_plant_id, p_event_type, 'manual', v_occurred,
     NULLIF(btrim(COALESCE(p_notes, '')), ''))
  RETURNING id INTO v_event_id;

  INSERT INTO public.breeding_events
    (event_id, user_id, method, intensity, notes, details)
  VALUES
    (v_event_id, uid,
     NULLIF(btrim(COALESCE(p_method, '')), ''),
     NULLIF(btrim(COALESCE(p_intensity, '')), ''),
     NULLIF(btrim(COALESCE(p_notes, '')), ''),
     v_details);

  RETURN jsonb_build_object('ok', true, 'grow_event_id', v_event_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.breeding_log_save_event(
  uuid, uuid, text, uuid, timestamptz, text, text, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.breeding_log_save_event(
  uuid, uuid, text, uuid, timestamptz, text, text, text, jsonb
) TO authenticated, service_role;

COMMIT;

-- Refresh PostgREST schema cache so the new function/table resolve cleanly.
NOTIFY pgrst, 'reload schema';
