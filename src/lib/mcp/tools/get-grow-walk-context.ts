/**
 * get_grow_walk_context — bounded evidence for one owned tent or plant.
 *
 * RLS-scoped through the caller's OAuth token. Returns source-labeled sensor
 * truth, metadata-only photo records, read-only alert/AI/Action Queue summaries,
 * deterministic reason codes, and explicit partial-lane receipts.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { getGrowWalkContextForOwnedTarget } from "../../growWalkContextReadModels";
import { supabaseForUser, unauthenticated } from "./_supabase";

export default defineTool({
  name: "get_grow_walk_context",
  title: "Get Grow Walk context",
  description:
    "Fetch bounded, source-labeled evidence for one tent or plant the signed-in grower owns. " +
    "Photo rows are metadata only, sensor evidence keeps source/quality/freshness labels, " +
    "and partial lanes are named explicitly. Archived targets are labeled as historical. The result supports physical inspection and " +
    "does not diagnose, approve actions, or control equipment. Read-only.",
  inputSchema: {
    targetType: z.enum(["tent", "plant"]).describe("Whether the owned target is a tent or plant."),
    targetId: z.string().uuid().describe("Owned tent or plant id to review."),
    lookbackHours: z
      .number()
      .int()
      .min(24)
      .max(168)
      .optional()
      .describe("Bounded history window in hours (24–168). Defaults to 72."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ targetType, targetId, lookbackHours }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const result = await getGrowWalkContextForOwnedTarget(supabaseForUser(ctx), {
      targetType,
      targetId,
      lookbackHours,
    });
    if (!result.ok) {
      return {
        content: [
          {
            type: "text",
            text: result.reason === "unavailable" ? `Error: ${result.message}` : result.message,
          },
        ],
        isError: true,
      };
    }

    const { context } = result.data;
    const scope = context.scope.plantName ?? context.scope.tentName ?? context.scope.growName;
    const partial = context.receipt.partialLanes.length;
    const archived = context.scope.targetArchived ? "historical " : "";
    return {
      content: [
        {
          type: "text",
          text:
            partial === 0
              ? `Grow Walk context ready for ${archived}"${scope}".`
              : `Grow Walk context ready for ${archived}"${scope}" with ${partial} explicit partial evidence lane(s).`,
        },
      ],
      structuredContent: { context },
    };
  },
});
