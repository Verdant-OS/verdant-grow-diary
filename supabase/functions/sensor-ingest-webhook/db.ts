// Database client factory for sensor-ingest-webhook.
// Encapsulates Supabase client creation (including the privileged admin client
// used only for bridge-token lookup and scoped writes). Kept separate from
// index.ts so that the safety-surface tests can verify the main handler source
// is free of direct service-key references.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface IngestClients {
  /** Admin client (service-key) — null when env var is missing. */
  admin: SupabaseClient | null;
  /** Anon client scoped to the caller's JWT. */
  anonForJwt: SupabaseClient;
}

/**
 * Build the Supabase clients needed by the ingest handler.
 *
 * Reads SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY from env.
 * Returns null when required env vars are missing.
 */
export function createIngestClients(bearerToken: string): IngestClients | null {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anonKey) return null;

  const admin = svcKey ? createClient(url, svcKey) : null;
  const anonForJwt = createClient(url, anonKey, {
    global: { headers: { Authorization: "Bearer " + bearerToken } },
  });

  return { admin, anonForJwt };
}
