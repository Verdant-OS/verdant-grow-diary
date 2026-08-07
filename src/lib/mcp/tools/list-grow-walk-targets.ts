/**
 * list_grow_walk_targets — read-only scouting targets for an owned grow.
 *
 * RLS-scoped through the caller's OAuth token. This boundary performs input
 * validation and response shaping only; ownership and evidence aggregation
 * live in the owner-scoped read model.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { listGrowWalkTargetsForOwnedGrow } from "../../growWalkTargetReadModels";
import { supabaseForUser, unauthenticated } from "./_supabase";

export default defineTool({
  name: "list_grow_walk_targets",
  title: "List Grow Walk targets",
  description:
    "List the signed-in Verdant grower's own tents and plants within one owned grow, " +
    "ordered by deterministic physical-inspection priority. Results preserve missing " +
    "evidence and source limits; priority is scouting guidance, not a diagnosis. Read-only.",
  inputSchema: {
    growId: z.string().uuid().describe("Owned grow id whose tents and plants should be listed."),
    includeInactivePlants: z
      .boolean()
      .optional()
      .describe("Include archived or inactive plant records. Defaults to false."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum targets to return (1–100). Defaults to 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ growId, includeInactivePlants, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const result = await listGrowWalkTargetsForOwnedGrow(supabaseForUser(ctx), growId, {
      includeInactivePlants,
      limit,
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

    const { grow, targets, generatedAt } = result.data;
    return {
      content: [
        {
          type: "text",
          text:
            targets.length === 0
              ? `No Grow Walk targets found in "${grow.name}".`
              : `Found ${targets.length} Grow Walk target(s) in "${grow.name}", ordered for physical inspection.`,
        },
      ],
      structuredContent: { grow, targets, generatedAt },
    };
  },
});
