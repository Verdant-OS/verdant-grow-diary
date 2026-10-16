import { describe, expect, it } from "vitest";
import { isDashboardSupplementalLoading } from "@/lib/dashboardSupplementalLoadingRules";

describe("isDashboardSupplementalLoading", () => {
  it("treats only the loading status as in-flight supplemental work", () => {
    expect(isDashboardSupplementalLoading("loading")).toBe(true);
    expect(isDashboardSupplementalLoading("idle")).toBe(false);
    expect(isDashboardSupplementalLoading("unavailable")).toBe(false);
    expect(isDashboardSupplementalLoading("ok")).toBe(false);
  });

  it("narrows the type guard to loading", () => {
    const status: "idle" | "loading" | "unavailable" | "ok" = "loading";
    if (isDashboardSupplementalLoading(status)) {
      const narrowed: "loading" = status;
      expect(narrowed).toBe("loading");
    }
  });
});
