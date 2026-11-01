import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/lovable/email/transactional/send')({
  server: { handlers: { POST: async ({ request }) => {
    const bearer = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!bearer) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin.auth.getUser(bearer);
    if (error || !data.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // Registered operational templates are internal-only: a signed-in user is not an email sender.
    const { data: operator, error: roleError } = await supabaseAdmin.rpc('has_role', { _user_id: data.user.id, _role: 'operator' });
    if (roleError || !operator) return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { sendRegisteredAppEmail } = await import('@/lib/email/sendRegisteredAppEmail.server');
    return sendRegisteredAppEmail(request);
  } } },
});
