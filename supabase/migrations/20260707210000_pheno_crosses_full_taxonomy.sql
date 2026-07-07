-- Breeding taxonomy (2/4): full cross-type set + pollen channel on pheno_crosses.
--
-- Slice 1 grew the pure CrossType/Channel model (breedingReproductionRules.ts,
-- reviewed with James Loud Genetics). This migration makes the same taxonomy
-- persistable, additively and without disturbing existing rows:
--
--   * cross_type CHECK expands from 3 values to the full 15. The original three
--     (standard_f1 / feminized_cross / selfing_s1) are unchanged, so live rows
--     stay valid.
--   * channel — HOW the pollen was produced (natural male / a reversal method /
--     rodelization / open pollination). Nullable: legacy rows have no channel.
--   * generation — F#/S#/BX# number. Nullable, >= 1 when present.
--   * recurrent_parent_id — the line a backcross crosses back to. Required for
--     backcross / feminized_bx, null otherwise.
--
-- The parent-structure CHECK and the RLS reversal precondition are rebuilt to
-- cover the new ways. Channel-less (legacy) inserts keep their EXACT prior
-- guard; channelled inserts get a channel-driven reversal rule.
--
-- Record-only, privacy-first: every row stays private to its owner on read AND
-- write; nothing here starts a grow, collects pollen, or touches a plant.

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.pheno_crosses
  ADD COLUMN channel text,
  ADD COLUMN generation integer,
  ADD COLUMN recurrent_parent_id uuid REFERENCES public.pheno_keepers(id) ON DELETE SET NULL;

-- channel: null (unspecified / legacy) or one of the six canonical routes.
ALTER TABLE public.pheno_crosses
  ADD CONSTRAINT pheno_crosses_channel_check CHECK (
    channel IS NULL
    OR channel IN ('natural_male', 'colloidal_silver', 'sts', 'ga3', 'rodelization', 'open_pollination')
  );

-- generation: null, or a positive F#/S#/BX# number.
ALTER TABLE public.pheno_crosses
  ADD CONSTRAINT pheno_crosses_generation_check CHECK (
    generation IS NULL OR generation >= 1
  );

-- ---------------------------------------------------------------------------
-- 2. Expand the cross_type CHECK to the full taxonomy
-- ---------------------------------------------------------------------------

ALTER TABLE public.pheno_crosses
  DROP CONSTRAINT pheno_crosses_cross_type_check;

ALTER TABLE public.pheno_crosses
  ADD CONSTRAINT pheno_crosses_cross_type_check CHECK (
    cross_type IN (
      'standard_f1', 'feminized_cross', 'selfing_s1',
      'filial', 'ibl', 'selfing_sn', 'feminized_bx', 'backcross',
      'sib_cross', 'outcross', 'line_cross', 'open_pollination',
      'test_cross', 'reciprocal_cross', 'three_way_cross'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Parent structure by type (rebuild for the full set)
-- ---------------------------------------------------------------------------
-- Selfing (S1/Sn): one parent — the reversed mother pollinates itself, so the
--   male parent is NULL.
-- Open pollination: population pollen — the male parent may be absent.
-- Everything else: two DISTINCT non-null parents.

ALTER TABLE public.pheno_crosses
  DROP CONSTRAINT pheno_crosses_parents_by_type;

ALTER TABLE public.pheno_crosses
  ADD CONSTRAINT pheno_crosses_parents_by_type CHECK (
    (cross_type IN ('selfing_s1', 'selfing_sn') AND male_keeper_id IS NULL)
    OR (cross_type = 'open_pollination')
    OR (
      cross_type NOT IN ('selfing_s1', 'selfing_sn', 'open_pollination')
      AND male_keeper_id IS NOT NULL
      AND male_keeper_id <> female_keeper_id
    )
  );

-- A backcross must name the recurrent parent it crosses back to.
ALTER TABLE public.pheno_crosses
  ADD CONSTRAINT pheno_crosses_recurrent_parent_required CHECK (
    cross_type NOT IN ('backcross', 'feminized_bx') OR recurrent_parent_id IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- 4. Rebuild the write policies: ownership guards + reversal precondition
-- ---------------------------------------------------------------------------
-- Adds a recurrent-parent ownership guard and a channel-driven reversal
-- precondition (defense in depth for classifyCross / validateBreedingCross):
--   * channel IS NULL (legacy / channel-less inserts) -> the ORIGINAL
--     cross_type-based guard, unchanged, so existing behaviour is preserved and
--     the current service keeps working;
--   * a chemical reversal channel (colloidal silver / STS / GA3) -> the pollen
--     source must have a reversal on record (the mother for a self, the donor
--     otherwise);
--   * natural male / rodelization / open pollination -> no reversal record
--     required (rodelization is natural stress, not a recorded reversal).

DROP POLICY "pheno_crosses_insert_own" ON public.pheno_crosses;
CREATE POLICY "pheno_crosses_insert_own"
  ON public.pheno_crosses FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers f
      WHERE f.id = female_keeper_id AND f.user_id = auth.uid()
    )
    AND (
      male_keeper_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_keepers m
        WHERE m.id = male_keeper_id AND m.user_id = auth.uid()
      )
    )
    AND (
      recurrent_parent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_keepers rp
        WHERE rp.id = recurrent_parent_id AND rp.user_id = auth.uid()
      )
    )
    AND (
      hunt_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid()
      )
    )
    AND (
      CASE
        -- Selfing (S1/Sn): the mother pollinates itself, so she must be reversed,
        -- and the channel must be a reversal method (or NULL, for legacy rows) —
        -- never a natural male or open pollination.
        WHEN cross_type IN ('selfing_s1', 'selfing_sn') THEN
          (channel IS NULL OR channel IN ('colloidal_silver', 'sts', 'ga3', 'rodelization'))
          AND EXISTS (
            SELECT 1 FROM public.pheno_reversals r
            WHERE r.keeper_id = female_keeper_id AND r.user_id = auth.uid()
          )
        -- Feminized crosses: reversed-female pollen onto another female, so the
        -- channel must be a reversal method (or NULL, legacy). A CHEMICAL reversal
        -- requires the pollen donor to have a reversal on record; rodelization is
        -- natural stress and carries none.
        WHEN cross_type IN ('feminized_cross', 'feminized_bx') THEN
          (channel IS NULL OR channel IN ('colloidal_silver', 'sts', 'ga3', 'rodelization'))
          AND (
            channel = 'rodelization'
            OR (
              male_keeper_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.pheno_reversals r
                WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
              )
            )
          )
        -- Filial (F2+) and backcross MAY legitimately be feminized (made with
        -- reversal pollen) or regular, so they carry no reversal-record or
        -- channel requirement — validateBreedingCross is their primary guard.
        WHEN cross_type IN ('filial', 'backcross') THEN
          TRUE
        -- Every remaining regular way (standard_f1, ibl, sib_cross, outcross,
        -- line_cross, test_cross, reciprocal_cross, three_way_cross,
        -- open_pollination): the pollen must be a real male, so a reversal
        -- channel (which makes feminized pollen) is forbidden AND the donor must
        -- NOT be reversed. This preserves the original standard_f1 guard for ALL
        -- channels, not only the channel-less path.
        ELSE
          (channel IS NULL OR channel NOT IN ('colloidal_silver', 'sts', 'ga3', 'rodelization'))
          AND NOT EXISTS (
            SELECT 1 FROM public.pheno_reversals r
            WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
          )
      END
    )
  );

DROP POLICY "pheno_crosses_update_own" ON public.pheno_crosses;
CREATE POLICY "pheno_crosses_update_own"
  ON public.pheno_crosses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_keepers f
      WHERE f.id = female_keeper_id AND f.user_id = auth.uid()
    )
    AND (
      male_keeper_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_keepers m
        WHERE m.id = male_keeper_id AND m.user_id = auth.uid()
      )
    )
    AND (
      recurrent_parent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_keepers rp
        WHERE rp.id = recurrent_parent_id AND rp.user_id = auth.uid()
      )
    )
    AND (
      hunt_id IS NULL OR EXISTS (
        SELECT 1 FROM public.pheno_hunts h WHERE h.id = hunt_id AND h.user_id = auth.uid()
      )
    )
    AND (
      CASE
        -- Selfing (S1/Sn): the mother pollinates itself, so she must be reversed,
        -- and the channel must be a reversal method (or NULL, for legacy rows) —
        -- never a natural male or open pollination.
        WHEN cross_type IN ('selfing_s1', 'selfing_sn') THEN
          (channel IS NULL OR channel IN ('colloidal_silver', 'sts', 'ga3', 'rodelization'))
          AND EXISTS (
            SELECT 1 FROM public.pheno_reversals r
            WHERE r.keeper_id = female_keeper_id AND r.user_id = auth.uid()
          )
        -- Feminized crosses: reversed-female pollen onto another female, so the
        -- channel must be a reversal method (or NULL, legacy). A CHEMICAL reversal
        -- requires the pollen donor to have a reversal on record; rodelization is
        -- natural stress and carries none.
        WHEN cross_type IN ('feminized_cross', 'feminized_bx') THEN
          (channel IS NULL OR channel IN ('colloidal_silver', 'sts', 'ga3', 'rodelization'))
          AND (
            channel = 'rodelization'
            OR (
              male_keeper_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.pheno_reversals r
                WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
              )
            )
          )
        -- Filial (F2+) and backcross MAY legitimately be feminized (made with
        -- reversal pollen) or regular, so they carry no reversal-record or
        -- channel requirement — validateBreedingCross is their primary guard.
        WHEN cross_type IN ('filial', 'backcross') THEN
          TRUE
        -- Every remaining regular way (standard_f1, ibl, sib_cross, outcross,
        -- line_cross, test_cross, reciprocal_cross, three_way_cross,
        -- open_pollination): the pollen must be a real male, so a reversal
        -- channel (which makes feminized pollen) is forbidden AND the donor must
        -- NOT be reversed. This preserves the original standard_f1 guard for ALL
        -- channels, not only the channel-less path.
        ELSE
          (channel IS NULL OR channel NOT IN ('colloidal_silver', 'sts', 'ga3', 'rodelization'))
          AND NOT EXISTS (
            SELECT 1 FROM public.pheno_reversals r
            WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
          )
      END
    )
  );

CREATE INDEX pheno_crosses_recurrent_parent_idx
  ON public.pheno_crosses (recurrent_parent_id);
