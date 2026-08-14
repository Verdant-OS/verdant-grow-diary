import { expect, test } from "vitest";

import type { RateLimitResult } from "../convex/components/abuse_guard/check";
import { createHarness, HASH_B, mountedComponents } from "./harness";

test("P9 worker repeats the six-attempt sequence", async () => {
  const t = createHarness();
  const results: RateLimitResult[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    results.push(
      (await t.mutation(mountedComponents.abuse_guard.check.consume, {
        keyHash: HASH_B,
        nowMs: 1_000,
        windowMs: 60_000,
        max: 5,
      })) as RateLimitResult,
    );
  }
  const remaining = results.map((result) => result.remaining);
  expect(remaining).toEqual([4, 3, 2, 1, 0, 0]);
  console.log(`P9_RESULT=${JSON.stringify(remaining)}`);
});
