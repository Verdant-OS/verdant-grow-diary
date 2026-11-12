/**
 * Typecheck gate heap contract (audit 2026-11-11).
 *
 * `tsc -p tsconfig.json --noEmit` peaks near 4.5 GB on this tree (measured with
 * --extendedDiagnostics at c03ea6fd: 8,310 files, 4,488,022K). Node's default
 * old-space limit is about 2 GB in a small container and about 4 GB on a
 * 16 GB runner, so the bare command aborted with "heap out of memory" in the
 * first and ran within a few hundred MB of the limit in the second. Both the
 * `typecheck` script and the pre-commit lint-staged step must give the
 * compiler an explicit ceiling.
 *
 * Asserts on the resolved package manifest, not on its source text.
 */
import { describe, expect, it } from "vitest";
import manifest from "../../package.json";

const MIN_HEAP_MB = 6144;

function heapMb(command: string): number | null {
  const match = /--max-old-space-size=(\d+)/.exec(command);
  return match ? Number(match[1]) : null;
}

describe("typecheck gate heap contract", () => {
  it("runs the project typecheck with an explicit heap ceiling", () => {
    const command = manifest.scripts.typecheck;
    expect(command).toContain("-p tsconfig.json --noEmit");
    expect(command).not.toContain("--skipLibCheck");
    expect(heapMb(command)).toBeGreaterThanOrEqual(MIN_HEAP_MB);
  });

  it("gives the pre-commit typecheck the same ceiling", () => {
    const steps: string[] = manifest["lint-staged"]["*.{ts,tsx}"];
    const typecheck = steps.find((step) => step.includes("--noEmit"));
    expect(typecheck).toBeDefined();
    expect(typecheck).toContain("-p tsconfig.json");
    expect(heapMb(typecheck ?? "")).toBeGreaterThanOrEqual(MIN_HEAP_MB);
    expect(heapMb(typecheck ?? "")).toBe(heapMb(manifest.scripts.typecheck));
  });
});
