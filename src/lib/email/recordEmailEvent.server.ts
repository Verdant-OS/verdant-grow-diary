import type { EmailWebhookEvent } from '@lovable.dev/email-js';
import { emailEventOutcomes } from './emailEventRules';

export async function recordEmailEvent(event: EmailWebhookEvent<keyof typeof emailEventOutcomes>) {
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const outcome = emailEventOutcomes[event.type];
  const email = event.data.recipient.toLowerCase();
  const { error: suppressionError } = await db.from('suppressed_emails').upsert({
    email, reason: outcome.reason, metadata: null,
  }, { onConflict: 'email' });
  if (suppressionError) throw new Error('Failed to record email outcome');
  // Stable event UUID uses the existing primary key for race-safe deduplication.
  const { error } = await db.from('email_send_log').upsert({
    id: event.event_id, message_id: event.data.message_id || null,
    template_name: 'system', recipient_email: email, status: outcome.status,
    error_message: outcome.message, metadata: null,
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error('Failed to record email event');
}
