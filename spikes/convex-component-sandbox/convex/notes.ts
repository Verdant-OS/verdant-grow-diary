import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

export const insertSynthetic = internalMutation({
  args: { body: v.string(), createdAt: v.number() },
  returns: v.id("grower_notes"),
  handler: async (ctx, args) => await ctx.db.insert("grower_notes", args),
});

export const readSynthetic = internalQuery({
  args: {},
  returns: v.array(v.object({ body: v.string(), createdAt: v.number() })),
  handler: async (ctx) =>
    (await ctx.db.query("grower_notes").collect())
      .map(({ body, createdAt }) => ({ body, createdAt }))
      .sort((left, right) => left.createdAt - right.createdAt),
});
