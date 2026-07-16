// checkoutContextRules — same-device checkout-context marker + view resolver.
// The marker is presentation-only evidence: it never grants entitlements.
import { describe, it, expect } from "vitest";
import {
  CHECKOUT_CONTEXT_MAX_AGE_MS,
  CHECKOUT_STARTED_STORAGE_KEY,
  clearCheckoutStarted,
  hasFreshCheckoutContext,
  markCheckoutStarted,
  readCheckoutStartedAt,
  resolveCheckoutSuccessView,
} from "@/lib/checkoutContextRules";

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("checkout-started marker", () => {
  it("round-trips a timestamp", () => {
    const storage = memoryStorage();
    markCheckoutStarted(1_000_000, storage);
    expect(readCheckoutStartedAt(storage)).toBe(1_000_000);
    clearCheckoutStarted(storage);
    expect(readCheckoutStartedAt(storage)).toBeNull();
  });

  it("rejects corrupt or non-positive stored values", () => {
    const storage = memoryStorage();
    storage.setItem(CHECKOUT_STARTED_STORAGE_KEY, "not-a-number");
    expect(readCheckoutStartedAt(storage)).toBeNull();
    storage.setItem(CHECKOUT_STARTED_STORAGE_KEY, "-5");
    expect(readCheckoutStartedAt(storage)).toBeNull();
  });

  it("is fresh within the window, stale outside it, never fresh from the future", () => {
    const storage = memoryStorage();
    const started = 10_000_000;
    markCheckoutStarted(started, storage);
    expect(hasFreshCheckoutContext(started + 5_000, storage)).toBe(true);
    expect(hasFreshCheckoutContext(started + CHECKOUT_CONTEXT_MAX_AGE_MS, storage)).toBe(true);
    expect(hasFreshCheckoutContext(started + CHECKOUT_CONTEXT_MAX_AGE_MS + 1, storage)).toBe(false);
    expect(hasFreshCheckoutContext(started - 1, storage)).toBe(false);
  });

  it("survives a throwing storage without granting context", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => markCheckoutStarted(1, throwing)).not.toThrow();
    expect(() => clearCheckoutStarted(throwing)).not.toThrow();
    expect(hasFreshCheckoutContext(1, throwing)).toBe(false);
  });
});

describe("resolveCheckoutSuccessView", () => {
  it("server-side confirmation always wins", () => {
    expect(
      resolveCheckoutSuccessView({
        confirmed: true,
        hasReturnTo: false,
        hasCheckoutContext: false,
      }),
    ).toBe("confirmed");
  });

  it("checkout context (marker or returnTo) yields confirming, never completion", () => {
    expect(
      resolveCheckoutSuccessView({
        confirmed: false,
        hasReturnTo: true,
        hasCheckoutContext: false,
      }),
    ).toBe("confirming");
    expect(
      resolveCheckoutSuccessView({
        confirmed: false,
        hasReturnTo: false,
        hasCheckoutContext: true,
      }),
    ).toBe("confirming");
  });

  it("a direct visit resolves to no_context", () => {
    expect(
      resolveCheckoutSuccessView({
        confirmed: false,
        hasReturnTo: false,
        hasCheckoutContext: false,
      }),
    ).toBe("no_context");
  });
});
