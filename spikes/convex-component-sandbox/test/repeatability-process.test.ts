// @vitest-environment node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("P9 reproduces the same remaining sequence in a fresh process", () => {
  const root = resolve(__dirname, "..");
  const result = spawnSync("bun", ["run", "test:repeatability-worker"], {
    cwd: root,
    encoding: "utf8",
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("P9_RESULT=[4,3,2,1,0,0]");
});
