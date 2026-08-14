import { v } from "convex/values";

import type { DataModel } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";

type AssertNever<Value extends never> = Value;
export type P5ParentTableExcluded = AssertNever<Extract<keyof DataModel, "grower_notes">>;

export const attemptParentTableRead = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    // @ts-expect-error P5: a component data model must exclude parent tables.
    return await ctx.db.query("grower_notes").first();
  },
});

export const countAllBuckets = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => (await ctx.db.query("rate_limit_buckets").collect()).length,
});

export const getFirstBucketId = internalQuery({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => (await ctx.db.query("rate_limit_buckets").first())?._id ?? null,
});

export const listBuckets = internalQuery({
  args: {},
  returns: v.array(v.object({ keyHash: v.string(), windowStartMs: v.number(), count: v.number() })),
  handler: async (ctx) =>
    (await ctx.db.query("rate_limit_buckets").collect())
      .map(({ keyHash, windowStartMs, count }) => ({ keyHash, windowStartMs, count }))
      .sort(
        (left, right) =>
          left.keyHash.localeCompare(right.keyHash) || left.windowStartMs - right.windowStartMs,
      ),
});
