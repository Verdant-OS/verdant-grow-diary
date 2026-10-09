/**
 * #593 — Timeline's bounded reads (limit 100 / 50) ordered by a timestamp
 * alone. Rows sharing that timestamp at the page boundary could swap in and
 * out of the page between refreshes. Every bounded read now adds `id` as a
 * deterministic tie-breaker.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { orderNewestFirstStable } from "@/lib/timelineQueryOrderRules";

function recorder() {
  const calls: Array<[string, unknown]> = [];
  const query = {
    order(column: string, options: unknown) {
      calls.push([column, options]);
      return query;
    },
  };
  return { query, calls };
}

describe("orderNewestFirstStable", () => {
  it("orders newest first by the given column, then by id as a tie-breaker", () => {
    const { query, calls } = recorder();
    const returned = orderNewestFirstStable(query, "entry_at");
    expect(returned).toBe(query);
    expect(calls).toEqual([
      ["entry_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
  });

  it("is deterministic across repeated calls", () => {
    const a = recorder();
    const b = recorder();
    orderNewestFirstStable(a.query, "occurred_at");
    orderNewestFirstStable(b.query, "occurred_at");
    expect(a.calls).toEqual(b.calls);
  });
});

describe("Timeline bounded reads", () => {
  // @source-scan-justified: proves a forbidden construct (a bare
  // timestamp-only order on a bounded Timeline read) is absent; the mounted
  // Timeline harness discards order() calls, so it cannot observe this.
  const src = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");

  it("never orders a bounded read by a timestamp alone", () => {
    expect(src).not.toMatch(/\.order\("(entry_at|occurred_at|created_at)"/);
  });

  it("routes each bounded diary / grow-event / audit read through the stable helper", () => {
    expect(src.match(/orderNewestFirstStable\(/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });
});
