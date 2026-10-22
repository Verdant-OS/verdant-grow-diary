-- QA #1989: stop storing an unassessed plant as healthy.
--
-- plants.health has defaulted to 'healthy' since 20260516204601. Guided setup
-- omits the column, so that default was written as if the grower had assessed
-- the plant. 20260924120000 (unedited) later sets the default to 'unknown',
-- keeps the column NOT NULL, and teaches validate_plant_row() to accept
-- 'unknown'. It deliberately does not rewrite existing rows.
--
-- Deliver 20260924120000 first. This migration then drops the default and
-- allows NULL so an omitted health is stored as no assessment. The reverse
-- order is not supported: the current delivery tool still requires health to
-- be NOT NULL, and the legacy trigger would still reject explicit 'unknown'.
--
-- Existing rows are not updated. A stored 'healthy' stays 'healthy'.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Refuse unless 20260924120000 is already delivered.
DO $plants_health_prior_delivery$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute AS health_column
    JOIN pg_class AS plants ON plants.oid = health_column.attrelid
    JOIN pg_namespace AS plants_ns ON plants_ns.oid = plants.relnamespace
    JOIN pg_attrdef AS health_default
      ON health_default.adrelid = health_column.attrelid
     AND health_default.adnum = health_column.attnum
    WHERE plants_ns.nspname = 'public'
      AND plants.relname = 'plants'
      AND health_column.attname = 'health'
      AND NOT health_column.attisdropped
      AND health_column.attnotnull
      AND pg_get_expr(health_default.adbin, health_default.adrelid) = '''unknown''::text'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc AS validate_fn
    JOIN pg_namespace AS fn_ns ON fn_ns.oid = validate_fn.pronamespace
    WHERE fn_ns.nspname = 'public'
      AND validate_fn.proname = 'validate_plant_row'
      AND validate_fn.pronargs = 0
      AND validate_fn.prosrc LIKE '%''unknown''%'
  ) THEN
    RAISE EXCEPTION
      'plants_health_drop_healthy_default requires 20260924120000 to be delivered first'
      USING ERRCODE = 'check_violation';
  END IF;
END
$plants_health_prior_delivery$;

ALTER TABLE public.plants ALTER COLUMN health DROP NOT NULL;
ALTER TABLE public.plants ALTER COLUMN health DROP DEFAULT;

COMMENT ON COLUMN public.plants.health IS
  'Grower-assessed plant health: healthy | watch | issue. Not assessed is stored as NULL or as the explicit value unknown, which Create and Edit Plant write and existing rows keep. There is no default. Never derived from sensors or AI.';

COMMIT;
