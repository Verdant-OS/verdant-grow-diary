import { afterEach, describe, expect, it, vi } from "vitest";
import { newQuickLogSaveKey } from "@/lib/quickLogIdempotencyKey";

function expectValidQuickLogSaveKey(key: string) {
  expect(key).toMatch(/^quicklog-v2-/);
  expect(key.length).toBeGreaterThanOrEqual(8);
  expect(key.length).toBeLessThanOrEqual(200);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newQuickLogSaveKey", () => {
  it("uses randomUUID when the browser provides it", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "browser-uuid" });

    expect(newQuickLogSaveKey()).toBe("quicklog-v2-browser-uuid");
  });

  it("uses getRandomValues when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });

    expect(newQuickLogSaveKey()).toBe(`quicklog-v2-${"ab".repeat(16)}`);
  });

  it("returns distinct valid fallback keys when Web Crypto is absent", () => {
    vi.stubGlobal("crypto", undefined);

    const first = newQuickLogSaveKey();
    const second = newQuickLogSaveKey();

    expectValidQuickLogSaveKey(first);
    expectValidQuickLogSaveKey(second);
    expect(second).not.toBe(first);
  });

  it("falls back when a partial Web Crypto implementation has no randomness APIs", () => {
    vi.stubGlobal("crypto", {});

    expectValidQuickLogSaveKey(newQuickLogSaveKey());
  });

  it("uses getRandomValues when randomUUID throws", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        throw new Error("unavailable");
      },
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xcd);
        return bytes;
      },
    });

    expect(newQuickLogSaveKey()).toBe(`quicklog-v2-${"cd".repeat(16)}`);
  });

  it("falls back when a partial Web Crypto implementation rejects randomness", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: () => {
        throw new Error("unavailable");
      },
    });

    expectValidQuickLogSaveKey(newQuickLogSaveKey());
  });
});
