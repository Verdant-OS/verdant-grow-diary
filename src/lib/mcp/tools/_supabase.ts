/**
 * Per-request Supabase client factory for MCP tool handlers.
 *
 * Forwards the caller's verified OAuth access token so every query runs
 * under Row-Level Security as the signed-in user. Never uses the service
 * role. Reads env lazily inside the factory (never at module top level)
 * so the MCP entry stays import-safe during the manifest-extract eval
 * and Edge Function cold start.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "../../../integrations/supabase/types";

export type McpUserScopedSupabaseClient = SupabaseClient<Database>;

export function supabaseForUser(ctx: ToolContext): McpUserScopedSupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase env not configured for MCP tool");
  }
  return createClient<Database>(url, anon, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function unauthenticated() {
  return {
    content: [{ type: "text" as const, text: "Not authenticated." }],
    isError: true,
  };
}
