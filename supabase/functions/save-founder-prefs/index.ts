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

type DisplayStyle = 'custom_name' | 'first_initial' | 'number_only' | 'hidden';

interface PrefsBody {
  display_name: string | null;
  display_style: DisplayStyle;
  show_on_wall: boolean;
  optional_link: string | null;
}

const DISPLAY_STYLES: readonly DisplayStyle[] = [
  'custom_name',
  'first_initial',
  'number_only',
  'hidden',
];

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F-\u009F]/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isSafeHttpsUrl(value: string): boolean {
  if (value.length === 0 || /\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
}

function validate(raw: unknown): { ok: true; value: PrefsBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid_body' };
  const r = raw as Record<string, unknown>;

  const style = r.display_style;
  if (typeof style !== 'string' || !DISPLAY_STYLES.includes(style as DisplayStyle)) {
    return { ok: false, error: 'invalid_display_style' };
  }

  if (typeof r.show_on_wall !== 'boolean') {
    return { ok: false, error: 'invalid_show_on_wall' };
  }

  let displayName: string | null;
  if (r.display_name === null || r.display_name === undefined) {
    displayName = null;
  } else if (typeof r.display_name === 'string') {
    if (r.display_name.length > 60) return { ok: false, error: 'display_name_too_long' };
    if (CONTROL_CHAR_REGEX.test(r.display_name)) {
      return { ok: false, error: 'display_name_control_chars' };
    }
    displayName = r.display_name;
  } else {
    return { ok: false, error: 'invalid_display_name' };
  }

  let optionalLink: string | null;
  if (r.optional_link === null || r.optional_link === undefined || r.optional_link === '') {
    optionalLink = null;
  } else if (typeof r.optional_link === 'string') {
    if (r.optional_link.length > 300) return { ok: false, error: 'optional_link_too_long' };
    if (!isSafeHttpsUrl(r.optional_link)) return { ok: false, error: 'optional_link_not_https' };
    optionalLink = r.optional_link;
  } else {
    return { ok: false, error: 'invalid_optional_link' };
  }

  return {
    ok: true,
    value: {
      display_name: displayName,
      display_style: style as DisplayStyle,
      show_on_wall: r.show_on_wall,
      optional_link: optionalLink,
    },
  };
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
