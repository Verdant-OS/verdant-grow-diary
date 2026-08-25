-- Restore the grow/tent ownership verification on pheno_hunts writes.
--
-- The v1 pheno_hunts INSERT policy (20260618232935) verified that grow_id and
-- tent_id reference the CALLER'S OWN grow and tent. The v2 rewrite
-- (20260618233452) replaced it with a bare auth.uid() = user_id check, so an
-- authenticated user could INSERT a hunt whose grow_id / tent_id reference
-- another user's grow or tent (the FK passes; nothing re-verified ownership).
-- Downstream guards (plants_candidate_number_guard's lineage check) keep such
-- a hunt sterile of candidates, but the cross-tenant reference itself was
-- storable. No later migration restored the check — this one does, for both
-- INSERT and UPDATE (the v2 UPDATE policy had no WITH CHECK, so an owner
-- could also repoint an existing hunt at a foreign grow/tent).
--
-- Additive policy replacement only: no table, column, or data change. The
-- RESTRICTIVE Pro-entitlement policies from 20260709192453 are unaffected
-- (restrictive policies AND with these permissive ones).
--
-- Tent-grow consistency: when the tent is assigned to a grow, it must be the
-- hunt's grow (t.grow_id IS NULL stays allowed — legacy unassigned tents are
-- ownable context, not a cross-tenant reference).

DROP POLICY IF EXISTS "Users insert own pheno_hunts" ON public.pheno_hunts;
CREATE POLICY "Users insert own pheno_hunts"
  ON public.pheno_hunts FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = pheno_hunts.grow_id AND g.user_id = auth.uid()
    )
    AND (
      pheno_hunts.tent_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.tents t
        WHERE t.id = pheno_hunts.tent_id
          AND t.user_id = auth.uid()
          AND (t.grow_id IS NULL OR t.grow_id = pheno_hunts.grow_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users update own pheno_hunts" ON public.pheno_hunts;
CREATE POLICY "Users update own pheno_hunts"
  ON public.pheno_hunts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = pheno_hunts.grow_id AND g.user_id = auth.uid()
    )
    AND (
      pheno_hunts.tent_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.tents t
        WHERE t.id = pheno_hunts.tent_id
          AND t.user_id = auth.uid()
          AND (t.grow_id IS NULL OR t.grow_id = pheno_hunts.grow_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Close the Pro-entitlement gating gap on the two pheno_* tables that were
-- added AFTER the 20260709192453 restrictive-policy sweep and never entered
-- its table list: pheno_male_evaluations and pheno_pollen_viability_tests.
-- Every other pheno_* write surface requires the Pheno Tracker entitlement;
-- without this, these two would be writable by any authenticated Free user
-- once their migrations are applied. Guarded with to_regclass so the block
-- no-ops on an environment where the tables do not (yet) exist.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  late_pheno_tables text[] := ARRAY[
    'pheno_male_evaluations',
    'pheno_pollen_viability_tests'
  ];
BEGIN
  FOREACH t IN ARRAY late_pheno_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      t || '_pro_required_insert', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      t || '_pro_required_update', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      t || '_pro_required_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated '
      'WITH CHECK (public.has_pheno_tracker_entitlement(auth.uid()))',
      t || '_pro_required_insert', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated '
      'USING (public.has_pheno_tracker_entitlement(auth.uid())) '
      'WITH CHECK (public.has_pheno_tracker_entitlement(auth.uid()))',
      t || '_pro_required_update', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated '
      'USING (public.has_pheno_tracker_entitlement(auth.uid()))',
      t || '_pro_required_delete', t);
  END LOOP;
END $$;
