/**
 * save-founder-prefs — JWT-verified writer for a founder's own wall prefs.
 *
 * SAFETY:
 *  - Requires a verified caller JWT (auth.getUser).
 *  - Server re-validates via zod-equivalent parse (mirrors DB CHECKs on
 *    public.founders). Bad input never reaches the DB write.
 *  - Only updates the caller's own row (WHERE user_id = auth.uid()) and
 *    only the four pref columns; the founders_guard_immutables_trg trigger
 *    additionally locks founder_number / user_id at the DB.
 *  - Refunded rows may not edit — status is filtered here and re-checked
 *    by RLS.
 *  - Returns { ok: true } only; never leaks other founder rows.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { validatePrefs } from './validate.ts';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'auth_required' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(503, { error: 'unavailable' });

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) return json(401, { error: 'auth_required' });
    const uid = userData.user.id;

    let bodyJson: unknown;
    try {
      bodyJson = await req.json();
    } catch {
      return json(400, { error: 'invalid_json' });
    }

    const parsed = validate(bodyJson);
    if (!parsed.ok) return json(400, { error: parsed.error });

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: updated, error: updateError } = await admin
      .from('founders')
      .update({
        display_name: parsed.value.display_name,
        display_style: parsed.value.display_style,
        show_on_wall: parsed.value.show_on_wall,
        optional_link: parsed.value.optional_link,
      })
      .eq('user_id', uid)
      .eq('status', 'confirmed')
      .select('founder_number')
      .maybeSingle();

    if (updateError) return json(400, { error: 'update_failed' });
    if (!updated) return json(404, { error: 'no_founder_row' });

    return json(200, { ok: true });
  } catch {
    return json(500, { error: 'internal_error' });
  }
});
