-- Relax alerts_acknowledged_at_status_check so an alert can transition
-- acknowledged -> resolved/dismissed while preserving the historical
-- acknowledged_at timestamp.
--
-- Previous rule (too strict):
--   acknowledged_at IS NULL OR status = 'acknowledged'
--
-- New rule:
--   status = 'open'                       -> acknowledged_at IS NULL
--   status = 'acknowledged'               -> acknowledged_at IS NOT NULL
--   status IN ('resolved','dismissed')    -> acknowledged_at may be NULL
--                                            or a preserved historical value
ALTER TABLE public.alerts
  DROP CONSTRAINT IF EXISTS alerts_acknowledged_at_status_check;

ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_acknowledged_at_status_check
  CHECK (
    (status = 'open'         AND acknowledged_at IS NULL)
    OR (status = 'acknowledged' AND acknowledged_at IS NOT NULL)
    OR status IN ('resolved', 'dismissed')
  );