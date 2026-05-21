-- Extend lead_events event_type CHECK to support manual interaction logging.
ALTER TABLE public.lead_events
  DROP CONSTRAINT IF EXISTS lead_events_event_type_check;

ALTER TABLE public.lead_events
  ADD CONSTRAINT lead_events_event_type_check
  CHECK (event_type IN (
    'status_change',
    'note_added',
    'call_logged',
    'email_logged',
    'voicemail_logged',
    'meeting_logged',
    'follow_up_changed',
    -- legacy values kept for backward compatibility with prior rows:
    'note',
    'contacted',
    'follow_up_set'
  ));