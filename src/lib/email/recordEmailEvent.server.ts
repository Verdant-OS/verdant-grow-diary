import type { EmailWebhookEvent } from '@lovable.dev/email-js';
import { emailEventOutcomes } from './emailEventRules';

export async function recordEmailEvent(event: EmailWebhookEvent<keyof typeof emailEventOutcomes>) {
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const outcome = emailEventOutcomes[event.type];
  const email = event.data.recipient.toLowerCase();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`email-event:${event.event_id}`)));
  digest[6] = (digest[6] & 15) | 80;
  digest[8] = (digest[8] & 63) | 128;
  const hex = Array.from(digest.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
  const auditId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const { error: suppressionError } = await db.from('suppressed_emails').upsert({
    email, reason: outcome.reason, metadata: null,
  }, { onConflict: 'email' });
  if (suppressionError) throw new Error('Failed to record email outcome');
  // Hash opaque event identities into the existing UUID primary key for race-safe deduplication.
  const { error } = await db.from('email_send_log').upsert({
    id: auditId, message_id: event.data.message_id || null,
    template_name: 'system', recipient_email: email, status: outcome.status,
    error_message: outcome.message, metadata: null,
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error('Failed to record email event');
}
