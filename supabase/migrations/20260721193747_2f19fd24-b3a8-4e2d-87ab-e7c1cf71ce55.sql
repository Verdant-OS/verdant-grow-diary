BEGIN;

CREATE OR REPLACE FUNCTION public.genetics_subject_evidence(
  p_owner uuid,
  p_subject_type text,
  p_subject_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  WITH cur AS (
    SELECT r.target, r.result, r.collected_date,
           row_number() OVER (
             PARTITION BY r.target
             ORDER BY r.collected_date DESC NULLS LAST, r.recorded_at DESC
           ) AS rn
    FROM public.genetics_screening_results r
    WHERE r.user_id = p_owner
      AND r.subject_type = p_subject_type
      AND r.subject_id = p_subject_id
      AND NOT EXISTS (
        SELECT 1 FROM public.genetics_screening_results s2
        WHERE s2.supersedes_id = r.id AND s2.user_id = p_owner
      )
  ),
  latest AS (SELECT target, result, collected_date FROM cur WHERE rn = 1),
  agg AS (
    SELECT
      bool_or(result = 'positive') AS any_pos,
      bool_or(result IN ('inconclusive', 'not_tested')) AS any_incon,
      bool_or(result = 'negative') AS any_neg
    FROM latest
  )
  SELECT jsonb_build_object(
    'state', CASE
       WHEN (SELECT any_pos FROM agg) THEN 'positive'
       WHEN (SELECT any_incon FROM agg) THEN 'inconclusive'
       WHEN (SELECT any_neg FROM agg) THEN 'negative_scoped'
       ELSE 'untested'
     END,
    'targets', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('target', target, 'result', result, 'collected_date', collected_date)
        ORDER BY target
      ) FROM latest
    ), '[]'::jsonb),
    'open_quarantine', EXISTS (
      SELECT 1 FROM public.quarantine_episodes q
      WHERE q.user_id = p_owner AND q.subject_type = p_subject_type
        AND q.subject_id = p_subject_id AND q.status = 'open'
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.genetics_subject_evidence(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_subject_evidence(uuid, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.genetics_trace_resolve(
  p_subject_type text,
  p_subject_id uuid,
  p_direction text DEFAULT 'both',
  p_max_depth int DEFAULT 10,
  p_max_nodes int DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_dir text := coalesce(nullif(btrim(p_direction), ''), 'both');
  v_depth int := least(greatest(coalesce(p_max_depth, 10), 1), 32);
  v_cap int := least(greatest(coalesce(p_max_nodes, 500), 1), 5000);
  v_owned boolean;
  v_node_count int;
  v_truncated boolean := false;
  v_nodes jsonb;
  v_edges jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;
  IF p_subject_type NOT IN ('accession', 'batch', 'plant', 'keeper', 'clone', 'cross') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_subject_type');
  END IF;
  IF v_dir NOT IN ('ancestors', 'descendants', 'both') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_direction');
  END IF;

  v_owned := CASE p_subject_type
    WHEN 'accession' THEN EXISTS (SELECT 1 FROM public.genetics_accessions WHERE id = p_subject_id AND user_id = uid)
    WHEN 'batch' THEN EXISTS (SELECT 1 FROM public.propagation_batches WHERE id = p_subject_id AND user_id = uid)
    WHEN 'plant' THEN EXISTS (SELECT 1 FROM public.plants WHERE id = p_subject_id AND user_id = uid)
    WHEN 'keeper' THEN EXISTS (SELECT 1 FROM public.pheno_keepers WHERE id = p_subject_id AND user_id = uid)
    WHEN 'clone' THEN EXISTS (SELECT 1 FROM public.pheno_keeper_clones WHERE id = p_subject_id AND user_id = uid)
    WHEN 'cross' THEN EXISTS (SELECT 1 FROM public.pheno_crosses WHERE id = p_subject_id AND user_id = uid)
    ELSE false
  END;
  IF NOT v_owned THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  PERFORM set_config('statement_timeout', '5000', true);

  WITH RECURSIVE
  edges AS (
    SELECT 'batch'::text AS child_kind, b.id AS child_id,
           'accession'::text AS parent_kind, a.id AS parent_id,
           'propagated_from_accession'::text AS edge_type
      FROM public.propagation_batches b
      JOIN public.genetics_accessions a ON a.id = b.source_accession_id AND a.user_id = uid
      WHERE b.user_id = uid
    UNION ALL
    SELECT 'batch', b.id, 'plant', p.id, 'mother'
      FROM public.propagation_batches b
      JOIN public.plants p ON p.id = b.mother_plant_id AND p.user_id = uid
      WHERE b.user_id = uid
    UNION ALL
    SELECT 'plant', oa.plant_id, 'batch', oa.batch_id, 'produced_by_batch'
      FROM public.plant_origin_assignments oa
      WHERE oa.user_id = uid
    UNION ALL
    SELECT 'keeper', k.id, 'plant', p.id, 'keeper_source'
      FROM public.pheno_keepers k
      JOIN public.plants p ON p.id = k.source_plant_id AND p.user_id = uid
      WHERE k.user_id = uid
    UNION ALL
    SELECT 'clone', cl.id, 'keeper', k.id, 'clone_of_keeper'
      FROM public.pheno_keeper_clones cl
      JOIN public.pheno_keepers k ON k.id = cl.keeper_id AND k.user_id = uid
      WHERE cl.user_id = uid
    UNION ALL
    SELECT 'clone', cl.id, 'clone', pc.id, 'clone_parent'
      FROM public.pheno_keeper_clones cl
      JOIN public.pheno_keeper_clones pc ON pc.id = cl.parent_clone_id AND pc.user_id = uid
      WHERE cl.user_id = uid AND cl.parent_clone_id IS NOT NULL
    UNION ALL
    SELECT 'clone', cl.id, 'plant', p.id, 'clone_plant'
      FROM public.pheno_keeper_clones cl
      JOIN public.plants p ON p.id = cl.clone_plant_id AND p.user_id = uid
      WHERE cl.user_id = uid AND cl.clone_plant_id IS NOT NULL
    UNION ALL
    SELECT 'cross', x.id, 'keeper', k.id, 'cross_female_parent'
      FROM public.pheno_crosses x
      JOIN public.pheno_keepers k ON k.id = x.female_keeper_id AND k.user_id = uid
      WHERE x.user_id = uid
    UNION ALL
    SELECT 'cross', x.id, 'keeper', k.id, 'cross_male_parent'
      FROM public.pheno_crosses x
      JOIN public.pheno_keepers k ON k.id = x.male_keeper_id AND k.user_id = uid
      WHERE x.user_id = uid AND x.male_keeper_id IS NOT NULL
  ),
  walk AS (
    SELECT child_kind AS src_kind, child_id AS src_id, parent_kind AS dst_kind, parent_id AS dst_id, edge_type
      FROM edges WHERE v_dir IN ('ancestors', 'both')
    UNION ALL
    SELECT parent_kind, parent_id, child_kind, child_id, edge_type
      FROM edges WHERE v_dir IN ('descendants', 'both')
  ),
  trav(kind, id, depth, path, edge_type, from_kind, from_id) AS (
    SELECT p_subject_type, p_subject_id, 0,
           ARRAY[p_subject_type || ':' || p_subject_id::text],
           NULL::text, NULL::text, NULL::uuid
    UNION ALL
    SELECT w.dst_kind, w.dst_id, t.depth + 1,
           t.path || (w.dst_kind || ':' || w.dst_id::text),
           w.edge_type, t.kind, t.id
    FROM trav t
    JOIN walk w ON w.src_kind = t.kind AND w.src_id = t.id
    WHERE t.depth < v_depth
      AND NOT ((w.dst_kind || ':' || w.dst_id::text) = ANY(t.path))
  ),
  ranked AS (
    SELECT DISTINCT ON (kind, id) kind, id, depth, edge_type, from_kind, from_id
    FROM trav
    ORDER BY kind, id, depth ASC, edge_type NULLS FIRST
  ),
  node_total AS (SELECT count(*) AS c FROM ranked),
  capped AS (SELECT * FROM ranked ORDER BY depth, kind, id LIMIT v_cap),
  frontier AS (
    SELECT EXISTS (
      SELECT 1 FROM capped c
      JOIN walk w ON w.src_kind = c.kind AND w.src_id = c.id
      WHERE c.depth = v_depth
        AND NOT EXISTS (SELECT 1 FROM capped c2 WHERE c2.kind = w.dst_kind AND c2.id = w.dst_id)
    ) AS more
  ),
  hydrated AS (
    SELECT
      (c.kind || ':' || c.id::text) AS node_key,
      c.kind, c.id, c.depth, c.edge_type,
      CASE WHEN c.from_kind IS NULL THEN NULL ELSE (c.from_kind || ':' || c.from_id::text) END AS from_key,
      CASE c.kind
        WHEN 'accession' THEN (SELECT coalesce(nullif(btrim(a.cultivar_name), ''), nullif(btrim(a.line_name), ''), 'Unknown accession') FROM public.genetics_accessions a WHERE a.id = c.id AND a.user_id = uid)
        WHEN 'batch' THEN (SELECT coalesce(nullif(btrim(b.name), ''), b.batch_code) FROM public.propagation_batches b WHERE b.id = c.id AND b.user_id = uid)
        WHEN 'plant' THEN (SELECT p.name FROM public.plants p WHERE p.id = c.id AND p.user_id = uid)
        WHEN 'keeper' THEN (SELECT k.keeper_name FROM public.pheno_keepers k WHERE k.id = c.id AND k.user_id = uid)
        WHEN 'clone' THEN (SELECT cl.clone_label FROM public.pheno_keeper_clones cl WHERE cl.id = c.id AND cl.user_id = uid)
        WHEN 'cross' THEN (SELECT coalesce(nullif(btrim(x.cross_name), ''), 'Cross') FROM public.pheno_crosses x WHERE x.id = c.id AND x.user_id = uid)
      END AS label,
      CASE WHEN c.kind IN ('accession', 'batch', 'plant')
           THEN public.genetics_subject_evidence(uid, c.kind, c.id)
           ELSE NULL END AS evidence,
      CASE c.kind
        WHEN 'batch' THEN (SELECT CASE WHEN b.origin_unknown OR (b.mother_plant_id IS NULL AND b.source_accession_id IS NULL) THEN jsonb_build_array('unknown_origin') ELSE '[]'::jsonb END FROM public.propagation_batches b WHERE b.id = c.id AND b.user_id = uid)
        WHEN 'plant' THEN (CASE WHEN NOT EXISTS (SELECT 1 FROM public.plant_origin_assignments oa WHERE oa.plant_id = c.id AND oa.user_id = uid) THEN jsonb_build_array('unassigned_origin') ELSE '[]'::jsonb END)
        WHEN 'keeper' THEN (CASE WHEN NOT EXISTS (SELECT 1 FROM public.genetics_accessions a WHERE a.linked_keeper_id = c.id AND a.user_id = uid) THEN jsonb_build_array('no_accession_link') ELSE '[]'::jsonb END)
        ELSE '[]'::jsonb
      END AS gaps
    FROM capped c
  )
  SELECT
    (SELECT c FROM node_total),
    ((SELECT c FROM node_total) > v_cap) OR (SELECT more FROM frontier),
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', node_key, 'kind', kind, 'id', id, 'depth', depth,
          'label', label, 'edge_type', edge_type, 'from', from_key,
          'evidence', evidence, 'gaps', gaps
        ) ORDER BY depth, kind, id
      ) FROM hydrated
    ), '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('from', from_key, 'to', node_key, 'edge_type', edge_type)
        ORDER BY depth, node_key
      ) FILTER (WHERE from_key IS NOT NULL) FROM hydrated
    ), '[]'::jsonb)
  INTO v_node_count, v_truncated, v_nodes, v_edges;

  RETURN jsonb_build_object(
    'ok', true,
    'subject', jsonb_build_object('kind', p_subject_type, 'id', p_subject_id),
    'direction', v_dir,
    'node_count', coalesce(v_node_count, 0),
    'truncated', coalesce(v_truncated, false),
    'nodes', coalesce(v_nodes, '[]'::jsonb),
    'edges', coalesce(v_edges, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.genetics_trace_resolve(text, uuid, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.genetics_trace_resolve(text, uuid, text, int, int) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';