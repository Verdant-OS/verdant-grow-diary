import { describe, expect, it } from "vitest";
import {
  ALERT_CONTEXT_REFRESH_MAX_RETRIES,
  alertContextRefreshRetryDelayMs,
} from "@/lib/alertContextRefreshRules";

describe("alertContextRefreshRetryDelayMs", () => {
  it("backs off 2 s, 4 s, 8 s for the first three failures", () => {
    expect(ALERT_CONTEXT_REFRESH_MAX_RETRIES).toBe(3);
    expect([1, 2, 3].map(alertContextRefreshRetryDelayMs)).toEqual([2_000, 4_000, 8_000]);
  });

  it("stops retrying once the budget is spent", () => {
    expect(alertContextRefreshRetryDelayMs(4)).toBeNull();
    expect(alertContextRefreshRetryDelayMs(100)).toBeNull();
  });

  it("never schedules a retry for a non-positive or non-integer count", () => {
    for (const n of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(alertContextRefreshRetryDelayMs(n)).toBeNull();
    }
  });

  it("is deterministic", () => {
    expect(alertContextRefreshRetryDelayMs(2)).toBe(alertContextRefreshRetryDelayMs(2));
  });
});
