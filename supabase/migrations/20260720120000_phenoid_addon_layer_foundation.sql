-- PhenoID add-on layer foundation (Phase 2a of the PhenoID → Verdant integration).
--
-- PhenoID (a native Meta Ray-Ban pheno-hunt app) is being folded into Verdant as
-- the HIGHEST paid tier, on top of "Pheno Hunt Premium". Its ranking/composite
-- data — which Verdant's core pheno_* tables deliberately do NOT model (no
-- weighting, no cross-candidate ranking, by design) — lives here in a namespaced,
-- separately-gated add-on layer. Nothing from PhenoID is dropped; core pheno
-- doctrine is left untouched. An ingested capture DUAL-WRITES: shared per-axis
-- evidence into core pheno_* (gated by has_pheno_tracker_entitlement) and the
-- ranking/extras into these tables (gated by has_phenoid_entitlement).
--
-- Two tables:
--   phenoid_candidate_extras  1:1 with a core candidate (a plants row), carries
--                             the 0-100 composite winner_score, raw 0-10 axes,
--                             crew, cut-room status, pack run, capture provenance.
--   phenoid_fights            append-only A-vs-B "fight night" history.
--
-- Privacy mirrors core pheno: owner-only RLS (auth.uid() = user_id) on read AND
-- write, hunt/plant consistency enforced on insert/update, no anon grant, no
-- cross-owner visibility. Reads survive a tier lapse (history is never hidden as
-- a billing punishment); only writes require the entitlement.
--
-- NOTE: delivered as a file for review + per-PR Supabase preview validation.
-- It is intentionally NOT applied to the live project by this change.
--
-- SKU TODO (blocked on product sign-off — see plan §5.3): the top-tier plan_ids
-- below are PLACEHOLDERS. When the real SKU is set, (1) update the plan_id list
-- in has_phenoid_entitlement, and (2) ADD those same plan_ids to
-- has_pheno_tracker_entitlement so the top tier remains a SUPERSET of Pheno Hunt
-- Premium — otherwise the ingest's core pheno_* writes would be RLS-denied.

-- ---------------------------------------------------------------------------
-- Top-tier entitlement check (superset of Pheno Hunt Premium).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_phenoid_entitlement(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- PLACEHOLDER top-tier plan_ids — confirm before applying live.
  SELECT
    EXISTS (
      SELECT 1 FROM public.billing_subscriptions bs
      WHERE bs.user_id = _user_id
        AND bs.plan_id IN ('phenoid_monthly','phenoid_annual')
        AND (
          (bs.status IN ('active','trialing')
             AND (bs.current_period_end IS NULL OR bs.current_period_end > now()))
          OR (bs.status = 'canceled'
             AND bs.current_period_end IS NOT NULL
             AND bs.current_period_end > now())
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.environment = 'live'
        AND s.plan_id IN ('phenoid_monthly','phenoid_annual')
        AND (
          (s.status IN ('active','trialing')
             AND (s.current_period_end IS NULL OR s.current_period_end > now()))
          OR (s.status = 'canceled'
             AND s.current_period_end IS NOT NULL
             AND s.current_period_end > now())
        )
    );
$$;

REVOKE ALL ON FUNCTION public.has_phenoid_entitlement(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.has_phenoid_entitlement(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_phenoid_entitlement(uuid) IS
  'Server-side highest-tier (PhenoID add-on) entitlement check. Returns true iff the user holds an active/trialing top-tier subscription (BYO or Lovable Paddle live), or a canceled one still within its paid period. Used by RESTRICTIVE RLS on phenoid_* tables. Plan_ids are placeholders pending SKU sign-off; keep it a superset of has_pheno_tracker_entitlement.';

-- ---------------------------------------------------------------------------
-- 1. phenoid_candidate_extras (1:1 with a core candidate plant).
-- ---------------------------------------------------------------------------
CREATE TABLE public.phenoid_candidate_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  -- Stable per-capture id from PhenoID; the durable dedupe / re-import join.
  phenoid_uuid text NOT NULL,
  -- 0-100 weighted composite (nose 30 / resin 25 / structure 15 / yield 15 /
  -- breeding 15), verbatim from PhenoID. Core Verdant never reads/ranks this.
  winner_score integer CHECK (winner_score IS NULL OR winner_score BETWEEN 0 AND 100),
  -- Raw 0-10 Loud axes, preserved verbatim (core stores rescaled copies).
  nose_score integer      CHECK (nose_score      IS NULL OR nose_score      BETWEEN 0 AND 10),
  resin_score integer     CHECK (resin_score     IS NULL OR resin_score     BETWEEN 0 AND 10),
  structure_score integer CHECK (structure_score IS NULL OR structure_score BETWEEN 0 AND 10),
  yield_score integer     CHECK (yield_score     IS NULL OR yield_score     BETWEEN 0 AND 10),
  breeding_score integer  CHECK (breeding_score  IS NULL OR breeding_score  BETWEEN 0 AND 10),
  rating smallint CHECK (rating IS NULL OR rating BETWEEN 0 AND 5),
  scored_by text NOT NULL DEFAULT '',
  cut_status text NOT NULL DEFAULT 'none'
    CHECK (cut_status IN ('none','vault','flowering','retired')),
  loud_shortlist boolean NOT NULL DEFAULT false,
  pack_label text NOT NULL DEFAULT '',
  pack_index integer NOT NULL DEFAULT 0,
  pack_size integer NOT NULL DEFAULT 0,
  capture_mode text NOT NULL DEFAULT 'standard',
  stack_id text NOT NULL DEFAULT '',
  frame_index integer NOT NULL DEFAULT 0,
  model_id text NOT NULL DEFAULT '',
  model_version text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'phenoid',
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phenoid_uuid),
  UNIQUE (hunt_id, plant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.phenoid_candidate_extras TO authenticated;
GRANT ALL ON public.phenoid_candidate_extras TO service_role;

ALTER TABLE public.phenoid_candidate_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phenoid_candidate_extras_select_own"
  ON public.phenoid_candidate_extras FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "phenoid_candidate_extras_insert_own"
  ON public.phenoid_candidate_extras FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_hunts h
      WHERE h.id = hunt_id AND h.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = plant_id
        AND p.user_id = auth.uid()
        AND p.pheno_hunt_id = hunt_id
    )
  );

CREATE POLICY "phenoid_candidate_extras_update_own"
  ON public.phenoid_candidate_extras FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_hunts h
      WHERE h.id = hunt_id AND h.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = plant_id
        AND p.user_id = auth.uid()
        AND p.pheno_hunt_id = hunt_id
    )
  );

CREATE POLICY "phenoid_candidate_extras_delete_own"
  ON public.phenoid_candidate_extras FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- RESTRICTIVE: writes additionally require the highest tier. ANDs with the
-- owner policies above. Reads (SELECT) intentionally excluded — lapsed-tier
-- users keep their history.
CREATE POLICY "phenoid_candidate_extras_tier_required_insert"
  ON public.phenoid_candidate_extras AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_phenoid_entitlement(auth.uid()));

CREATE POLICY "phenoid_candidate_extras_tier_required_update"
  ON public.phenoid_candidate_extras AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_phenoid_entitlement(auth.uid()))
  WITH CHECK (public.has_phenoid_entitlement(auth.uid()));

CREATE POLICY "phenoid_candidate_extras_tier_required_delete"
  ON public.phenoid_candidate_extras AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_phenoid_entitlement(auth.uid()));

CREATE INDEX phenoid_candidate_extras_user_id_idx ON public.phenoid_candidate_extras (user_id);
CREATE INDEX phenoid_candidate_extras_hunt_id_idx ON public.phenoid_candidate_extras (hunt_id);
CREATE INDEX phenoid_candidate_extras_plant_id_idx ON public.phenoid_candidate_extras (plant_id);

CREATE TRIGGER phenoid_candidate_extras_set_updated_at
  BEFORE UPDATE ON public.phenoid_candidate_extras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. phenoid_fights (append-only A-vs-B "fight night" history).
-- ---------------------------------------------------------------------------
CREATE TABLE public.phenoid_fights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hunt_id uuid NOT NULL REFERENCES public.pheno_hunts(id) ON DELETE CASCADE,
  fight_uuid text NOT NULL,
  plant_a_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  plant_b_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  winner text NOT NULL CHECK (winner IN ('a','b','draw')),
  basis text NOT NULL DEFAULT 'nose_first',
  crew text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  fought_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phenoid_fights_distinct_candidates CHECK (plant_a_id <> plant_b_id),
  UNIQUE (user_id, fight_uuid)
);

-- Append-only: SELECT + INSERT only (no UPDATE/DELETE grant or policy).
GRANT SELECT, INSERT ON public.phenoid_fights TO authenticated;
GRANT ALL ON public.phenoid_fights TO service_role;

ALTER TABLE public.phenoid_fights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phenoid_fights_select_own"
  ON public.phenoid_fights FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "phenoid_fights_insert_own"
  ON public.phenoid_fights FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pheno_hunts h
      WHERE h.id = hunt_id AND h.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = plant_a_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id
    )
    AND EXISTS (
      SELECT 1 FROM public.plants p
      WHERE p.id = plant_b_id AND p.user_id = auth.uid() AND p.pheno_hunt_id = hunt_id
    )
  );

-- RESTRICTIVE: inserting a fight requires the highest tier (append-only, so no
-- update/delete policy). Reads unrestricted for owners.
CREATE POLICY "phenoid_fights_tier_required_insert"
  ON public.phenoid_fights AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_phenoid_entitlement(auth.uid()));

CREATE INDEX phenoid_fights_user_id_idx ON public.phenoid_fights (user_id);
CREATE INDEX phenoid_fights_hunt_id_idx ON public.phenoid_fights (hunt_id);
CREATE INDEX phenoid_fights_plant_a_idx ON public.phenoid_fights (plant_a_id);
CREATE INDEX phenoid_fights_plant_b_idx ON public.phenoid_fights (plant_b_id);
