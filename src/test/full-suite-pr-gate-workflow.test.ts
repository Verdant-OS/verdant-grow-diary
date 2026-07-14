/**
 * Pins the invariants of the Full Vitest Suite PR gate
 * (.github/workflows/vitest-full-suite-pr-gate.yml).
 *
 * This workflow is what makes the ENTIRE src/test suite a required PR check.
 * A future edit that quietly drops the pull_request trigger, shrinks the
 * matrix, or stops invoking the batched runner would re-open the gap where
 * full-suite regressions land invisibly (targeted CI steps miss them). These
 * static assertions fail if the gate is weakened.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WF = readFileSync(
  resolve(__dirname, "../../.github/workflows/vitest-full-suite-pr-gate.yml"),
  "utf8",
);

describe("Full Vitest Suite PR gate workflow", () => {
  it("runs on pull_request and the merge queue", () => {
    expect(WF).toMatch(/^\s*pull_request\s*:/m);
    expect(WF).toMatch(/^\s*merge_group\s*:/m);
  });

  it("also runs on direct pushes to the default branch (surfaces bot/direct pushes)", () => {
    expect(WF).toMatch(/push\s*:/);
    expect(WF).toMatch(/branches:\s*\[[^\]]*verdant-grow-diary/);
  });

  it("runs all 16 batches [0..15] so no partition is skipped", () => {
    const m = WF.match(/batch:\s*\[([^\]]*)\]/);
    expect(m, "matrix batch list must be present").toBeTruthy();
    const nums = (m?.[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number);
    expect(nums).toHaveLength(16);
    for (let i = 0; i < 16; i++) expect(nums).toContain(i);
  });

  it("invokes the memory-safe batched runner with full coverage settings", () => {
    expect(WF).toMatch(/scripts\/run-vitest-batches\.mjs/);
    expect(WF).toMatch(/--batches=16\b/);
    // per-file chunking + isolation is what keeps the full suite inside CI
    // memory limits; dropping it risks OOM and a silently-disabled gate.
    expect(WF).toMatch(/--chunk-size=1\b/);
    expect(WF).toMatch(/--isolate\b/);
  });

  it("uses the batch matrix var so each job runs a distinct partition", () => {
    expect(WF).toMatch(/--batch=\$\{\{\s*matrix\.batch\s*\}\}/);
  });
});
