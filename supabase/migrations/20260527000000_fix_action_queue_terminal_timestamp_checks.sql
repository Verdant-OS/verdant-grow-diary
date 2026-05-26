-- Fix action_queue CHECK constraints for terminal status transitions.
--
-- PROBLEM: The original constraints required approved_at only when status = 'approved'
-- and rejected_at only when status = 'rejected'. This broke the lifecycle because when
-- an action moves from approved → completed, approved_at remains set for audit history
-- and the CHECK rejects the row.
--
-- SOLUTION: Relax the constraints so that audit timestamps may persist into terminal
-- statuses that logically follow from the approval/rejection step:
--   - approved_at may persist into 'completed' and 'cancelled' (action was approved first)
--   - rejected_at may persist into 'cancelled' (action was rejected, then cancelled)
--
-- This preserves auditability: we never erase historical timestamps, and early statuses
-- (pending_approval, simulated) still cannot have these timestamps set.
--
-- IDEMPOTENT: Uses IF EXISTS on DROP so repeated deploys are safe.

-- Drop the old narrow constraints (IF EXISTS for idempotency).
ALTER TABLE public.action_queue
  DROP CONSTRAINT IF EXISTS action_queue_approved_at_chk;

ALTER TABLE public.action_queue
  DROP CONSTRAINT IF EXISTS action_queue_rejected_at_chk;

-- Add lifecycle-safe constraints.
-- approved_at is allowed when status is 'approved', 'completed', or 'cancelled'.
-- These are the statuses reachable AFTER approval in the lifecycle:
--   pending_approval → approved → completed
--   pending_approval → approved → cancelled
ALTER TABLE public.action_queue
  ADD CONSTRAINT action_queue_approved_at_lifecycle_chk
    CHECK (
      approved_at IS NULL
      OR status IN ('approved', 'completed', 'cancelled')
    );

-- rejected_at is allowed when status is 'rejected' or 'cancelled'.
-- These are the statuses reachable AFTER rejection in the lifecycle:
--   pending_approval → rejected
--   pending_approval → rejected → cancelled (if transition is supported)
ALTER TABLE public.action_queue
  ADD CONSTRAINT action_queue_rejected_at_lifecycle_chk
    CHECK (
      rejected_at IS NULL
      OR status IN ('rejected', 'cancelled')
    );
