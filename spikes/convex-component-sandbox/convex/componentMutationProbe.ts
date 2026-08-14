import { v } from "convex/values";

import type { Id as ComponentId } from "./components/abuse_guard/_generated/dataModel";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

type AssertNever<Value extends never> = Value;
export type P6ComponentTableExcluded = AssertNever<Extract<keyof DataModel, "rate_limit_buckets">>;

export const attemptDirectComponentPatch = internalMutation({
  args: { componentBucketId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const componentBucketId = args.componentBucketId as ComponentId<"rate_limit_buckets">;
    // @ts-expect-error P6: a parent data model must exclude component identifiers.
    await ctx.db.patch(componentBucketId, { count: 999 });
    return null;
  },
});
