/**
 * list_recent_diary_entries — read-only recent diary entries for a grow.
 *
 * RLS-scoped through the caller's OAuth token. Returns only presenter-
 * safe fields; never exposes raw_payload, details, or secrets.
 *
 * Guards with an ownership check on the grow before reading entries:
 * diary_entries carries an operator-wide SELECT policy ("Operators view
 * all entries"), so RLS alone would let an operator-role caller read any
 * grower's entries through this tool. grows has no operator policy, so
 * requiring the grow to be visible to the caller keeps every account —
 * operators included — inside this server's "own data only" contract.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "./_supabase";

export default defineTool({
  name: "list_recent_diary_entries",
  title: "List recent diary entries",
  description:
    "List recent diary entries for one of the signed-in grower's own " +
    "grows. The grow must belong to the caller. Read-only.",
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
    const { data: grow, error: growError } = await supabase
      .from("grows")
      .select("id")
      .eq("id", growId)
      .maybeSingle();
    if (growError) {
      return {
        content: [{ type: "text", text: `Error: ${growError.message}` }],
        isError: true,
      };
    }
    if (!grow) {
      return {
        content: [{ type: "text", text: "Grow not found for the signed-in grower." }],
        isError: true,
      };
    }
    const { data, error } = await supabase
      .from("diary_entries")
      .select("id,grow_id,plant_id,tent_id,stage,note,entry_at,created_at")
      .eq("grow_id", growId)
      .order("entry_at", { ascending: false })
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
