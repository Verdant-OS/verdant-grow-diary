import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'

type Reason = 'bounce' | 'complaint' | 'unsubscribe'

const STATUS: Record<Reason, 'bounced' | 'complained' | 'suppressed'> = {
  bounce: 'bounced',
  complaint: 'complained',
  unsubscribe: 'suppressed',
}

const MESSAGE: Record<Reason, string> = {
  bounce: 'Permanent bounce — email address is invalid or rejected',
  complaint: 'Spam complaint — recipient marked email as spam',
  unsubscribe: 'Recipient unsubscribed',
}

// Notification-only record keeping in the kept email tables. Lovable enforces
// suppression at send time; these rows never gate a send.
async function recordOutcome(
  reason: Reason,
  recipient: string,
  messageId: string | null,
  eventId: string,
): Promise<void> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const email = recipient.trim().toLowerCase()

  const { error: suppressError } = await supabaseAdmin
    .from('suppressed_emails')
    .upsert({ email, reason, metadata: null }, { onConflict: 'email' })
  if (suppressError) {
    console.error('Email event suppression write failed', {
      code: suppressError.code,
      message: suppressError.message,
      event_id: eventId,
    })
    throw new Error('suppression write failed')
  }

  const { error: logError } = await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: 'system',
    recipient_email: email,
    status: STATUS[reason],
    error_message: MESSAGE[reason],
    metadata: null,
  })
  if (logError) {
    console.error('Email event log write failed', {
      code: logError.code,
      message: logError.message,
      event_id: eventId,
    })
    throw new Error('send log write failed')
  }
}

export const Route = createFileRoute("/lovable/email/events")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY']
        if (!apiKey) {
          console.error('Missing required environment variables')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }
        const handler = createEmailWebhookHandler({
          apiKey,
          on: {
            'email.bounced': async (event) => {
              await recordOutcome('bounce', event.data.recipient, event.data.message_id ?? null, event.event_id)
            },
            'email.complaint': async (event) => {
              await recordOutcome('complaint', event.data.recipient, event.data.message_id ?? null, event.event_id)
            },
            'email.unsubscribed': async (event) => {
              await recordOutcome('unsubscribe', event.data.recipient, event.data.message_id ?? null, event.event_id)
            },
          },
        })
        return handler(request)
      },
    },
  },
})
