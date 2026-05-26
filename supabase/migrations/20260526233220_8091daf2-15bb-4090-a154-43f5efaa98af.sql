-- Broaden action_queue timestamp-vs-status invariants for the full lifecycle.
--
-- Prior narrow constraints blocked approved → completed/cancelled transitions
-- because approved_at remained set after status changed to completed/cancelled.
-- Same for rejected_at on cancelled rows. Replace with lifecycle-aware checks.
--
-- Idempotent: drop both the old narrow names AND the new lifecycle names
-- before re-adding, so re-running the migration is safe.

ALTER TABLE public.action_queue
  DROP CONSTRAINT IF EXISTS action_queue_approved_at_chk;
ALTER TABLE public.action_queue
  DROP CONSTRAINT IF EXISTS action_queue_rejected_at_chk;

ALTER TABLE public.action_queue
  DROP CONSTRAINT IF EXISTS action_queue_approved_at_lifecycle_chk;
ALTER TABLE public.action_queue
  DROP CONSTRAINT IF EXISTS action_queue_rejected_at_lifecycle_chk;

ALTER TABLE public.action_queue
  ADD CONSTRAINT action_queue_approved_at_lifecycle_chk
  CHECK (approved_at IS NULL OR status IN ('approved', 'completed', 'cancelled'));

ALTER TABLE public.action_queue
  ADD CONSTRAINT action_queue_rejected_at_lifecycle_chk
  CHECK (rejected_at IS NULL OR status IN ('rejected', 'cancelled'));
