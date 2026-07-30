import { describe, expect, it, vi } from "vitest";

import {
  createResilientSessionStorage,
  type SessionStorageLike,
} from "@/lib/resilientSessionStorage";

function memoryStorage(seed: Record<string, string> = {}): SessionStorageLike {
  const values = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("resilient session storage", () => {
  it("does not access browser storage until the auth client asks for a value", () => {
    const resolveStorage = vi.fn(() => memoryStorage());
    createResilientSessionStorage(resolveStorage);

    expect(resolveStorage).not.toHaveBeenCalled();
  });

  it("uses session storage normally when it is available", () => {
    const primary = memoryStorage();
    const storage = createResilientSessionStorage(() => primary);

    storage.setItem("token", "current");
    expect(storage.getItem("token")).toBe("current");

    storage.removeItem("token");
    expect(storage.getItem("token")).toBeNull();
  });

  it("keeps auth state in page memory when the session storage getter is blocked", () => {
    const resolveStorage = vi.fn(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });
    const storage = createResilientSessionStorage(resolveStorage);

    expect(() => storage.setItem("token", "temporary")).not.toThrow();
    expect(storage.getItem("token")).toBe("temporary");

    storage.removeItem("token");
    expect(storage.getItem("token")).toBeNull();
    expect(resolveStorage).toHaveBeenCalledTimes(1);
  });

  it("does not return a stale durable value after a write failure", () => {
    const primary = memoryStorage({ token: "stale" });
    const getItem = vi.spyOn(primary, "getItem");
    vi.spyOn(primary, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    const storage = createResilientSessionStorage(() => primary);

    expect(storage.getItem("token")).toBe("stale");

    storage.setItem("token", "current");
    expect(storage.getItem("token")).toBe("current");
    expect(getItem).toHaveBeenCalledTimes(1);
  });
});
