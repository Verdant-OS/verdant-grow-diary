import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");
const USES_LINE = /^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/;
const FULL_COMMIT_SHA = /^[a-f0-9]{40}$/i;

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

describe("GitHub Actions immutable pinning", () => {
  it("pins every external action or reusable workflow to a full commit SHA", () => {
    const unpinned: string[] = [];

    for (const file of workflowFiles()) {
      const lines = readFileSync(join(WORKFLOWS_DIR, file), "utf8").split(/\r?\n/);

      lines.forEach((line, index) => {
        const match = line.match(USES_LINE);
        if (!match) return;

        const reference = match[1];
        if (reference.startsWith("./") || reference.startsWith("docker://")) return;

        const separator = reference.lastIndexOf("@");
        const ref = separator >= 0 ? reference.slice(separator + 1) : "";
        if (!FULL_COMMIT_SHA.test(ref)) {
          unpinned.push(`${file}:${index + 1} (${reference})`);
        }
      });
    }

    expect(workflowFiles().length).toBeGreaterThan(0);
    expect(unpinned).toEqual([]);
  });
});
