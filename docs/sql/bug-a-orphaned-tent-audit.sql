-- BUG-A read-only audit: run BEFORE applying 20260722120000_bug_a_orphaned_tent_backfill.sql.
-- Reports every orphaned tent (grow_id IS NULL) with its active plant count,
-- plus per-grow plant counts resolved the same way the app will resolve them
-- (own grow_id OR tent rollup). Nothing here writes.

-- 1. Orphaned tents with plant counts
SELECT t.id AS tent_id, t.name AS tent_name, t.user_id,
       count(p.id) FILTER (WHERE COALESCE(p.is_archived,false) = false) AS active_plants
  FROM public.tents t
  LEFT JOIN public.plants p ON p.tent_id = t.id
 WHERE t.grow_id IS NULL
 GROUP BY t.id, t.name, t.user_id
 ORDER BY active_plants DESC;

-- 2. Per-grow resolved plant counts (before backfill)
SELECT g.id AS grow_id, g.name AS grow_name,
       (SELECT count(*) FROM public.plants p
         WHERE COALESCE(p.is_archived,false) = false
           AND (p.grow_id = g.id
                OR p.tent_id IN (SELECT id FROM public.tents WHERE grow_id = g.id))
       ) AS resolved_active_plants
  FROM public.grows g
 ORDER BY g.name;

-- 3. Plants attributed to no grow even after tent rollup (true Unassigned)
SELECT p.id, p.name, p.tent_id
  FROM public.plants p
  LEFT JOIN public.tents t ON t.id = p.tent_id
 WHERE COALESCE(p.is_archived,false) = false
   AND p.grow_id IS NULL
   AND (t.id IS NULL OR t.grow_id IS NULL);
