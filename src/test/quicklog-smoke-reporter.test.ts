import { describe, it, expect } from "vitest";
import { SmokeChecklistReporter } from "../../e2e/lib/smokeChecklistReporter";

describe("SmokeChecklistReporter", () => {
  it("records pass/fail/skip and totals", async () => {
    const r = new SmokeChecklistReporter();
    await r.run(1, "first", async () => "ok");
    r.skip(2, "second", "not applicable");
    await expect(
      r.run(3, "third", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow(/Smoke step 3 failed/);
    const j = r.toJSON();
    expect(j).toMatchObject({ total: 3, passed: 1, failed: 1, skipped: 1 });
    expect(r.firstFailure()?.step).toBe(3);
    expect(r.toText()).toContain("✓ [1] first");
    expect(r.toText()).toContain("✗ [3] third");
    expect(r.toText()).toContain("· [2] second");
  });
});
