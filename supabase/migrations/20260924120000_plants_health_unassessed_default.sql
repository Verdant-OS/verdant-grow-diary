-- New plants start as "not assessed", not "healthy".
--
-- QA 2026-09-24, BUG-009: every new plant was stored with health = 'healthy'
-- (the column default since 20260516204601) and the plant pages said "Plant
-- health: healthy" for a plant with zero logs — a health claim made without
-- evidence. The create forms also preselected Healthy.
--
-- This migration is additive:
--   1. validate_plant_row() also accepts 'unknown' (= not assessed). The body
--      is restated from its only definition, 20260516204601, with that one
--      value added; the stage check is unchanged.
--   2. plants.health defaults to 'unknown'. The column stays NOT NULL, so every
--      reader that treats health as a string (generated types, the ai-coach
--      prompt, MCP status) keeps working.
--
-- Deliberately NOT done: rewriting existing 'healthy' rows. The database cannot
-- tell a grower's explicit "Healthy" from the old default, so a backfill would
-- erase real assessments. Growers can change any plant's health in Edit Plant.
--
-- Compatibility: inserts never write 'unknown'. When health was not assessed
-- they omit the column, so the column default applies — 'healthy' before this
-- migration is applied, 'unknown' after. The only client write of 'unknown'
-- is a grower explicitly clearing an assessment in Edit Plant ("Not assessed
-- yet"). Before this migration is applied the trigger rejects that update as a
-- whole (nothing is saved) and the client explains it; after, it succeeds.
-- The client is therefore safe on both sides of the operator's apply.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_plant_row()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stage NOT IN ('seedling','veg','flower','flush','harvest','cure') THEN
    RAISE EXCEPTION 'invalid plant stage: %', NEW.stage;
  END IF;
  IF NEW.health NOT IN ('healthy','watch','issue','unknown') THEN
    RAISE EXCEPTION 'invalid plant health: %', NEW.health;
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE public.plants ALTER COLUMN health SET DEFAULT 'unknown';

COMMENT ON COLUMN public.plants.health IS
  'Grower-assessed plant health: healthy | watch | issue, or unknown (not assessed; the default). Never derived from sensors or AI.';

COMMIT;
