import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

// Keep the dependency-free Node behavior suites in the existing Vitest shards.
// This spawns only local fixture tests; it never calls an agent or a network API.
it("passes the Sentinel routing and journal behavior suites", () => {
  const output = execFileSync(
    "node",
    [
      "--test",
      "--test-reporter=tap",
      "scripts/sentinel-handoff.test.mjs",
      "scripts/sentinel-handoff-journal.test.mjs",
    ],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
  );
  expect(output).toContain("# fail 0");
  expect(output).toContain("# skipped 0");
}, 30_000);
