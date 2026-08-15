import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SPIKE_ROOT = join(fileURLToPath(new URL("..", import.meta.url)));

describe("manual live proof gate", () => {
  it("prints BLOCKED when CURSOR_API_KEY is absent", () => {
    const env = { ...process.env };
    delete env.CURSOR_API_KEY;
    const result = spawnSync("bun", ["src/runManualProof.ts"], {
      cwd: SPIKE_ROOT,
      env,
      encoding: "utf8",
    });
    expect(result.stdout).toContain("SDK LIVE PROOF: BLOCKED — CURSOR_API_KEY NOT PROVIDED");
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("CURSOR_API_KEY=");
  });

  it("prints BLOCKED when the authorize flag is missing even if a key is present", () => {
    const env = { ...process.env };
    env.CURSOR_API_KEY = "cursor-synthetic-gate-test-key-not-real";
    const result = spawnSync("bun", ["src/runManualProof.ts"], {
      cwd: SPIKE_ROOT,
      env,
      encoding: "utf8",
    });
    expect(result.stdout).toContain("SDK LIVE PROOF: BLOCKED — pass --authorize-live-proof");
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("cursor-synthetic-gate-test-key-not-real");
    expect(result.stderr).not.toContain("cursor-synthetic-gate-test-key-not-real");
  });
});
