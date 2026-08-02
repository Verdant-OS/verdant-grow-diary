import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isSupabaseAbortError, rethrowIfAbortError } from "@/lib/supabaseAbort";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("isSupabaseAbortError / rethrowIfAbortError", () => {
  it("detects DOMException AbortError and ABORT_ERR", () => {
    expect(isSupabaseAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isSupabaseAbortError({ name: "AbortError" })).toBe(true);
    expect(isSupabaseAbortError({ code: "ABORT_ERR" })).toBe(true);
    expect(isSupabaseAbortError({ hint: "aborted via AbortSignal" })).toBe(true);
    expect(isSupabaseAbortError({ message: "network down" })).toBe(false);
    expect(isSupabaseAbortError(null)).toBe(false);
  });

  it("rethrows abort-shaped errors and leaves others alone", () => {
    expect(() => rethrowIfAbortError({ name: "AbortError" })).toThrow(DOMException);
    expect(() => rethrowIfAbortError({ message: "permission denied" })).not.toThrow();
  });
});

describe("priority PostgREST readers wire AbortSignal", () => {
  const directAbortFiles = [
    "src/hooks/use-plants.ts",
    "src/hooks/use-tents.ts",
    "src/hooks/useAiDoctorSessionReviews.ts",
    "src/hooks/usePhenoEvidenceCaptureContext.ts",
    "src/lib/phenoEvidenceReceiptService.ts",
  ];

  it("each direct PostgREST reader calls .abortSignal", () => {
    for (const f of directAbortFiles) {
      const src = read(f);
      expect(src, f).toMatch(/\.abortSignal\(/);
      expect(src, f).toMatch(/rethrowIfAbortError/);
    }
  });

  it("packet hook forwards TanStack signal into the receipt loader", () => {
    const src = read("src/hooks/usePhenoEvidencePackets.ts");
    expect(src).toMatch(/queryFn: \(\{ signal \}\)/);
    expect(src).toMatch(/signal,/);
  });

  it("does not map abort to empty success arrays in catalog hooks", () => {
    for (const f of ["src/hooks/use-plants.ts", "src/hooks/use-tents.ts"]) {
      const src = read(f);
      expect(src).toMatch(/rethrowIfAbortError/);
      // abort must throw before empty return
      expect(src.indexOf("rethrowIfAbortError")).toBeLessThan(src.indexOf("return data ?? []"));
    }
  });

  it("receipt service rethrows abort instead of ok:false empty coverage", () => {
    const src = read("src/lib/phenoEvidenceReceiptService.ts");
    expect(src).toMatch(/rethrowIfAbortError\(error\)/);
    expect(src).toMatch(/signal\?: AbortSignal/);
  });
});
