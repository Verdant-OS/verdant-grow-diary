import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOWS_DIR = path.resolve(__dirname, "../../.github/workflows");

function workflowFiles(): string[] {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
}

describe("GitHub Actions reference policy", () => {
  it("pins every external action to an immutable commit SHA", () => {
    const violations: string[] = [];

    for (const fileName of workflowFiles()) {
      const lines = fs
        .readFileSync(path.join(WORKFLOWS_DIR, fileName), "utf8")
        .replace(/\r\n?/g, "\n")
        .split("\n");

      lines.forEach((line, index) => {
        const match = line.match(/^\s*uses:\s*([^#]+?)(?:\s+#.*)?$/);
        if (!match) return;

        const reference = match[1].trim().replace(/^["']|["']$/g, "");
        if (reference.startsWith("./")) return;

        const pinned = reference.startsWith("docker://")
          ? /@sha256:[0-9a-f]{64}$/i.test(reference)
          : /@[0-9a-f]{40}$/i.test(reference);

        if (!pinned) {
          violations.push(`${fileName}:${index + 1} ${reference}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
