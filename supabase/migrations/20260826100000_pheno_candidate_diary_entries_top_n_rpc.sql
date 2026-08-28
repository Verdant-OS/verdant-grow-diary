-- Pheno Hunt candidates — server-side top-N-per-plant diary evidence read.
--
-- loadCandidateDiaryEvidence (src/lib/phenoHuntCandidatesService.ts) issued
-- ONE diary_entries query PER candidate plant (limit 40 each, batched 8 at a
-- time). That O(n) fan-out was itself the fix for an earlier defect where a
-- single global limit let one prolific candidate starve its siblings of diary
-- evidence entirely. This RPC is the deferred clean end-state (#1144): one
-- request returns each plant's OWN newest rows, so no candidate can consume
-- another's budget and the page loads in one round trip.
--
-- Safety shape (mirrors get_latest_tent_sensor_snapshot, 20260610225713, and
-- the security_invoker latest-sex view, 20260709170000):
--   * SECURITY INVOKER — the caller's own diary_entries RLS ("Users view own
--     entries", auth.uid() = user_id) binds every row. The function grants no
--     new visibility and never accepts a client-supplied user id.
--   * STABLE, SET search_path = public, pg_temp.
--   * Retracted entries (retracted_at IS NOT NULL, 20260811090000) are
--     excluded, matching the client's `.is("retracted_at", null)` filter.
--   * p_limit_per_plant is clamped server-side to [1, 40] (40 =
--     DIARY_EVIDENCE_ROWS_PER_PLANT, the bound the per-plant loop enforced).
--   * p_plant_ids is capped at 100 ids (MAX_PAGE_SIZE, the workspace's
--     existing candidate-page bound). Oversized requests are REJECTED, not
--     clamped: silently dropping plants would render them as evidence-free —
--     the exact starvation defect this read exists to prevent. The client
--     chunks larger comparison reads.
--   * Ordering inside each partition is entry_at DESC, id DESC — identical to
--     the per-plant query it replaces, so results are deterministic and the
--     pure mapper's 5-entry / 4-photo presentation caps see the same rows.
--   * Served by the existing idx_diary_entries_plant_entry_at
--     (plant_id, entry_at DESC) partial index (20260519183148); no new index
--     or table is needed.
--
-- No table, column, policy, or data change. Function + grants only.

CREATE OR REPLACE FUNCTION public.pheno_candidate_diary_entries_top_n(
  p_plant_ids uuid[],
  p_limit_per_plant integer DEFAULT 40
)
RETURNS TABLE (
  id uuid,
  plant_id uuid,
  entry_at timestamptz,
  note text,
  photo_url text,
  details jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit_per_plant, 40), 1), 40);
BEGIN
  IF p_plant_ids IS NULL OR cardinality(p_plant_ids) = 0 THEN
    RETURN;
  END IF;

  IF cardinality(p_plant_ids) > 100 THEN
    RAISE EXCEPTION
      'pheno_candidate_diary_entries_top_n: too many plant ids (% > 100)',
      cardinality(p_plant_ids)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      d.id,
      d.plant_id,
      d.entry_at,
      d.note,
      d.photo_url,
      d.details,
      row_number() OVER (
        PARTITION BY d.plant_id
        ORDER BY d.entry_at DESC, d.id DESC
      ) AS rn
    FROM public.diary_entries d
    WHERE d.plant_id = ANY (p_plant_ids)
      AND d.retracted_at IS NULL
  )
  SELECT r.id, r.plant_id, r.entry_at, r.note, r.photo_url, r.details
  FROM ranked r
  WHERE r.rn <= v_limit
  ORDER BY r.plant_id, r.entry_at DESC, r.id DESC;
END;
$$;

COMMENT ON FUNCTION public.pheno_candidate_diary_entries_top_n(uuid[], integer) IS
  'Top-N-per-plant diary evidence for Pheno Hunt candidates. SECURITY INVOKER — caller RLS on diary_entries applies; excludes retracted rows; per-plant limit clamped to [1,40]; at most 100 plant ids per call.';

-- Grants follow the pheno RPC pattern (pheno_ingest, 20260720130000):
-- authenticated only. PUBLIC's default EXECUTE is revoked, and anon /
-- service_role are revoked explicitly so legacy default privileges cannot
-- silently re-grant them (the 20260815054645 / 20260821064300 hardening
-- class). The client never uses service_role, and this read has no server-key
-- caller.
REVOKE ALL ON FUNCTION public.pheno_candidate_diary_entries_top_n(uuid[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pheno_candidate_diary_entries_top_n(uuid[], integer) FROM anon;
REVOKE ALL ON FUNCTION public.pheno_candidate_diary_entries_top_n(uuid[], integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pheno_candidate_diary_entries_top_n(uuid[], integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
