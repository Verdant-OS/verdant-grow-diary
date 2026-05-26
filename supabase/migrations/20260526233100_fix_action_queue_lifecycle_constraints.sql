-- Fix action_queue lifecycle constraints: idempotent drop + re-add.
--
-- 1. Drop the old narrow constraint names (from the original CREATE TABLE).
ALTER TABLE public.action_queue DROP CONSTRAINT IF EXISTS action_queue_approved_at_chk;
ALTER TABLE public.action_queue DROP CONSTRAINT IF EXISTS action_queue_rejected_at_chk;

-- 2. Drop the new lifecycle constraint names (idempotency: safe to re-run).
ALTER TABLE public.action_queue DROP CONSTRAINT IF EXISTS action_queue_approved_at_lifecycle_chk;
ALTER TABLE public.action_queue DROP CONSTRAINT IF EXISTS action_queue_rejected_at_lifecycle_chk;

-- 3. Add the lifecycle-aware constraints.
ALTER TABLE public.action_queue
  ADD CONSTRAINT action_queue_approved_at_lifecycle_chk
    CHECK (approved_at IS NULL OR status IN ('approved', 'completed', 'cancelled'));

ALTER TABLE public.action_queue
  ADD CONSTRAINT action_queue_rejected_at_lifecycle_chk
    CHECK (rejected_at IS NULL OR status IN ('rejected', 'cancelled'));
