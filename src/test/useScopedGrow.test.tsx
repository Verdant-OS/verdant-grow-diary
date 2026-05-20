/**
 * Unit tests for the shared useScopedGrow hook.
 *
 * - Returns scoped grow when URL growId matches a loaded grow.
 * - Returns fallback (no name, no backHref, isValidScopedGrow=false) when
 *   growId is present but not in the loaded grows.
 * - Returns null values when no growId param is present.
 * - Does not introduce ai-coach / device-control / service_role surface.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { useScopedGrow } from "@/hooks/useScopedGrow";

const ROOT = resolve(__dirname, "../..");
const HOOK_SRC = readFileSync(resolve(ROOT, "src/hooks/useScopedGrow.ts"), "utf8");

// Mock the grows store so the hook resolves against a known set.
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [
      { id: "grow-1", name: "Blue Dream" },
      { id: "grow-2", name: "OG Kush" },
    ],
  }),
}));

const wrapperFor = (search: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[`/anywhere${search}`]}>{children}</MemoryRouter>;
  };

describe("useScopedGrow", () => {
  it("returns scoped grow when URL growId matches a loaded grow", () => {
    const { result } = renderHook(() => useScopedGrow(), {
      wrapper: wrapperFor("?growId=grow-1"),
    });
    expect(result.current.urlGrowId).toBe("grow-1");
    expect(result.current.scopedGrow?.id).toBe("grow-1");
    expect(result.current.scopedGrowName).toBe("Blue Dream");
    expect(result.current.isValidScopedGrow).toBe(true);
    expect(result.current.backHref).toBe("/grows/grow-1");
  });

  it("returns fallback values when growId is invalid", () => {
    const { result } = renderHook(() => useScopedGrow(), {
      wrapper: wrapperFor("?growId=unknown"),
    });
    expect(result.current.urlGrowId).toBe("unknown");
    expect(result.current.scopedGrow).toBeNull();
    expect(result.current.scopedGrowName).toBeNull();
    expect(result.current.isValidScopedGrow).toBe(false);
    expect(result.current.backHref).toBeUndefined();
  });

  it("returns null/undefined values when no growId param is present", () => {
    const { result } = renderHook(() => useScopedGrow(), {
      wrapper: wrapperFor(""),
    });
    expect(result.current.urlGrowId).toBeNull();
    expect(result.current.scopedGrow).toBeNull();
    expect(result.current.scopedGrowName).toBeNull();
    expect(result.current.isValidScopedGrow).toBe(false);
    expect(result.current.backHref).toBeUndefined();
  });

  it("source surface is safe (no ai-coach / device-control / service_role)", () => {
    expect(HOOK_SRC).not.toMatch(/ai-coach|ai_coach/);
    expect(HOOK_SRC).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
  });
});
