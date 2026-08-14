import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  grower_notes: defineTable({
    body: v.string(),
    createdAt: v.number(),
  }),
});
