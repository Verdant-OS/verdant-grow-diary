import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

// Compatibility for previously sent links only; new emails use hosted preferences.
export const legacyUnsubscribe = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ token: z.string().regex(/^[a-f0-9]{64}$/i), confirm: z.boolean() }).strict().parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const { data: record, error } = await db.from('email_unsubscribe_tokens').select('email, used_at').eq('token', data.token).maybeSingle();
    if (error || !record) return { valid: false };
    if (record.used_at) return { valid: false, reason: 'already_unsubscribed' };
    if (!data.confirm) return { valid: true };
    const { setEmailUnsubscribe } = await import('@lovable.dev/email-js');
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) throw new Error('Email preferences unavailable');
    await setEmailUnsubscribe({ recipient: record.email, domain: 'notify.verdantgrowdiary.com', subscribed: false }, { apiKey, sendUrl: process.env['LOVABLE_SEND_URL'] });
    const { error: updateError } = await db.from('email_unsubscribe_tokens').update({ used_at: new Date().toISOString() }).eq('token', data.token).is('used_at', null);
    if (updateError) throw new Error('Email preferences unavailable');
    return { success: true };
  });
