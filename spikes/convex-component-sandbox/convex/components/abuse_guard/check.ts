import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

const rateLimitArgs = {
  keyHash: v.string(),
  nowMs: v.number(),
  windowMs: v.number(),
  max: v.number(),
};

const rateLimitResult = v.union(
  v.object({ status: v.literal("allow"), remaining: v.number() }),
  v.object({
    status: v.literal("deny"),
    remaining: v.number(),
    retryAfterMs: v.number(),
  }),
);

export type RateLimitResult =
  | { status: "allow"; remaining: number }
  | { status: "deny"; remaining: number; retryAfterMs: number };

type RateLimitArgs = {
  keyHash: string;
  nowMs: number;
  windowMs: number;
  max: number;
};

function assertSafeInteger(name: string, value: number, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be a safe integer greater than or equal to ${minimum}`);
  }
}

function validateArgs(args: RateLimitArgs): void {
  if (!/^[0-9a-f]{64}$/.test(args.keyHash)) {
    throw new Error("keyHash must be a lowercase SHA-256 digest");
  }
  assertSafeInteger("nowMs", args.nowMs, 0);
  assertSafeInteger("windowMs", args.windowMs, 1);
  assertSafeInteger("max", args.max, 1);
}

function windowStartFor(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs;
}

function retryAfterFor(nowMs: number, windowMs: number, windowStartMs: number): number {
  return windowMs - (nowMs - windowStartMs);
}

async function readCount(ctx: QueryCtx, keyHash: string, windowStartMs: number) {
  return await ctx.db
    .query("rate_limit_buckets")
    .withIndex("by_key_and_window", (q) =>
      q.eq("keyHash", keyHash).eq("windowStartMs", windowStartMs),
    )
    .unique();
}

export const check = query({
  args: rateLimitArgs,
  returns: rateLimitResult,
  handler: async (ctx, args): Promise<RateLimitResult> => {
    validateArgs(args);
    const windowStartMs = windowStartFor(args.nowMs, args.windowMs);
    const bucket = await readCount(ctx, args.keyHash, windowStartMs);
    const count = bucket?.count ?? 0;

    if (count >= args.max) {
      return {
        status: "deny",
        remaining: 0,
        retryAfterMs: retryAfterFor(args.nowMs, args.windowMs, windowStartMs),
      };
    }
    return { status: "allow", remaining: args.max - count };
  },
});

export const consume = mutation({
  args: rateLimitArgs,
  returns: rateLimitResult,
  handler: async (ctx, args): Promise<RateLimitResult> => {
    validateArgs(args);
    const windowStartMs = windowStartFor(args.nowMs, args.windowMs);
    const bucket = await ctx.db
      .query("rate_limit_buckets")
      .withIndex("by_key_and_window", (q) =>
        q.eq("keyHash", args.keyHash).eq("windowStartMs", windowStartMs),
      )
      .unique();
    const count = bucket?.count ?? 0;

    if (count >= args.max) {
      return {
        status: "deny",
        remaining: 0,
        retryAfterMs: retryAfterFor(args.nowMs, args.windowMs, windowStartMs),
      };
    }

    const nextCount = count + 1;
    if (bucket) {
      await ctx.db.patch(bucket._id, { count: nextCount });
    } else {
      await ctx.db.insert("rate_limit_buckets", {
        keyHash: args.keyHash,
        windowStartMs,
        count: nextCount,
      });
    }
    return { status: "allow", remaining: args.max - nextCount };
  },
});

export const snapshot = query({
  args: {
    keyHash: v.string(),
    nowMs: v.number(),
    windowMs: v.number(),
  },
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args): Promise<{ count: number }> => {
    validateArgs({ ...args, max: 1 });
    const bucket = await readCount(ctx, args.keyHash, windowStartFor(args.nowMs, args.windowMs));
    return { count: bucket?.count ?? 0 };
  },
});
