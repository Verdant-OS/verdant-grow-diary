import { v } from "convex/values";

import type { RateLimitResult } from "./components/abuse_guard/check";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const WINDOW_MS = 60_000;
const MAX = 5;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashSubjectKey(subjectKey: string, pepper: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${pepper}:${subjectKey}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export const consumeForSubject = internalMutation({
  args: { subjectKey: v.string(), nowMs: v.number() },
  returns: v.union(
    v.object({ status: v.literal("allow"), remaining: v.number() }),
    v.object({
      status: v.literal("deny"),
      remaining: v.number(),
      retryAfterMs: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<RateLimitResult> => {
    const pepper = process.env.CONVEX_SANDBOX_PEPPER;
    if (!pepper) throw new Error("CONVEX_SANDBOX_PEPPER is not configured");
    if (!args.subjectKey) throw new Error("subjectKey must not be empty");
    if (!Number.isSafeInteger(args.nowMs) || args.nowMs < 0) {
      throw new Error("nowMs must be a non-negative safe integer");
    }

    return (await ctx.runMutation(components.abuse_guard.check.consume, {
      keyHash: await hashSubjectKey(args.subjectKey, pepper),
      nowMs: args.nowMs,
      windowMs: WINDOW_MS,
      max: MAX,
    })) as RateLimitResult;
  },
});
