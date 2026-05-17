import { describe, it, expect, vi } from "vitest";
import { verifySupabaseEnv, assertSupabaseEnv } from "./verifyEnv";

const validEnv = {
  VITE_SUPABASE_URL: "https://abc123def456ghi789jk.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test.test.test",
} as const;

describe("verifySupabaseEnv", () => {
  it("returns ok when all required vars are valid", () => {
    const result = verifySupabaseEnv(validEnv);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns about missing optional project id", () => {
    const result = verifySupabaseEnv(validEnv);
    expect(result.warnings.some((w) => w.includes("PROJECT_ID"))).toBe(true);
  });

  it("flags missing required variables", () => {
    const result = verifySupabaseEnv({});
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("flags invalid URL format", () => {
    const result = verifySupabaseEnv({
      VITE_SUPABASE_URL: "not-a-url",
      VITE_SUPABASE_PUBLISHABLE_KEY: validEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("VITE_SUPABASE_URL"))).toBe(
      true
    );
  });

  it("flags invalid publishable key format", () => {
    const result = verifySupabaseEnv({
      VITE_SUPABASE_URL: validEnv.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: "too-short",
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("VITE_SUPABASE_PUBLISHABLE_KEY"))
    ).toBe(true);
  });
});

describe("assertSupabaseEnv", () => {
  it("throws in dev when env is invalid", () => {
    expect(() => assertSupabaseEnv({}, true)).toThrow(
      /Required Supabase environment variables/
    );
  });

  it("does not throw in production (only logs)", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertSupabaseEnv({}, false)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Required Supabase environment variables")
    );
    consoleSpy.mockRestore();
  });

  it("does not throw when env is valid", () => {
    expect(() => assertSupabaseEnv(validEnv, true)).not.toThrow();
  });
});
