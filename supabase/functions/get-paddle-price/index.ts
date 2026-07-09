import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { gatewayFetch, type PaddleEnv } from '../_shared/paddle.ts';

/**
 * Resolve a human-readable price ID (external_id) to its Paddle internal
 * price ID. Read-only. No DB writes. Safe.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const priceId = typeof body?.priceId === 'string' ? body.priceId : '';
    const environment: PaddleEnv =
      body?.environment === 'live' ? 'live' : 'sandbox';

    if (!priceId || !/^[a-z0-9_]{1,64}$/.test(priceId)) {
      return new Response(
        JSON.stringify({ error: 'priceId is required (snake_case)' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const response = await gatewayFetch(
      environment,
      `/prices?external_id=${encodeURIComponent(priceId)}`,
    );
    const data = await response.json();
    const paddleId = data?.data?.[0]?.id;

    if (!paddleId) {
      return new Response(
        JSON.stringify({ error: `Price not found: ${priceId}` }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(JSON.stringify({ paddleId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
