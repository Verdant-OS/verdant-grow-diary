/**
 * localStorageTestHelper — TEST-ONLY portability helpers for localStorage.
 *
 * Some local jsdom environments (notably Node 26 + jsdom on Windows) do
 * not expose `window.localStorage` reliably, which causes spurious test
 * failures when a `beforeEach` calls `window.localStorage.clear()`
 * directly. These helpers use the real `window.localStorage` when
 * available, and otherwise install a minimal in-memory Storage shim
 * scoped to the current test environment.
 *
 * Rules:
 *  - TEST ONLY. Never import from `src/lib/*`, `src/components/*`,
 *    `src/hooks/*`, or any production module.
 *  - Shim is installed only when real localStorage is missing.
 *  - Real storage semantics are preserved (string coercion, null on miss).
 *  - Never swallows assertion-relevant failures; helpers throw if the
 *    storage cannot be acquired or installed.
 */

class InMemoryStorageShim implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(String(key), String(value));
  }
}

function ensureLocalStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error(
      "[localStorageTestHelper] window is not defined; ensure vitest is running with jsdom.",
    );
  }
  try {
    const existing = (window as unknown as { localStorage?: Storage }).localStorage;
    if (existing && typeof existing.setItem === "function") {
      return existing;
    }
  } catch {
    // fall through to shim install
  }
  const shim = new InMemoryStorageShim();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    writable: true,
    value: shim,
  });
  return shim;
}

export function clearLocalStorageForTest(): void {
  ensureLocalStorage().clear();
}

export function setLocalStorageItemForTest(key: string, value: string): void {
  ensureLocalStorage().setItem(key, value);
}

export function getLocalStorageItemForTest(key: string): string | null {
  return ensureLocalStorage().getItem(key);
}

export function removeLocalStorageItemForTest(key: string): void {
  ensureLocalStorage().removeItem(key);
}

/** Force-install the shim if real storage is unavailable. Idempotent. */
export function ensureLocalStorageForTest(): Storage {
  return ensureLocalStorage();
}

/**
 * Resolve the object that owns a storage method in this test runtime.
 *
 * The in-memory fallback owns its methods directly, while some native/jsdom
 * Storage implementations expose a wrapper object whose methods live on its
 * prototype. Tests that need a controlled storage rejection must spy on this
 * owner so the production access path cannot bypass the spy.
 */
export function getLocalStorageMethodOwnerForTest(
  storage: Storage,
  method: "getItem" | "setItem",
): Storage {
  if (Object.prototype.hasOwnProperty.call(storage, method)) return storage;
  const prototype = Object.getPrototypeOf(storage);
  if (!prototype || typeof prototype[method] !== "function") {
    throw new Error(`[localStorageTestHelper] Storage method ${method} is unavailable.`);
  }
  return prototype as Storage;
}
