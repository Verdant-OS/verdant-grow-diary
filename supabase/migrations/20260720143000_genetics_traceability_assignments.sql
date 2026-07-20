-- Genetics & Propagation Traceability V1 — Slice 3
-- Production-plant origin assignments + append-only audit + net-new acyclicity
-- enforcement (the repo has no prior cycle-detection precedent).
--
-- Lineage graph (directed, "child -> parent"): a plant's origin batch
-- (plant_origin_assignments) and a batch's mother plant (propagation_batches
-- .mother_plant_id). The graph is FUNCTIONAL upward (UNIQUE(plant_id) + a single
-- mother column) so ancestry is a linear chain — the path guard turns any cycle
-- into a terminating rho-shape.
--
-- Acyclicity is enforced at TWO layers:
--   1. BEFORE triggers on both tables (defense-in-depth for ANY writer, incl.
--      service_role; the ONLY bypass is an explicit auditable GUC).
--   2. The per-owner advisory lock in the write RPCs (the trigger alone cannot
--      see a concurrent transaction's uncommitted edge under READ COMMITTED, so
--      the lock is what actually closes the concurrent-cycle window).

BEGIN;

-- ---------------------------------------------------------------------------
-- plant_origin_assignments — one authoritative origin per plant
-- ---------------------------------------------------------------------------
CREATE TABLE public.plant_origin_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE
    CONSTRAINT plant_origin_assignments_plant_id_key UNIQUE,
  batch_id uuid NOT NULL REFERENCES public.propagation_batches(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plant_origin_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.plant_origin_assignments TO authenticated;
GRANT ALL ON public.plant_origin_assignments TO service_role;

CREATE POLICY plant_origin_assignments_select_own
  ON public.plant_origin_assignments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX plant_origin_assignments_user_id_idx ON public.plant_origin_assignments (user_id);
CREATE INDEX plant_origin_assignments_batch_id_idx ON public.plant_origin_assignments (batch_id);

CREATE TRIGGER plant_origin_assignments_set_updated_at
  BEFORE UPDATE ON public.plant_origin_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- plant_origin_assignment_events — append-only reassignment audit
-- ---------------------------------------------------------------------------
CREATE TABLE public.plant_origin_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  from_batch_id uuid,
  to_batch_id uuid NOT NULL,
  reason text,
  action text NOT NULL CHECK (action IN ('assign', 'reassign')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plant_origin_assignment_events ENABLE ROW LEVEL SECURITY;
-- APPEND-ONLY: authenticated read-only; rows written only by the definer RPC.
GRANT SELECT ON public.plant_origin_assignment_events TO authenticated;
GRANT ALL ON public.plant_origin_assignment_events TO service_role;

CREATE POLICY plant_origin_assignment_events_select_own
  ON public.plant_origin_assignment_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX plant_origin_assignment_events_plant_id_idx
  ON public.plant_origin_assignment_events (plant_id, changed_at DESC);
CREATE INDEX plant_origin_assignment_events_user_id_idx
  ON public.plant_origin_assignment_events (user_id);

-- ---------------------------------------------------------------------------
-- genetics_lineage_has_cycle(owner, start, target) — is `target` reachable from
-- `start` walking UP the ancestry graph? Path-guarded + depth-capped, so it
-- terminates even if cyclic data already exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.genetics_lineage_has_cycle(
  p_owner uuid,
  p_start_kind text,
  p_start_id uuid,
  p_target_kind text,
  p_target_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  WITH RECURSIVE anc(kind, id, depth, path) AS (
    SELECT p_start_kind, p_start_id, 0,
           ARRAY[p_start_kind || ':' || p_start_id::text]
    UNION ALL
    SELECT nxt.kind, nxt.id, a.depth + 1,
           a.path || (nxt.kind || ':' || nxt.id::text)
    FROM anc a
    CROSS JOIN LATERAL (
      -- batch -> its mother plant
      SELECT 'plant'::text AS kind, b.mother_plant_id AS id
        FROM public.propagation_batches b
        WHERE a.kind = 'batch' AND b.id = a.id AND b.user_id = p_owner
          AND b.mother_plant_id IS NOT NULL
      UNION ALL
      -- plant -> its origin batch
      SELECT 'batch'::text AS kind, oa.batch_id AS id
        FROM public.plant_origin_assignments oa
        WHERE a.kind = 'plant' AND oa.plant_id = a.id AND oa.user_id = p_owner
    ) nxt
    WHERE a.depth < 128
      AND NOT ((nxt.kind || ':' || nxt.id::text) = ANY(a.path))
  )
  SELECT EXISTS (
    SELECT 1 FROM anc
    WHERE kind = p_target_kind AND id = p_target_id AND depth > 0
  );
$function$;

REVOKE ALL ON FUNCTION public.genetics_lineage_has_cycle(uuid, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_lineage_has_cycle(uuid, text, uuid, text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Cycle guards (BEFORE triggers). No service_role bypass — acyclicity is a
-- structural invariant for every writer. The only escape hatch is an explicit
-- auditable session GUC an admin sets deliberately.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.genetics_assignment_cycle_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF coalesce(current_setting('genetics.allow_cycle_override', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  -- New edge: plant NEW.plant_id -> batch NEW.batch_id. Cycle iff the batch's
  -- ancestry already reaches the plant. Seeded from NEW values (never a table
  -- lookup of the row being written).
  IF public.genetics_lineage_has_cycle(NEW.user_id, 'batch', NEW.batch_id, 'plant', NEW.plant_id) THEN
    RAISE EXCEPTION 'genetics lineage cycle rejected (plant %, batch %)', NEW.plant_id, NEW.batch_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.genetics_batch_mother_cycle_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.mother_plant_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('genetics.allow_cycle_override', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  -- New edge: batch NEW.id -> mother NEW.mother_plant_id. Cycle iff the mother's
  -- ancestry already reaches this batch.
  IF public.genetics_lineage_has_cycle(NEW.user_id, 'plant', NEW.mother_plant_id, 'batch', NEW.id) THEN
    RAISE EXCEPTION 'genetics lineage cycle rejected (batch %, mother %)', NEW.id, NEW.mother_plant_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER plant_origin_assignments_cycle_guard
  BEFORE INSERT OR UPDATE OF plant_id, batch_id ON public.plant_origin_assignments
  FOR EACH ROW EXECUTE FUNCTION public.genetics_assignment_cycle_guard();

CREATE TRIGGER propagation_batches_mother_cycle_guard
  BEFORE INSERT OR UPDATE OF mother_plant_id ON public.propagation_batches
  FOR EACH ROW EXECUTE FUNCTION public.genetics_batch_mother_cycle_guard();

-- ---------------------------------------------------------------------------
-- RPC: genetics_assign_plants(p_idempotency_key, p_batch_id, p_plant_ids, p_reason)
--   Atomic multi-plant assignment. Cross-tenant/invalid plants are a HARD reject
--   (whole call rolls back, no idempotency row). All validation happens before
--   any write, so no rejection path leaves partial rows. Reassignment (a plant
--   already assigned to a different batch) requires an explicit reason and an
--   append-only audit event.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.genetics_assign_plants(
  p_idempotency_key text,
  p_batch_id uuid,
  p_plant_ids uuid[],
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_op constant text := 'genetics_assign_plants';
  v_hash text;
  v_prior jsonb;
  v_prior_hash text;
  v_constraint text;
  v_reason text := nullif(btrim(p_reason), '');
  v_ids uuid[];
  v_invalid uuid[];
  v_plant uuid;
  v_current_batch uuid;
  v_assigned uuid[] := '{}';
  v_reassigned uuid[] := '{}';
  v_unchanged uuid[] := '{}';
  v_result jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
  END IF;
  IF p_plant_ids IS NULL OR array_length(p_plant_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_plants');
  END IF;
  IF array_length(p_plant_ids, 1) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_plants');
  END IF;

  -- Deterministic de-duplication of the input set.
  SELECT array_agg(DISTINCT pid ORDER BY pid) INTO v_ids FROM unnest(p_plant_ids) AS pid;

  v_hash := md5(coalesce(p_batch_id::text, '') || '|' || array_to_string(v_ids, ',') || '|' || coalesce(v_reason, ''));

  SELECT result, request_hash INTO v_prior, v_prior_hash
    FROM public.genetics_mutation_idempotency
    WHERE user_id = uid AND operation = v_op AND idempotency_key = p_idempotency_key;
  IF v_prior IS NOT NULL THEN
    IF v_prior_hash IS DISTINCT FROM v_hash THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_conflict');
    END IF;
    RETURN v_prior || jsonb_build_object('reused', true);
  END IF;

  PERFORM public.genetics_lock_lineage(uid);

  IF NOT EXISTS (SELECT 1 FROM public.propagation_batches WHERE id = p_batch_id AND user_id = uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'batch_not_found');
  END IF;

  -- HARD reject: any plant not owned by the caller aborts the whole call. No
  -- idempotency row is written, so a corrected retry re-runs cleanly. Cross-tenant
  -- plants are never silently skipped.
  SELECT array_agg(pid) INTO v_invalid
    FROM unnest(v_ids) AS pid
    WHERE NOT EXISTS (SELECT 1 FROM public.plants WHERE id = pid AND user_id = uid);
  IF v_invalid IS NOT NULL AND array_length(v_invalid, 1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_owned', 'invalid', to_jsonb(v_invalid));
  END IF;

  -- Cycle pre-check (before any write) so we can return a clean envelope; the
  -- BEFORE trigger remains as defense-in-depth for non-RPC writers.
  FOREACH v_plant IN ARRAY v_ids LOOP
    IF public.genetics_lineage_has_cycle(uid, 'batch', p_batch_id, 'plant', v_plant) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cycle_detected', 'plant_id', v_plant);
    END IF;
  END LOOP;

  -- Reassignment requires a reason. Checked BEFORE the write block so a missing
  -- reason never leaves partial writes.
  IF v_reason IS NULL AND EXISTS (
    SELECT 1
    FROM unnest(v_ids) AS pid
    JOIN public.plant_origin_assignments oa ON oa.plant_id = pid AND oa.user_id = uid
    WHERE oa.batch_id <> p_batch_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reassign_reason_required');
  END IF;

  BEGIN
    FOREACH v_plant IN ARRAY v_ids LOOP
      SELECT batch_id INTO v_current_batch
        FROM public.plant_origin_assignments
        WHERE plant_id = v_plant AND user_id = uid;

      IF v_current_batch IS NULL THEN
        INSERT INTO public.plant_origin_assignments (user_id, plant_id, batch_id, assigned_reason)
        VALUES (uid, v_plant, p_batch_id, v_reason);
        INSERT INTO public.plant_origin_assignment_events (user_id, plant_id, from_batch_id, to_batch_id, reason, action)
        VALUES (uid, v_plant, NULL, p_batch_id, v_reason, 'assign');
        v_assigned := v_assigned || v_plant;
      ELSIF v_current_batch = p_batch_id THEN
        v_unchanged := v_unchanged || v_plant;
      ELSE
        UPDATE public.plant_origin_assignments
          SET batch_id = p_batch_id, assigned_reason = v_reason, assigned_at = now(), updated_at = now()
          WHERE plant_id = v_plant AND user_id = uid;
        INSERT INTO public.plant_origin_assignment_events (user_id, plant_id, from_batch_id, to_batch_id, reason, action)
        VALUES (uid, v_plant, v_current_batch, p_batch_id, v_reason, 'reassign');
        v_reassigned := v_reassigned || v_plant;
      END IF;
    END LOOP;

    v_result := jsonb_build_object(
      'ok', true,
      'batch_id', p_batch_id,
      'assigned', to_jsonb(v_assigned),
      'reassigned', to_jsonb(v_reassigned),
      'unchanged', to_jsonb(v_unchanged)
    );

    INSERT INTO public.genetics_mutation_idempotency (user_id, operation, idempotency_key, request_hash, result)
    VALUES (uid, v_op, p_idempotency_key, v_hash, v_result);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'genetics_mutation_idempotency_pkey' THEN
      SELECT result, request_hash INTO v_prior, v_prior_hash
        FROM public.genetics_mutation_idempotency
        WHERE user_id = uid AND operation = v_op AND idempotency_key = p_idempotency_key;
      IF v_prior IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
      END IF;
      IF v_prior_hash IS DISTINCT FROM v_hash THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_conflict');
      END IF;
      RETURN v_prior || jsonb_build_object('reused', true);
    END IF;
    RAISE;
  END;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.genetics_assign_plants(text, uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_assign_plants(text, uuid, uuid[], text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Re-define genetics_batch_upsert to add the mother-edge cycle pre-check (the
-- assignments table it depends on only exists as of this migration). Body is
-- otherwise identical to Slice 2; it still takes the shared lineage lock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.genetics_batch_upsert(
  p_idempotency_key text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_op constant text := 'genetics_batch_upsert';
  v_hash text := md5(coalesce(p_payload::text, ''));
  v_prior jsonb;
  v_prior_hash text;
  v_constraint text;
  v_id uuid;
  v_existing_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_batch_code text := nullif(btrim(p_payload->>'batch_code'), '');
  v_method text := coalesce(nullif(btrim(p_payload->>'propagation_method'), ''), 'unknown');
  v_status text := coalesce(nullif(btrim(p_payload->>'status'), ''), 'planned');
  v_source_accession uuid := nullif(p_payload->>'source_accession_id', '')::uuid;
  v_mother_plant uuid := nullif(p_payload->>'mother_plant_id', '')::uuid;
  v_grow uuid := nullif(p_payload->>'grow_id', '')::uuid;
  v_tent uuid := nullif(p_payload->>'tent_id', '')::uuid;
  v_initial int := nullif(p_payload->>'initial_quantity', '')::int;
  v_viable int := nullif(p_payload->>'viable_quantity', '')::int;
  v_old_status text;
  v_result jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
  END IF;

  SELECT result, request_hash INTO v_prior, v_prior_hash
    FROM public.genetics_mutation_idempotency
    WHERE user_id = uid AND operation = v_op AND idempotency_key = p_idempotency_key;
  IF v_prior IS NOT NULL THEN
    IF v_prior_hash IS DISTINCT FROM v_hash THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_conflict');
    END IF;
    RETURN v_prior || jsonb_build_object('reused', true);
  END IF;

  PERFORM public.genetics_lock_lineage(uid);

  IF v_batch_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'batch_code_required');
  END IF;
  IF v_method NOT IN ('seed', 'cutting', 'tissue_culture', 'division', 'unknown') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_propagation_method');
  END IF;
  IF v_status NOT IN ('planned', 'active', 'rooting', 'rooted', 'completed', 'failed', 'archived') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;
  IF v_initial IS NOT NULL AND v_initial < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_count');
  END IF;
  IF v_viable IS NOT NULL AND v_viable < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_count');
  END IF;
  IF v_viable IS NOT NULL AND v_initial IS NOT NULL AND v_viable > v_initial THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'viable_exceeds_initial');
  END IF;

  IF v_source_accession IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.genetics_accessions WHERE id = v_source_accession AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'source_accession_id');
  END IF;
  IF v_mother_plant IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.plants WHERE id = v_mother_plant AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'mother_plant_id');
  END IF;
  IF v_grow IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.grows WHERE id = v_grow AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'grow_id');
  END IF;
  IF v_tent IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tents WHERE id = v_tent AND user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'linked_reference_invalid', 'field', 'tent_id');
  END IF;

  -- Mother-edge cycle pre-check (clean envelope; trigger is defense-in-depth).
  IF v_mother_plant IS NOT NULL AND v_existing_id IS NOT NULL
     AND public.genetics_lineage_has_cycle(uid, 'plant', v_mother_plant, 'batch', v_existing_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cycle_detected', 'field', 'mother_plant_id');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.propagation_batches
    WHERE user_id = uid AND batch_code = v_batch_code
      AND (v_existing_id IS NULL OR id <> v_existing_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'batch_code_exists');
  END IF;

  BEGIN
    IF v_existing_id IS NOT NULL THEN
      SELECT status INTO v_old_status FROM public.propagation_batches
        WHERE id = v_existing_id AND user_id = uid;
      IF v_old_status IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'batch_not_found');
      END IF;
      UPDATE public.propagation_batches SET
        batch_code = v_batch_code,
        name = nullif(btrim(p_payload->>'name'), ''),
        propagation_method = v_method,
        source_accession_id = v_source_accession,
        mother_plant_id = v_mother_plant,
        origin_unknown = coalesce((p_payload->>'origin_unknown')::boolean, false),
        cut_date = nullif(p_payload->>'cut_date', '')::date,
        received_date = nullif(p_payload->>'received_date', '')::date,
        started_date = nullif(p_payload->>'started_date', '')::date,
        rooted_date = nullif(p_payload->>'rooted_date', '')::date,
        initial_quantity = v_initial,
        viable_quantity = v_viable,
        counts_unknown = coalesce((p_payload->>'counts_unknown')::boolean, false),
        status = v_status,
        grow_id = v_grow,
        tent_id = v_tent,
        notes = nullif(btrim(p_payload->>'notes'), ''),
        updated_at = now()
      WHERE id = v_existing_id AND user_id = uid
      RETURNING id INTO v_id;
      IF v_old_status IS DISTINCT FROM v_status THEN
        INSERT INTO public.propagation_batch_status_events (user_id, batch_id, from_status, to_status, reason)
        VALUES (uid, v_id, v_old_status, v_status, nullif(btrim(p_payload->>'status_reason'), ''));
      END IF;
    ELSE
      INSERT INTO public.propagation_batches (
        user_id, batch_code, name, propagation_method, source_accession_id, mother_plant_id,
        origin_unknown, cut_date, received_date, started_date, rooted_date, initial_quantity,
        viable_quantity, counts_unknown, status, grow_id, tent_id, notes
      ) VALUES (
        uid, v_batch_code, nullif(btrim(p_payload->>'name'), ''), v_method, v_source_accession, v_mother_plant,
        coalesce((p_payload->>'origin_unknown')::boolean, false),
        nullif(p_payload->>'cut_date', '')::date, nullif(p_payload->>'received_date', '')::date,
        nullif(p_payload->>'started_date', '')::date, nullif(p_payload->>'rooted_date', '')::date,
        v_initial, v_viable, coalesce((p_payload->>'counts_unknown')::boolean, false),
        v_status, v_grow, v_tent, nullif(btrim(p_payload->>'notes'), '')
      )
      RETURNING id INTO v_id;
      INSERT INTO public.propagation_batch_status_events (user_id, batch_id, from_status, to_status, reason)
      VALUES (uid, v_id, NULL, v_status, 'batch_created');
    END IF;

    v_result := jsonb_build_object('ok', true, 'batch_id', v_id);

    INSERT INTO public.genetics_mutation_idempotency (user_id, operation, idempotency_key, request_hash, result)
    VALUES (uid, v_op, p_idempotency_key, v_hash, v_result);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'genetics_mutation_idempotency_pkey' THEN
      SELECT result, request_hash INTO v_prior, v_prior_hash
        FROM public.genetics_mutation_idempotency
        WHERE user_id = uid AND operation = v_op AND idempotency_key = p_idempotency_key;
      IF v_prior IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
      END IF;
      IF v_prior_hash IS DISTINCT FROM v_hash THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_conflict');
      END IF;
      RETURN v_prior || jsonb_build_object('reused', true);
    ELSIF v_constraint = 'propagation_batches_user_batch_code_key' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'batch_code_exists');
    END IF;
    RAISE;
  END;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.genetics_batch_upsert(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_batch_upsert(text, jsonb) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
