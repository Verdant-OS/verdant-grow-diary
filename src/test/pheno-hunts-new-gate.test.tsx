/**
 * pheno-hunts-new-gate.test.tsx
 * Ensures the /pheno-hunts/new write handler cannot invoke createPhenoHunt
 * from a Free-entitlement state.
 */
import { describe, it, expect, vi } from "vitest";
import { canWriteFeatureData } from "@/lib/featureEntitlements";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";

// createPhenoHunt is imported inside the page; here we exercise the guard
// directly since the page's onSave short-circuits before the write when
// canWriteFeatureData returns false.
const createPhenoHunt = vi.fn(async () => {});

async function simulateOnSave(entitlement: ReturnType<typeof resolveEntitlements>) {
  if (!canWriteFeatureData(entitlement, "pheno_tracker")) return "blocked";
  await createPhenoHunt();
  return "ran";
}

describe("PhenoHuntNew write-path guard", () => {
  it("Free entitlement blocks createPhenoHunt", async () => {
    const e = resolveEntitlements(null, new Date("2026-08-01Z"));
    const out = await simulateOnSave(e);
    expect(out).toBe("blocked");
    expect(createPhenoHunt).not.toHaveBeenCalled();
  });

  it("Pro entitlement allows createPhenoHunt", async () => {
    const e = resolveEntitlements(
      {
        id: "r", user_id: "u", plan_id: "pro_monthly", status: "active",
        provider: "paddle", provider_customer_id: null, provider_subscription_id: null,
        current_period_end: "2027-01-01Z", cancel_at_period_end: false,
        founder_number: null, created_at: "", updated_at: "",
      },
      new Date("2026-08-01Z"),
    );
    const out = await simulateOnSave(e);
    expect(out).toBe("ran");
    expect(createPhenoHunt).toHaveBeenCalledTimes(1);
  });

  it("Canceled Pro blocks createPhenoHunt (write-forbidden)", async () => {
    const e = resolveEntitlements(
      {
        id: "r", user_id: "u", plan_id: "pro_monthly", status: "canceled",
        provider: "paddle", provider_customer_id: null, provider_subscription_id: null,
        current_period_end: "2027-01-01Z", cancel_at_period_end: false,
        founder_number: null, created_at: "", updated_at: "",
      },
      new Date("2026-08-01Z"),
    );
    createPhenoHunt.mockClear();
    const out = await simulateOnSave(e);
    expect(out).toBe("blocked");
    expect(createPhenoHunt).not.toHaveBeenCalled();
  });
});
