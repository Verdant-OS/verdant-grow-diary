import { describe, expect, it } from "vitest";

import type { RateLimitResult } from "../convex/components/abuse_guard/check";
import { createHarness, HASH_A, mountedComponents } from "./harness";

const WINDOW_MS = 60_000;
const MAX = 5;

function consume(t: ReturnType<typeof createHarness>, nowMs: number) {
  return t.mutation(mountedComponents.abuse_guard.check.consume, {
    keyHash: HASH_A,
    nowMs,
    windowMs: WINDOW_MS,
    max: MAX,
  }) as Promise<RateLimitResult>;
}

describe("abuse_guard orchestration", () => {
  it("P1 allows five consumes and denies the sixth without incrementing", async () => {
    const t = createHarness();
    const results: RateLimitResult[] = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      results.push(await consume(t, 1_000));
    }

    expect(results).toEqual([
      { status: "allow", remaining: 4 },
      { status: "allow", remaining: 3 },
      { status: "allow", remaining: 2 },
      { status: "allow", remaining: 1 },
      { status: "allow", remaining: 0 },
      { status: "deny", remaining: 0, retryAfterMs: 59_000 },
    ]);
    await expect(
      t.query(mountedComponents.abuse_guard.check.snapshot, {
        keyHash: HASH_A,
        nowMs: 1_000,
        windowMs: WINDOW_MS,
      }),
    ).resolves.toEqual({ count: 5 });
  });

  it("P2 starts a new count exactly at the window boundary", async () => {
    const t = createHarness();

    await expect(consume(t, 59_999)).resolves.toEqual({ status: "allow", remaining: 4 });
    await expect(consume(t, 60_000)).resolves.toEqual({ status: "allow", remaining: 4 });
    await expect(
      t.query(mountedComponents.abuse_guard.check.snapshot, {
        keyHash: HASH_A,
        nowMs: 60_000,
        windowMs: WINDOW_MS,
      }),
    ).resolves.toEqual({ count: 1 });
  });

  it.each([
    ["empty key", { keyHash: "", nowMs: 1_000, windowMs: WINDOW_MS, max: MAX }],
    ["max below one", { keyHash: HASH_A, nowMs: 1_000, windowMs: WINDOW_MS, max: 0 }],
    ["window below one", { keyHash: HASH_A, nowMs: 1_000, windowMs: 0, max: MAX }],
  ])("P3 rejects %s without writing a bucket", async (_label, args) => {
    const t = createHarness();

    await expect(t.mutation(mountedComponents.abuse_guard.check.consume, args)).rejects.toThrow();
    await expect(
      t.query(mountedComponents.abuse_guard.isolationProbe.countAllBuckets, {}),
    ).resolves.toBe(0);
  });

  it("P3 rejects a null key without writing a bucket", async () => {
    const t = createHarness();

    await expect(
      t.mutation(mountedComponents.abuse_guard.check.consume, {
        keyHash: null,
        nowMs: 1_000,
        windowMs: WINDOW_MS,
        max: MAX,
      } as never),
    ).rejects.toThrow();
    await expect(
      t.query(mountedComponents.abuse_guard.isolationProbe.countAllBuckets, {}),
    ).resolves.toBe(0);
  });

  it("P4 returns the same check decision for identical state and arguments", async () => {
    const t = createHarness();
    const args = { keyHash: HASH_A, nowMs: 12_345, windowMs: WINDOW_MS, max: MAX };

    const first = await t.query(mountedComponents.abuse_guard.check.check, args);
    const second = await t.query(mountedComponents.abuse_guard.check.check, args);

    expect(first).toEqual({ status: "allow", remaining: 5 });
    expect(second).toEqual(first);
  });
});
