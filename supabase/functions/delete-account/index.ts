/**
 * delete-account — self-serve account deletion.
 *
 * Contract:
 *   - Requires a verified caller JWT (auth.getUser).
 *   - Requires POST body { confirm: "DELETE" } — a client-side typed
 *     confirmation prevents accidental fetches from destroying an account.
 *   - Uses service_role ONLY after the JWT check: revokes all sessions,
 *     then calls auth.admin.deleteUser(uid). Owned rows cascade via the
 *     existing `on delete cascade` foreign keys on public.* tables.
 *   - Never accepts a target user_id from the body — the caller can only
 *     delete themselves.
 *   - Returns { ok: true } on success; never echoes the deleted uid.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

    let body: { confirm?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'bad_request' });
    }
    if (body?.confirm !== 'DELETE') return json(400, { error: 'confirmation_required' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(503, { error: 'unavailable' });
    }

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) return json(401, { error: 'auth_required' });
    const uid = userData.user.id;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Revoke all refresh tokens first, then delete the auth user. Owned
    // rows in public.* cascade via existing FKs on auth.users(id).
    try {
      await admin.auth.admin.signOut(uid, 'global');
    } catch (e) {
      // Best-effort — proceed to delete even if sign-out reports a
      // transient error; deleteUser is the authoritative revoke.
      console.warn('delete-account signOut warn', String(e));
    }
    const { error: delError } = await admin.auth.admin.deleteUser(uid);
    if (delError) {
      console.error('delete-account deleteUser failed', delError.message);
      return json(500, { error: 'delete_failed' });
    }
    return json(200, { ok: true });
  } catch (e) {
    console.error('delete-account error', String(e));
    return json(503, { error: 'unavailable' });
  }
});
