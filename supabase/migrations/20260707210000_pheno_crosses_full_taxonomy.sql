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

-- recurrent_parent_id CASCADEs like the female/male parents: deleting a keeper
-- removes the crosses that reference it (SET NULL would strand a backcross with
-- a null recurrent parent, violating pheno_crosses_recurrent_parent_by_type).
ALTER TABLE public.pheno_crosses
  ADD COLUMN channel text,
  ADD COLUMN generation integer,
  ADD COLUMN recurrent_parent_id uuid REFERENCES public.pheno_keepers(id) ON DELETE CASCADE;

-- channel: null (unspecified / legacy) or one of the six canonical routes.
ALTER TABLE public.pheno_crosses
  ADD CONSTRAINT pheno_crosses_channel_check CHECK (
    channel IS NULL
    OR channel IN ('natural_male', 'colloidal_silver', 'sts', 'ga3', 'rodelization', 'open_pollination')
  );

-- generation is TYPE-AWARE (mirrors validateBreedingCross): F2+/S2+ need >= 2,
-- BX needs >= 1, and every non-generation way must leave it NULL. Legacy rows
-- (the original 3 ways) have generation NULL and take the ELSE branch.
ALTER TABLE public.pheno_crosses
  ADD CONSTRAINT pheno_crosses_generation_check CHECK (
    CASE
      WHEN cross_type IN ('filial', 'selfing_sn') THEN generation IS NOT NULL AND generation >= 2
      WHEN cross_type IN ('backcross', 'feminized_bx') THEN generation IS NOT NULL AND generation >= 1
      ELSE generation IS NULL
    END
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
    -- Open pollination: the male parent may be absent, but if one is named it
    -- must still be a DISTINCT keeper (never the mother herself).
    OR (
      cross_type = 'open_pollination'
      AND (male_keeper_id IS NULL OR male_keeper_id <> female_keeper_id)
    )
    OR (
      cross_type NOT IN ('selfing_s1', 'selfing_sn', 'open_pollination')
      AND male_keeper_id IS NOT NULL
      AND male_keeper_id <> female_keeper_id
    )
  );

-- A backcross MUST name the recurrent parent it crosses back to; every other
-- way must leave it NULL (the column is meaningless off a backcross).
ALTER TABLE public.pheno_crosses
  ADD CONSTRAINT pheno_crosses_recurrent_parent_by_type CHECK (
    (cross_type IN ('backcross', 'feminized_bx') AND recurrent_parent_id IS NOT NULL)
    OR (cross_type NOT IN ('backcross', 'feminized_bx') AND recurrent_parent_id IS NULL)
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
        -- A CHEMICAL reversal channel (CS/STS/GA3) makes feminized pollen, so
        -- ONLY a feminizable way may use it and the pollen SOURCE must be
        -- reversed — the mother for a self, the male donor for the rest. A
        -- regular way on a chemical channel is rejected (a reversed donor would
        -- make it feminized), matching validateBreedingCross.
        WHEN channel IN ('colloidal_silver', 'sts', 'ga3') THEN
          CASE
            WHEN cross_type IN ('selfing_s1', 'selfing_sn') THEN EXISTS (
              SELECT 1 FROM public.pheno_reversals r
              WHERE r.keeper_id = female_keeper_id AND r.user_id = auth.uid()
            )
            WHEN cross_type IN ('feminized_cross', 'feminized_bx', 'filial', 'backcross') THEN
              male_keeper_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.pheno_reversals r
                WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
              )
            ELSE FALSE
          END
        -- Rodelization: feminized pollen from natural self-stress, so no reversal
        -- record for the DONOR — but a self still needs the mother reversed (as in
        -- validateBreedingCross), and only feminizable ways may use it.
        WHEN channel = 'rodelization' THEN
          CASE
            WHEN cross_type IN ('selfing_s1', 'selfing_sn') THEN EXISTS (
              SELECT 1 FROM public.pheno_reversals r
              WHERE r.keeper_id = female_keeper_id AND r.user_id = auth.uid()
            )
            WHEN cross_type IN ('feminized_cross', 'feminized_bx', 'filial', 'backcross') THEN TRUE
            ELSE FALSE
          END
        -- Natural male / open pollination: real male pollen, so an inherently-
        -- feminized way is invalid AND the donor must NOT be a reversed female
        -- (whose pollen carries only female genetics -> feminized seed; a
        -- reversed female has no natural-male pollen). A NULL donor (open
        -- pollination population) passes. Mirrors validateBreedingCross's
        -- reversed-donor guard and the channel-less arm below.
        WHEN channel IN ('natural_male', 'open_pollination') THEN
          cross_type NOT IN ('selfing_s1', 'selfing_sn', 'feminized_cross', 'feminized_bx')
          AND NOT EXISTS (
            SELECT 1 FROM public.pheno_reversals r
            WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
          )
        -- Channel-less (legacy / current service): preserve the original 3-type
        -- guard EXACTLY, and treat EVERY regular way uniformly (same rule as the
        -- natural_male arm above): a real male donor, never a reversed female
        -- whose pollen is feminized. A GENUINELY feminized filial/BX is only ever
        -- recorded via an explicit reversal/rodelization channel (the arms above),
        -- never through this channel-less path.
        ELSE
          (
            -- Every regular way (standard_f1, filial, backcross, ibl, sib_cross,
            -- outcross, line_cross, open_pollination, test_cross, reciprocal_cross,
            -- three_way_cross): donor must NOT be reversed. A NULL donor (open
            -- pollination) passes.
            cross_type NOT IN ('selfing_s1', 'selfing_sn', 'feminized_cross', 'feminized_bx')
            AND NOT EXISTS (
              SELECT 1 FROM public.pheno_reversals r
              WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
            )
          )
          OR (
            cross_type IN ('selfing_s1', 'selfing_sn') AND EXISTS (
              SELECT 1 FROM public.pheno_reversals r
              WHERE r.keeper_id = female_keeper_id AND r.user_id = auth.uid()
            )
          )
          OR (
            cross_type IN ('feminized_cross', 'feminized_bx')
            AND male_keeper_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.pheno_reversals r
              WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
            )
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
        -- A CHEMICAL reversal channel (CS/STS/GA3) makes feminized pollen, so
        -- ONLY a feminizable way may use it and the pollen SOURCE must be
        -- reversed — the mother for a self, the male donor for the rest. A
        -- regular way on a chemical channel is rejected (a reversed donor would
        -- make it feminized), matching validateBreedingCross.
        WHEN channel IN ('colloidal_silver', 'sts', 'ga3') THEN
          CASE
            WHEN cross_type IN ('selfing_s1', 'selfing_sn') THEN EXISTS (
              SELECT 1 FROM public.pheno_reversals r
              WHERE r.keeper_id = female_keeper_id AND r.user_id = auth.uid()
            )
            WHEN cross_type IN ('feminized_cross', 'feminized_bx', 'filial', 'backcross') THEN
              male_keeper_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.pheno_reversals r
                WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
              )
            ELSE FALSE
          END
        -- Rodelization: feminized pollen from natural self-stress, so no reversal
        -- record for the DONOR — but a self still needs the mother reversed (as in
        -- validateBreedingCross), and only feminizable ways may use it.
        WHEN channel = 'rodelization' THEN
          CASE
            WHEN cross_type IN ('selfing_s1', 'selfing_sn') THEN EXISTS (
              SELECT 1 FROM public.pheno_reversals r
              WHERE r.keeper_id = female_keeper_id AND r.user_id = auth.uid()
            )
            WHEN cross_type IN ('feminized_cross', 'feminized_bx', 'filial', 'backcross') THEN TRUE
            ELSE FALSE
          END
        -- Natural male / open pollination: real male pollen, so an inherently-
        -- feminized way is invalid AND the donor must NOT be a reversed female
        -- (whose pollen carries only female genetics -> feminized seed; a
        -- reversed female has no natural-male pollen). A NULL donor (open
        -- pollination population) passes. Mirrors validateBreedingCross's
        -- reversed-donor guard and the channel-less arm below.
        WHEN channel IN ('natural_male', 'open_pollination') THEN
          cross_type NOT IN ('selfing_s1', 'selfing_sn', 'feminized_cross', 'feminized_bx')
          AND NOT EXISTS (
            SELECT 1 FROM public.pheno_reversals r
            WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
          )
        -- Channel-less (legacy / current service): preserve the original 3-type
        -- guard EXACTLY, and treat EVERY regular way uniformly (same rule as the
        -- natural_male arm above): a real male donor, never a reversed female
        -- whose pollen is feminized. A GENUINELY feminized filial/BX is only ever
        -- recorded via an explicit reversal/rodelization channel (the arms above),
        -- never through this channel-less path.
        ELSE
          (
            -- Every regular way (standard_f1, filial, backcross, ibl, sib_cross,
            -- outcross, line_cross, open_pollination, test_cross, reciprocal_cross,
            -- three_way_cross): donor must NOT be reversed. A NULL donor (open
            -- pollination) passes.
            cross_type NOT IN ('selfing_s1', 'selfing_sn', 'feminized_cross', 'feminized_bx')
            AND NOT EXISTS (
              SELECT 1 FROM public.pheno_reversals r
              WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
            )
          )
          OR (
            cross_type IN ('selfing_s1', 'selfing_sn') AND EXISTS (
              SELECT 1 FROM public.pheno_reversals r
              WHERE r.keeper_id = female_keeper_id AND r.user_id = auth.uid()
            )
          )
          OR (
            cross_type IN ('feminized_cross', 'feminized_bx')
            AND male_keeper_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.pheno_reversals r
              WHERE r.keeper_id = male_keeper_id AND r.user_id = auth.uid()
            )
          )
      END
    )
  );

CREATE INDEX pheno_crosses_recurrent_parent_idx
  ON public.pheno_crosses (recurrent_parent_id);
