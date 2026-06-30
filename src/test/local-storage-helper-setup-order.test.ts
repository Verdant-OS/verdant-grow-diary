/**
 * Setup-order invariant: src/test/setup.ts calls
 * ensureLocalStorageForTest() at module load, BEFORE any test body
 * executes. This test proves that by the time an `it` runs:
 *   - window.localStorage exists
 *   - globalThis.localStorage exists
 *   - the helper functions round-trip values correctly
 *   - clearLocalStorageForTest() empties storage
 *
 * If this test ever fails, src/test/setup.ts is not being loaded as
 * the global Vitest setup file, and every test suite that relies on
 * the shim is at risk on jsdom environments that lack a built-in
 * localStorage (notably Windows + Node 26).
 */

import { describe, expect, it } from "vitest";
import {
  clearLocalStorageForTest,
  ensureLocalStorageForTest,
  getLocalStorageItemForTest,
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

describe("localStorage test helper — setup order", () => {
  it("window.localStorage exists before this test body runs", () => {
    expect(typeof window).toBe("object");
    expect(window.localStorage).toBeDefined();
    expect(typeof window.localStorage.setItem).toBe("function");
  });

  it("globalThis.localStorage exists before this test body runs", () => {
    // jsdom mirrors window.localStorage onto globalThis as `localStorage`.
    const ls = (globalThis as unknown as { localStorage?: Storage })
      .localStorage;
    expect(ls).toBeDefined();
    expect(typeof ls!.getItem).toBe("function");
  });

  it("helper round-trips a value via set/get", () => {
    ensureLocalStorageForTest();
    setLocalStorageItemForTest("verdant.helper-proof.key", "v1");
    expect(getLocalStorageItemForTest("verdant.helper-proof.key")).toBe("v1");
  });

  it("removeLocalStorageItemForTest clears a single key", () => {
    setLocalStorageItemForTest("verdant.helper-proof.removable", "x");
    removeLocalStorageItemForTest("verdant.helper-proof.removable");
    expect(getLocalStorageItemForTest("verdant.helper-proof.removable")).toBe(
      null,
    );
  });

  it("clearLocalStorageForTest empties storage", () => {
    setLocalStorageItemForTest("verdant.helper-proof.a", "1");
    setLocalStorageItemForTest("verdant.helper-proof.b", "2");
    clearLocalStorageForTest();
    expect(getLocalStorageItemForTest("verdant.helper-proof.a")).toBe(null);
    expect(getLocalStorageItemForTest("verdant.helper-proof.b")).toBe(null);
  });
});
