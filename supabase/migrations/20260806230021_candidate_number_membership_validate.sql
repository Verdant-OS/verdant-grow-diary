-- =============================================================================
-- Validate plants_candidate_number_requires_hunt_chk
--
-- Second half of the split introduced by 20260806230020. That migration added
-- the constraint NOT VALID; this one validates it against existing rows.
--
-- Why two files: Postgres holds locks until the transaction commits, and the
-- Supabase CLI runs each migration file in ONE transaction. Validating in the
-- same file as the ADD would therefore run the full plants scan while ADD
-- CONSTRAINT's ACCESS EXCLUSIVE lock was still held, blocking every read and
-- write to a core table for the duration. Separating them lets that lock be
-- released at the previous migration's commit; VALIDATE CONSTRAINT then takes
-- only SHARE UPDATE EXCLUSIVE, which permits concurrent reads and writes.
--
-- The NOT VALID constraint has already been enforcing every new INSERT/UPDATE
-- since the previous migration, so if this validation ever fails the database is
-- still protected going forward — only pre-existing rows would need clearing
-- (see the orphan-cleanup command in 20260806230020's pre-check).
-- =============================================================================

ALTER TABLE public.plants
  VALIDATE CONSTRAINT plants_candidate_number_requires_hunt_chk;
