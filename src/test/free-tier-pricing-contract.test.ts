import { describe, expect, it } from "vitest";
import { PLAN_COMPARISON } from "@/config/pricing";

describe("Free tier pricing contract", () => {
  it("advertises the enforced grow and tent limits without inventing a plant limit", () => {
    const limits = PLAN_COMPARISON.find((row) => row.label === "Grow & tent limits");

    expect(limits?.values.free).toBe("1 active grow · 1 active tent");
    expect(limits?.values.pro_monthly).toBe("Unlimited grows · Multi-tent");
    expect(JSON.stringify(PLAN_COMPARISON)).not.toMatch(/1 plant/i);
  });
});
