import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifySupabaseEnv, assertSupabaseEnv } from "./verifyEnv";

describe("verifySupabaseEnv", () => {
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    vi.stubGlobal("import", { meta: { env: { DEV: true } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok when all required vars are valid", () => {
    vi.stubGlobal("import", {
      meta: {
        env: {
          DEV: true,
          VITE_SUPABASE_URL: "https://abc123def456ghi789jk.supabase.co",
          VITE_SUPABASE_PUBLISHABLE_KEY:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test",
        },
      },
    });
    // Re-import to pick up fresh env
    const { verifySupabaseEnv } = require("./verifyEnv");
    const result = verifySupabaseEnv();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("flags missing required variables", () => {
    vi.stubGlobal("import", {
      meta: {
        env: {
          DEV: true,
          VITE_SUPABASE_URL: undefined,
          VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
        },
      },
    });
    const { verifySupabaseEnv } = require("./verifyEnv");
    const result = verifySupabaseEnv();
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("flags invalid URL format", () => {
    vi.stubGlobal("import", {
      meta: {
        env: {
          DEV: true,
          VITE_SUPABASE_URL: "not-a-url",
          VITE_SUPABASE_PUBLISHABLE_KEY:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test",
        },
      },
    });
    const { verifySupabaseEnv } = require("./verifyEnv");
    const result = verifySupabaseEnv();
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("VITE_SUPABASE_URL"))).toBe(
      true
    );
  });

  it("flags invalid publishable key format", () => {
    vi.stubGlobal("import", {
      meta: {
        env: {
          DEV: true,
          VITE_SUPABASE_URL: "https://abc123def456ghi789jk.supabase.co",
          VITE_SUPABASE_PUBLISHABLE_KEY: "too-short",
        },
      },
    });
    const { verifySupabaseEnv } = require("./verifyEnv");
    const result = verifySupabaseEnv();
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("VITE_SUPABASE_PUBLISHABLE_KEY"))
    ).toBe(true);
  });
});

describe("assertSupabaseEnv", () => {
  it("throws in dev when env is invalid", () => {
    vi.stubGlobal("import", {
      meta: {
        env: {
          DEV: true,
          VITE_SUPABASE_URL: undefined,
          VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
        },
      },
    });
    const { assertSupabaseEnv } = require("./verifyEnv");
    expect(() => assertSupabaseEnv()).toThrow(
      /Required Supabase environment variables/
    );
  });

  it("does not throw in production (only logs)", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("import", {
      meta: {
        env: {
          DEV: false,
          PROD: true,
          VITE_SUPABASE_URL: undefined,
          VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
        },
      },
    });
    const { assertSupabaseEnv } = require("./verifyEnv");
    expect(() => assertSupabaseEnv()).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Required Supabase environment variables")
    );
    consoleSpy.mockRestore();
  });
});
