import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8?bundle";
import { handleOperatorGgsRealPayloadCommit } from "./handler.ts";
import {
  buildOperatorGgsRealPayloadCommitDeps,
  type OperatorGgsAdminClient,
  type OperatorGgsAuthedClient,
} from "./productionDeps.ts";

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return handleOperatorGgsRealPayloadCommit(req, {
      getVerifiedUserId: async () => ({ ok: true, value: null }),
      hasOperatorRole: async () => ({ ok: true, value: false }),
      loadTentAuthority: async () => ({ ok: true, value: null }),
      loadBridgeTokenContext: async () => ({ ok: true, value: null }),
      commitBatch: async () => ({ ok: false, reason: "commit_failed" }),
    });
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  }) as unknown as OperatorGgsAuthedClient;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  }) as unknown as OperatorGgsAdminClient;

  return handleOperatorGgsRealPayloadCommit(
    req,
    buildOperatorGgsRealPayloadCommitDeps(authed, admin),
  );
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
