/**
 * Pins the invariants of the Full Vitest Suite PR gate
 * (.github/workflows/vitest-full-suite-pr-gate.yml).
 *
 * On pull requests the ENTIRE src/test suite is gated by ci.yml's 32 required
 * shards (256 isolated partitions). This 16-batch duplicate runs in the merge
 * queue and on deploy-branch pushes only, so it no longer competes for PR runner
 * capacity. A future edit that shrinks the matrix, drops the merge-queue trigger,
 * or stops invoking the batched runner would weaken the queue-time check; these
 * static assertions fail if that happens.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WF = readFileSync(
  resolve(__dirname, "../../.github/workflows/vitest-full-suite-pr-gate.yml"),
  "utf8",
);

describe("Full Vitest Suite PR gate workflow", () => {
  it("runs in the merge queue but not on pull_request", () => {
    expect(WF).not.toMatch(/^\s*pull_request\s*:/m);
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
