import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const VALIDATOR_SOURCE = readFileSync(
  resolve(__dirname, "../../scripts/validate-static-route-head-fidelity.mjs"),
  "utf8",
);

describe("static route head-fidelity CLI wiring", () => {
  it("normalizes the CLI entrypoint path before comparing it with import.meta.url", () => {
    expect(VALIDATOR_SOURCE).toContain('import { pathToFileURL } from "node:url";');
    expect(VALIDATOR_SOURCE).toContain(
      "import.meta.url === pathToFileURL(resolve(process.argv[1])).href",
    );
  });
});
