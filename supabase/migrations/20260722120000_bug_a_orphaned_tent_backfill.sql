-- BUG-A: guarded one-time backfill for orphaned tents (tents.grow_id IS NULL).
--
-- HOLD: run the read-only audit below (or docs/sql/bug-a-orphaned-tent-audit.sql)
-- and confirm the reported tents/plant counts match expectations BEFORE this
-- migration is applied. The confirmed mapping (founder brief, 2026-07-22):
--   - tent "Seedling A"  (grow_id NULL) → Banana Cough      773a9a92-432b-46ea-ba8d-4e813c3ad8f8
--   - tent "Vegetation"  (grow_id NULL) → Project McDonald  2658312d-2a12-43d2-b1db-7f34b74d3451
--   - tent "Flower"      (grow_id NULL) → Project McDonald  2658312d-2a12-43d2-b1db-7f34b74d3451
--
-- Guards (all must hold, or the row is skipped — never fails the migration):
--   * only tents whose grow_id IS NULL (never re-points an attributed tent);
--   * name match is scoped to the OWNER of the target grow (never by name
--     alone across users/workspaces);
--   * archived/merged plants are untouched — this migration writes ONLY
--     tents.grow_id. Plants roll up at read time via growAttributionRules
--     (plants.grow_id stays exactly as the grower left it).
--
-- Idempotent: re-running finds no NULL-grow tents with these names and no-ops.
-- Rollback: each updated tent id is reported via RAISE NOTICE; setting those
-- tents' grow_id back to NULL restores the prior state exactly.

DO $$
DECLARE
  v_banana  uuid := '773a9a92-432b-46ea-ba8d-4e813c3ad8f8';
  v_mcd     uuid := '2658312d-2a12-43d2-b1db-7f34b74d3451';
  v_banana_owner uuid;
  v_mcd_owner    uuid;
  r RECORD;
  v_count int;
BEGIN
  SELECT user_id INTO v_banana_owner FROM public.grows WHERE id = v_banana;
  SELECT user_id INTO v_mcd_owner    FROM public.grows WHERE id = v_mcd;

  IF v_banana_owner IS NULL OR v_mcd_owner IS NULL THEN
    RAISE NOTICE 'BUG-A backfill: target grow(s) not found — nothing changed.';
    RETURN;
  END IF;

  -- ---- BEFORE audit: orphaned tents with plant counts -------------------
  RAISE NOTICE 'BUG-A audit (before): orphaned tents (grow_id IS NULL):';
  FOR r IN
    SELECT t.id, t.name, t.user_id,
           (SELECT count(*) FROM public.plants p
             WHERE p.tent_id = t.id AND COALESCE(p.is_archived, false) = false) AS plant_count
      FROM public.tents t
     WHERE t.grow_id IS NULL
  LOOP
    RAISE NOTICE '  tent % "%" owner % — % active plant(s)',
      r.id, r.name, r.user_id, r.plant_count;
  END LOOP;

  -- ---- Guarded backfill -------------------------------------------------
  UPDATE public.tents t
     SET grow_id = v_banana
   WHERE t.grow_id IS NULL
     AND t.user_id = v_banana_owner
     AND t.name = 'Seedling A';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'BUG-A backfill: % tent(s) "Seedling A" → Banana Cough', v_count;

  UPDATE public.tents t
     SET grow_id = v_mcd
   WHERE t.grow_id IS NULL
     AND t.user_id = v_mcd_owner
     AND t.name IN ('Vegetation', 'Flower');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'BUG-A backfill: % tent(s) Vegetation/Flower → Project McDonald', v_count;

  -- ---- AFTER verification: resolved plant counts per target grow --------
  FOR r IN
    SELECT g.id, g.name,
           (SELECT count(*) FROM public.plants p
             WHERE COALESCE(p.is_archived, false) = false
               AND (p.grow_id = g.id
                    OR p.tent_id IN (SELECT id FROM public.tents WHERE grow_id = g.id))
           ) AS resolved_plants
      FROM public.grows g
     WHERE g.id IN (v_banana, v_mcd)
  LOOP
    RAISE NOTICE 'BUG-A verify (after): grow "%" resolves % plant(s)', r.name, r.resolved_plants;
  END LOOP;
END $$;
