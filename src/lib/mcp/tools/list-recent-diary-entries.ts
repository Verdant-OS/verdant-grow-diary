/**
 * list_recent_diary_entries — read-only recent diary entries for a grow.
 *
 * RLS-scoped through the caller's OAuth token. Returns only presenter-
 * safe fields; never exposes raw_payload or secrets.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "./_supabase";

export default defineTool({
  name: "list_recent_diary_entries",
  title: "List recent diary entries",
  description:
    "List recent diary entries for one of the signed-in grower's grows. " +
    "Read-only.",
  inputSchema: {
    growId: z.string().uuid().describe("Grow id to fetch diary entries for."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum entries to return (1–50). Defaults to 10."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ growId, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("diary_entries")
      .select("id,grow_id,plant_id,tent_id,event_type,note,created_at")
      .eq("grow_id", growId)
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
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
              ? "No diary entries found for that grow."
              : `Found ${rows.length} entry(ies):\n${JSON.stringify(rows, null, 2)}`,
        },
      ],
      structuredContent: { entries: rows },
    };
  },
});
