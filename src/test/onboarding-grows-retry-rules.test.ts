import { describe, expect, it, vi } from "vitest";
import { retryOnboardingGrowsRead } from "@/lib/onboardingGrowsRetryRules";

describe("retryOnboardingGrowsRead", () => {
  it("refreshes through the provider when it exposes refresh", () => {
    const refresh = vi.fn();
    const reload = vi.fn();
    expect(retryOnboardingGrowsRead(refresh, reload)).toBe("refresh");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([undefined, null])("reloads instead of doing nothing when refresh is %s", (refresh) => {
    const reload = vi.fn();
    expect(retryOnboardingGrowsRead(refresh, reload)).toBe("reload");
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
