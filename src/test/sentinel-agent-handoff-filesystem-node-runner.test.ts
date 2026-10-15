import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("passes the Sentinel filesystem race regressions", () => {
  const output = execFileSync(
    "node",
    ["--test", "--test-reporter=tap", "scripts/sentinel-handoff-filesystem-race.test.mjs"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
  );
  expect(output).toContain("# fail 0");
  expect(output).toContain("# skipped 0");
}, 30_000);
