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
  });
});
