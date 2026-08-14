import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rate_limit_buckets: defineTable({
    keyHash: v.string(),
    windowStartMs: v.number(),
    count: v.number(),
  }).index("by_key_and_window", ["keyHash", "windowStartMs"]),
});
