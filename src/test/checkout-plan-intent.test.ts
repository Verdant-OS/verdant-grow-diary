/**
 * Slice C — checkoutPlanIntent pure module.
 *
 * Covers: allowlist, one-shot consume, freshness cap, corrupt/malformed
 * records, tampered plans, storage-unavailable graceful no-op, clear/peek.
 */
import { describe, it, expect } from "vitest";
import {
  CHECKOUT_PLAN_INTENT_STORAGE_KEY,
  DEFAULT_PLAN_INTENT_MAX_AGE_MS,
  buildCheckoutPlanReturnPath,
  clearPlanIntent,
  consumePlanIntent,
  isKnownPlanIntent,
  peekPlanIntent,
  savePlanIntent,
  type PlanIntentStorage,
} from "@/lib/checkoutPlanIntent";

describe("buildCheckoutPlanReturnPath", () => {
  it("carries the allowlisted plan into the verification return URL", () => {
    expect(
      buildCheckoutPlanReturnPath({
        pathname: "/pricing",
        search: "?utm_source=pricing_page&utm_medium=owned&utm_campaign=paid_launch",
        plan: "pro_annual",
      }),
    ).toBe(
      "/pricing?utm_source=pricing_page&utm_medium=owned&utm_campaign=paid_launch&plan=pro_annual",
    );
  });

  it("preserves a safe feature return path while replacing an older plan", () => {
    expect(
      buildCheckoutPlanReturnPath({
        pathname: "/pricing",
        search: "?plan=pro_monthly&returnTo=%2Fpheno-hunts%2Fnew",
        plan: "founder_lifetime",
      }),
    ).toBe("/pricing?plan=founder_lifetime&returnTo=%2Fpheno-hunts%2Fnew");
  });

  it("drops unknown plans and fails hostile paths closed to Pricing", () => {
    expect(
      buildCheckoutPlanReturnPath({
        pathname: "https://evil.example",
        search: "?plan=founder_lifetime",
        plan: "operator_override",
      }),
    ).toBe("/pricing");
  });

  it("is deterministic", () => {
    const input = { pathname: "/pricing", search: "", plan: "pro_monthly" } as const;
    expect(buildCheckoutPlanReturnPath(input)).toBe(buildCheckoutPlanReturnPath(input));
  });
});

function makeStorage(seed: Record<string, string> = {}): PlanIntentStorage & {
  dump: () => Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    dump: () => Object.fromEntries(map),
  };
}

describe("isKnownPlanIntent", () => {
  it.each(["pro_monthly", "pro_annual", "founder_lifetime"] as const)("accepts %s", (id) =>
    expect(isKnownPlanIntent(id)).toBe(true),
  );
  it.each([
    "",
    "PRO_MONTHLY",
    "pro",
    "free",
    "pro_lifetime",
    null,
    undefined,
    42,
    {},
    ["pro_monthly"],
  ])("rejects %p", (v) => expect(isKnownPlanIntent(v)).toBe(false));
});

describe("savePlanIntent", () => {
  it("persists a known plan with savedAt", () => {
    const storage = makeStorage();
    const ok = savePlanIntent("pro_annual", { storage, now: 1000 });
    expect(ok).toBe(true);
    const raw = storage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY)!;
    expect(JSON.parse(raw)).toEqual({ plan: "pro_annual", savedAt: 1000 });
  });

  it("silently rejects unknown plan ids", () => {
    const storage = makeStorage();
    expect(savePlanIntent("evil_plan", { storage })).toBe(false);
    expect(storage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY)).toBeNull();
  });

  it("returns false when storage is unavailable", () => {
    expect(savePlanIntent("pro_monthly", { storage: null })).toBe(false);
  });

  it("returns false when storage.setItem throws (quota / privacy mode)", () => {
    const storage: PlanIntentStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {},
    };
    expect(savePlanIntent("pro_monthly", { storage })).toBe(false);
  });
});

describe("consumePlanIntent — one-shot semantics", () => {
  it("returns the saved plan then null on the second call", () => {
    const storage = makeStorage();
    savePlanIntent("pro_monthly", { storage, now: 5000 });
    expect(consumePlanIntent({ storage, now: 5500 })).toBe("pro_monthly");
    expect(consumePlanIntent({ storage, now: 5500 })).toBeNull();
  });

  it("removes the record even when the payload is corrupt", () => {
    const storage = makeStorage({
      [CHECKOUT_PLAN_INTENT_STORAGE_KEY]: "not-json",
    });
    expect(consumePlanIntent({ storage })).toBeNull();
    expect(storage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY)).toBeNull();
  });

  it("rejects tampered plan ids and still clears storage", () => {
    const storage = makeStorage({
      [CHECKOUT_PLAN_INTENT_STORAGE_KEY]: JSON.stringify({
        plan: "founder_lifetime_free",
        savedAt: 1,
      }),
    });
    expect(consumePlanIntent({ storage, now: 2 })).toBeNull();
    expect(storage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY)).toBeNull();
  });

  it("rejects records without a numeric savedAt", () => {
    const storage = makeStorage({
      [CHECKOUT_PLAN_INTENT_STORAGE_KEY]: JSON.stringify({
        plan: "pro_monthly",
        savedAt: "yesterday",
      }),
    });
    expect(consumePlanIntent({ storage })).toBeNull();
  });

  it("rejects records older than maxAgeMs (default 15min)", () => {
    const storage = makeStorage();
    savePlanIntent("pro_annual", { storage, now: 0 });
    expect(
      consumePlanIntent({
        storage,
        now: DEFAULT_PLAN_INTENT_MAX_AGE_MS + 1,
      }),
    ).toBeNull();
  });

  it("honors a custom maxAgeMs window", () => {
    const storage = makeStorage();
    savePlanIntent("pro_monthly", { storage, now: 0 });
    expect(consumePlanIntent({ storage, now: 100, maxAgeMs: 50 })).toBeNull();
  });

  it("rejects records with a future timestamp (clock skew)", () => {
    const storage = makeStorage({
      [CHECKOUT_PLAN_INTENT_STORAGE_KEY]: JSON.stringify({
        plan: "pro_monthly",
        savedAt: 10_000,
      }),
    });
    expect(consumePlanIntent({ storage, now: 5000 })).toBeNull();
  });

  it("returns null when storage is unavailable", () => {
    expect(consumePlanIntent({ storage: null })).toBeNull();
  });

  it("returns null when storage.getItem throws", () => {
    const storage: PlanIntentStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(consumePlanIntent({ storage })).toBeNull();
  });
});

describe("peekPlanIntent / clearPlanIntent", () => {
  it("peek does not delete the record", () => {
    const storage = makeStorage();
    savePlanIntent("founder_lifetime", { storage, now: 1 });
    expect(peekPlanIntent({ storage })).toBe("founder_lifetime");
    expect(peekPlanIntent({ storage })).toBe("founder_lifetime");
  });

  it("peek returns null for tampered plans", () => {
    const storage = makeStorage({
      [CHECKOUT_PLAN_INTENT_STORAGE_KEY]: JSON.stringify({
        plan: "hacker",
        savedAt: 1,
      }),
    });
    expect(peekPlanIntent({ storage })).toBeNull();
  });

  it("clearPlanIntent removes any stored record", () => {
    const storage = makeStorage();
    savePlanIntent("pro_monthly", { storage, now: 1 });
    clearPlanIntent({ storage });
    expect(storage.getItem(CHECKOUT_PLAN_INTENT_STORAGE_KEY)).toBeNull();
  });
});
