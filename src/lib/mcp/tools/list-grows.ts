/**
 * list_grows — read-only enumeration of the signed-in grower's grows.
 *
 * RLS-scoped through the caller's OAuth token. No writes, no AI calls,
 * no device control. Safe for cautious agent use.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "./_supabase";

export default defineTool({
  name: "list_grows",
  title: "List grows",
  description:
    "List the signed-in Verdant grower's own grows (id, name, stage, " +
    "grow_type, archived flag, timestamps). Read-only.",
  inputSchema: {
    includeArchived: z
      .boolean()
      .optional()
      .describe("Include archived grows. Defaults to false."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum rows to return (1–100). Defaults to 25."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ includeArchived, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("grows")
      .select("id,name,stage,grow_type,is_archived,started_at,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 25);
    if (!includeArchived) query = query.eq("is_archived", false);
    const { data, error } = await query;
    if (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
    const rows = data ?? [];
    return {
      content: [
        {
          type: "text",
          text:
            rows.length === 0
              ? "No grows found."
              : `Found ${rows.length} grow(s):\n${JSON.stringify(rows, null, 2)}`,
        },
      ],
      structuredContent: { grows: rows },
    };
  },
});
