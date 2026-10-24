import { describe, expect, it, vi } from "vitest";
import { CriticalReadDeadlineError } from "@/lib/boundedReadRules";
import {
  GROW_READ_BUDGET_MS,
  classifyGrowReadFailure,
  isRetryableGrowReadFailure,
  readWithGrowRetry,
} from "@/lib/growsReadRetryRules";

describe("grows read retry budget and non-retryable codes", () => {
  it("fails fast on permission, missing-table, and client errors", async () => {
    for (const code of ["42501", "42P01", "PGRST116", "403", "PGRST301"]) {
      const failure = classifyGrowReadFailure({ code, message: "grower@example.com" });
      expect(isRetryableGrowReadFailure(failure)).toBe(false);
      const read = vi.fn(async () => ({ ok: false as const, failure }));
      const sleep = vi.fn(async (_ms: number) => {});
      const outcome = await readWithGrowRetry(read, sleep, [10, 20]);
      expect(outcome.ok).toBe(false);
      expect(read).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it("does not treat a code TypeError as a network failure", () => {
    const failure = classifyGrowReadFailure(new TypeError("rows.map is not a function"));
    expect(failure).toEqual({ kind: "db", code: "type_error" });
    expect(isRetryableGrowReadFailure(failure)).toBe(false);
    expect(
      isRetryableGrowReadFailure(
        classifyGrowReadFailure(new TypeError("Failed to fetch https://secret.example")),
      ),
    ).toBe(true);
  });

  it("stops retrying once the budget is spent", async () => {
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const read = vi.fn(async () => {
      clock += 4_000;
      return {
        ok: false as const,
        failure: classifyGrowReadFailure(new CriticalReadDeadlineError()),
      };
    });

    const outcome = await readWithGrowRetry(read, {
      sleep,
      delays: [200, 400],
      budgetMs: GROW_READ_BUDGET_MS,
      now: () => clock,
    });

    expect(outcome).toMatchObject({
      ok: false,
      failure: { kind: "timeout", code: "critical_read_deadline" },
    });
    expect(clock).toBeLessThanOrEqual(GROW_READ_BUDGET_MS + 4_000);
    expect(read.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
