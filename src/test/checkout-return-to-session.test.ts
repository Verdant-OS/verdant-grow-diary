import { describe, expect, it } from "vitest";
import {
  CHECKOUT_RETURN_TO_STORAGE_KEY,
  consumeCheckoutReturnTo,
  saveCheckoutReturnTo,
} from "@/lib/checkoutReturnToSession";

function createMemoryStorage(initial: string | null = null) {
  let stored = initial;
  return {
    storage: {
      getItem: (key: string) =>
        key === CHECKOUT_RETURN_TO_STORAGE_KEY ? stored : null,
      setItem: (key: string, value: string) => {
        if (key === CHECKOUT_RETURN_TO_STORAGE_KEY) stored = value;
      },
      removeItem: (key: string) => {
        if (key === CHECKOUT_RETURN_TO_STORAGE_KEY) stored = null;
      },
    },
    read: () => stored,
  };
}

describe("checkout return-to session", () => {
  it("saves and consumes a safe destination exactly once", () => {
    const memory = createMemoryStorage();

    saveCheckoutReturnTo("/dashboard", { storage: memory.storage });
    expect(memory.read()).toBe("/dashboard");

    expect(consumeCheckoutReturnTo({ storage: memory.storage })).toBe("/dashboard");
    expect(memory.read()).toBeNull();
    expect(consumeCheckoutReturnTo({ storage: memory.storage })).toBeNull();
  });

  it("destroys a tampered stored value even when sanitization rejects it", () => {
    const memory = createMemoryStorage("https://evil.example/steal");

    expect(consumeCheckoutReturnTo({ storage: memory.storage })).toBeNull();
    expect(memory.read()).toBeNull();
  });

  it("fails closed when storage cannot be read", () => {
    let removeCalls = 0;
    const storage = {
      getItem: () => {
        throw new Error("blocked-read");
      },
      setItem: () => undefined,
      removeItem: () => {
        removeCalls += 1;
      },
    };

    expect(consumeCheckoutReturnTo({ storage })).toBeNull();
    expect(removeCalls).toBe(0);
  });

  it("does not report a destination as consumed when storage removal fails", () => {
    let stored: string | null = "/dashboard";
    const storage = {
      getItem: (key: string) =>
        key === CHECKOUT_RETURN_TO_STORAGE_KEY ? stored : null,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
      removeItem: () => {
        throw new Error("blocked-remove");
      },
    };

    expect(consumeCheckoutReturnTo({ storage })).toBeNull();
    expect(stored).toBe("/dashboard");
  });
});
