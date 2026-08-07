import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runValidator() {
  return spawnSync(process.execPath, ["scripts/validate-grow-walk-plugin.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("Verdant Grow Walk plugin package", () => {
  it("passes the no-dependency package validator", () => {
    const result = runValidator();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/Grow Walk plugin package valid/);
  });
});
