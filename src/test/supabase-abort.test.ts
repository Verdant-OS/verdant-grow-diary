import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyPostgrestAbortSignal,
  isSupabaseAbortError,
  rethrowIfAbortError,
} from "@/lib/supabaseAbort";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("isSupabaseAbortError / rethrowIfAbortError", () => {
  it("detects DOMException AbortError, TimeoutError, and ABORT_ERR", () => {
    expect(isSupabaseAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isSupabaseAbortError(new DOMException("timeout", "TimeoutError"))).toBe(true);
    expect(isSupabaseAbortError({ name: "AbortError" })).toBe(true);
    expect(isSupabaseAbortError({ code: "ABORT_ERR" })).toBe(true);
    expect(
      isSupabaseAbortError({
        hint: "The request was aborted locally via the provided AbortSignal.",
      }),
    ).toBe(true);
    expect(
      isSupabaseAbortError({
        message: "The user aborted a request.",
        status: 0,
      }),
    ).toBe(true);
  });

  it("does not treat Postgres aborted-transaction errors as client cancel", () => {
    expect(
      isSupabaseAbortError({
        message: "current transaction is aborted due to a database error",
        code: "25P02",
      }),
    ).toBe(false);
    expect(
      isSupabaseAbortError({
        message: "current transaction is aborted, commands ignored until end of transaction block",
      }),
    ).toBe(false);
    expect(isSupabaseAbortError({ message: "network down" })).toBe(false);
    expect(isSupabaseAbortError(null)).toBe(false);
  });

  it("rethrows abort-shaped errors and leaves others alone", () => {
    expect(() => rethrowIfAbortError({ name: "AbortError" })).toThrow(DOMException);
    expect(() => rethrowIfAbortError({ message: "permission denied" })).not.toThrow();
    expect(() =>
      rethrowIfAbortError({
        message: "current transaction is aborted due to a database error",
        code: "25P02",
      }),
    ).not.toThrow();
  });
});

describe("applyPostgrestAbortSignal", () => {
  it("calls builder.abortSignal when present", () => {
    const ac = new AbortController();
    const seen: AbortSignal[] = [];
    const builder = {
      abortSignal(signal: AbortSignal) {
        seen.push(signal);
        return { ...builder, tagged: true };
      },
    };
    const out = applyPostgrestAbortSignal(builder, ac.signal);
    expect(seen).toEqual([ac.signal]);
    expect(out).toMatchObject({ tagged: true });
  });

  it("returns the builder unchanged when abortSignal is missing (test doubles)", () => {
    const builder = { then: () => {} };
    expect(applyPostgrestAbortSignal(builder, new AbortController().signal)).toBe(builder);
  });

  it("returns the builder unchanged when signal is undefined", () => {
    const builder = { abortSignal: () => ({ ok: true }) };
    expect(applyPostgrestAbortSignal(builder, undefined)).toBe(builder);
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

  it("each priority reader uses applyPostgrestAbortSignal", () => {
    for (const f of directAbortFiles) {
      const src = read(f);
      expect(src, f).toMatch(/applyPostgrestAbortSignal/);
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
      expect(src.indexOf("rethrowIfAbortError")).toBeLessThan(src.indexOf("return data ?? []"));
    }
  });

  it("receipt service rethrows abort instead of ok:false empty coverage", () => {
    const src = read("src/lib/phenoEvidenceReceiptService.ts");
    expect(src).toMatch(/rethrowIfAbortError\(error\)/);
    expect(src).toMatch(/signal\?: AbortSignal/);
    expect(src).toMatch(/applyPostgrestAbortSignal/);
  });
});
