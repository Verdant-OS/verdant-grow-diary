import { describe, expect, it } from "vitest";
import { CRITICAL_READ_DEADLINE_MS } from "@/lib/boundedReadRules";
import { GROW_READ_BUDGET_MS, growReadAttemptDeadlineMs } from "@/lib/growsReadRetryRules";

describe("grow read attempt deadline", () => {
  it("gives the first attempt the full 8s page deadline inside a 12s budget", () => {
    expect(GROW_READ_BUDGET_MS).toBeGreaterThanOrEqual(CRITICAL_READ_DEADLINE_MS);
    expect(growReadAttemptDeadlineMs(0, GROW_READ_BUDGET_MS)).toBe(CRITICAL_READ_DEADLINE_MS);
    expect(CRITICAL_READ_DEADLINE_MS).toBe(8_000);
  });

  it("gives a retry only the budget that remains", () => {
    expect(growReadAttemptDeadlineMs(1, 3_800)).toBe(3_800);
    expect(growReadAttemptDeadlineMs(2, 0)).toBe(0);
  });
});
