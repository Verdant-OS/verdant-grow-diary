/**
 * Pure unit tests for one-shot checkout return-to session persistence.
 *
 * Complements checkout-return-to.test.ts (sanitize allowlist). This file
 * covers save/consume storage lifecycle: sanitization on write, destructive
 * consume, and storage-failure soft handling.
 */
import { describe, expect, it } from "vitest";
import {
  CHECKOUT_RETURN_TO_STORAGE_KEY,
  consumeCheckoutReturnTo,
  saveCheckoutReturnTo,
} from "@/lib/checkoutReturnToSession";

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    // test helpers
    raw: map,
  };
}

describe("saveCheckoutReturnTo", () => {
  it("stores a sanitized allowlisted path", () => {
    const storage = memoryStorage();
    saveCheckoutReturnTo("/pheno-hunts/new", { storage });
    expect(storage.getItem(CHECKOUT_RETURN_TO_STORAGE_KEY)).toBe("/pheno-hunts/new");
  });

  it("rejects unsafe values and clears any prior key", () => {
    const storage = memoryStorage({
      [CHECKOUT_RETURN_TO_STORAGE_KEY]: "/dashboard",
    });
    saveCheckoutReturnTo("https://evil.com", { storage });
    expect(storage.getItem(CHECKOUT_RETURN_TO_STORAGE_KEY)).toBeNull();

    saveCheckoutReturnTo("//evil.com/pheno-hunts/new", { storage });
    expect(storage.getItem(CHECKOUT_RETURN_TO_STORAGE_KEY)).toBeNull();

    saveCheckoutReturnTo(null, { storage });
    expect(storage.getItem(CHECKOUT_RETURN_TO_STORAGE_KEY)).toBeNull();
  });

  it("no-ops when storage is null", () => {
    expect(() => saveCheckoutReturnTo("/dashboard", { storage: null })).not.toThrow();
  });

  it("swallows storage setItem failures", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => saveCheckoutReturnTo("/dashboard", { storage })).not.toThrow();
  });
});

describe("consumeCheckoutReturnTo", () => {
  it("returns the sanitized path and deletes the key (one-shot)", () => {
    const storage = memoryStorage({
      [CHECKOUT_RETURN_TO_STORAGE_KEY]: "/pheno-hunts/new",
    });
    expect(consumeCheckoutReturnTo({ storage })).toBe("/pheno-hunts/new");
    expect(storage.getItem(CHECKOUT_RETURN_TO_STORAGE_KEY)).toBeNull();
    // Second consume cannot resurrect the prior intent.
    expect(consumeCheckoutReturnTo({ storage })).toBeNull();
  });

  it("re-sanitizes values that snuck into storage outside the save path", () => {
    const storage = memoryStorage({
      [CHECKOUT_RETURN_TO_STORAGE_KEY]: "https://evil.com",
    });
    expect(consumeCheckoutReturnTo({ storage })).toBeNull();
    // Still destructive even when the value is rejected.
    expect(storage.getItem(CHECKOUT_RETURN_TO_STORAGE_KEY)).toBeNull();
  });

  it("returns null when storage is empty or null", () => {
    expect(consumeCheckoutReturnTo({ storage: memoryStorage() })).toBeNull();
    expect(consumeCheckoutReturnTo({ storage: null })).toBeNull();
  });

  it("returns null when getItem throws, without propagating", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(consumeCheckoutReturnTo({ storage })).toBeNull();
  });

  it("still returns the sanitized value when removeItem throws after read", () => {
    let value: string | null = "/dashboard";
    const storage = {
      getItem: () => value,
      setItem: (_k: string, v: string) => {
        value = v;
      },
      removeItem: () => {
        throw new Error("blocked-remove");
      },
    };
    expect(consumeCheckoutReturnTo({ storage })).toBe("/dashboard");
  });
});
