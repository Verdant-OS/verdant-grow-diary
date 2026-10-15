-- QA #1989: stop storing an unassessed plant as healthy.
--
-- plants.health has defaulted to 'healthy' since 20260516204601. Guided setup
-- omits the column, so that default was written as if the grower had assessed
-- the plant. 20260924120000 (unedited) later sets the default to 'unknown' and
-- deliberately does not rewrite existing rows. This migration drops the
-- default entirely, on either side of that change, and allows NULL so an
-- omitted health is stored as no assessment.
--
-- Existing rows are not updated. A stored 'healthy' stays 'healthy'.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.plants ALTER COLUMN health DROP NOT NULL;
ALTER TABLE public.plants ALTER COLUMN health DROP DEFAULT;

COMMENT ON COLUMN public.plants.health IS
  'Grower-assessed plant health: healthy | watch | issue. NULL means not assessed. There is no default. Never derived from sensors or AI.';

COMMIT;
